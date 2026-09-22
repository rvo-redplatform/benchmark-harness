import { Tag } from "effect/Context";
import { millis } from "effect/Duration";
import type { Effect } from "effect/Effect";
import {
  catchTag,
  fail,
  gen,
  suspend,
  timeout,
  tryPromise,
} from "effect/Effect";
import type { Layer } from "effect/Layer";
import { effect, provide } from "effect/Layer";

import type {
  ModelMessage,
  ModelError,
  ModelOutput,
  ModelUsage,
} from "../harness/core";
import { ModelError as ModelErrorClass, MessageRole } from "../harness/core";
import { Model, stripVariantSuffix } from "../harness/model";
import type { GenerateConfig } from "../harness/model";
import { definedValues, isRecord } from "../internal/guards";
import type { RetryConfig } from "../runtime/retry";
import { rateLimitRetrySchedule, retrySalted } from "../runtime/retry";
import type { ProviderConfig } from "./provider-config";
interface ChatCompletionsRequest {
  readonly model: string;
  readonly messages: readonly {
    readonly role: "system" | "user" | "assistant" | "tool";
    readonly content: string;
  }[];
  readonly max_tokens?: number;
  readonly stream?: boolean;
}

interface ChatCompletionsResponse {
  readonly id: string;
  readonly object: string;
  readonly created: number;
  readonly model: string;
  readonly choices: readonly {
    readonly index: number;
    readonly message: {
      readonly role: "assistant";
      readonly content: string | null;
    };
    readonly finish_reason: "stop" | "length" | null;
  }[];
  readonly usage?: {
    readonly prompt_tokens: number;
    readonly completion_tokens: number;
    readonly total_tokens: number;
  };
}

export interface ChatCompletionsModelConfig {
  readonly model: string;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly sessionId?: string;
  readonly retry?: RetryConfig;
  readonly traceHeaders?: Readonly<Record<string, string>>;
  readonly authHeaderName?: string;
}

export interface ChatCompletionsModelService {
  readonly generate: (
    messages: readonly ModelMessage[],
    config: GenerateConfig
  ) => Effect<ModelOutput, ModelError>;
}

export class ChatCompletionsModel extends Tag(
  "@openrouter/bench-harness/chat-completions-model/ChatCompletionsModel"
)<ChatCompletionsModel, ChatCompletionsModelService>() {}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/u, "");
}

function modelMessagesToChatMessages(
  messages: readonly ModelMessage[]
): ChatCompletionsRequest["messages"] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  })) as ChatCompletionsRequest["messages"];
}

async function handleStreamingResponse(
  response: Response,
  stream: boolean,
  _startedAt: number
): Promise<ChatCompletionsResponse> {
  // Check if the response is actually streaming or JSON
  const contentType = response.headers.get("content-type") ?? "";
  
  // If the response is JSON (not streaming), parse it directly
  if (contentType.includes("application/json")) {
    const json: unknown = await response.json();
    if (!isRecord(json)) {
      throw new Error("Chat Completions response is not a valid JSON object");
    }
    if (!("choices" in json) || !Array.isArray(json.choices)) {
      throw new Error("Chat Completions response missing 'choices' array");
    }
    return json as unknown as ChatCompletionsResponse;
  }

  // If streaming, parse the stream line-by-line
  const text = await response.text();
  const lines = text.split("\n");
  let accumulatedContent = "";
  let finishReason: string | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.choices?.[0]?.delta?.content !== undefined) {
        accumulatedContent += event.choices[0].delta.content ?? "";
      }
      if (event.choices?.[0]?.finish_reason !== undefined) {
        finishReason = event.choices[0].finish_reason;
      }
    } catch {
      // ignore parse errors (non-JSON lines in the stream)
    }
  }

  return {
    id: "stream-" + Date.now(),
    object: "chat.completion",
    created: Date.now(),
    model: "",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: accumulatedContent || undefined,
        },
        finish_reason: finishReason,
      },
    ],
    usage: undefined,
  } as ChatCompletionsResponse;
}

function usageFromChatCompletions(
  usage: ChatCompletionsResponse["usage"]
): ModelUsage | undefined {
  if (usage === undefined) {
    return undefined;
  }
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

function chatCompletionsToModelOutput(
  response: ChatCompletionsResponse,
  startedAt: number
): ModelOutput {
  const choice = response.choices[0];
  if (choice === undefined) {
    throw new Error("Chat Completions response has no choices");
  }

  const content = choice.message.content ?? "";
  const generationTimeMs = Math.round(performance.now() - startedAt);

  return definedValues({
    completion: content,
    message: {
      role: MessageRole.Assistant,
      content,
    },
    usage: usageFromChatCompletions(response.usage),
    generationTimeMs,
    rawResponse: response as unknown as Record<string, unknown>,
    finishReason: choice.finish_reason,
  });
}

function makeRequest(
  config: ChatCompletionsModelConfig,
  messages: readonly ModelMessage[],
  generateConfig: GenerateConfig
): Effect<ModelOutput, ModelError> {
  return suspend(() => {
    const requestModel = generateConfig.endpointId ?? config.model;
    const body: ChatCompletionsRequest = {
      model: stripVariantSuffix(requestModel),
      messages: modelMessagesToChatMessages(messages),
      ...definedValues({
        max_tokens: generateConfig.maxTokens,
      }),
      stream: true,
    };

    const normalizedBase = normalizeBaseUrl(config.baseUrl);
    const url = normalizedBase.endsWith("/v1")
      ? `${normalizedBase}/chat/completions`
      : `${normalizedBase}/v1/chat/completions`;
    const authHeaderName = config.authHeaderName ?? "Authorization";
    const authHeaderValue =
      authHeaderName === "Authorization"
        ? `Bearer ${config.apiKey}`
        : config.apiKey;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      [authHeaderName]: authHeaderValue,
      ...config.traceHeaders,
    };

    const startedAt = performance.now();

    return tryPromise({
      try: async () => {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new ModelErrorClass({
            status: response.status,
            message: `Chat Completions request failed (${response.status}): ${errorText}`,
          });
        }

        const json = await handleStreamingResponse(
          response,
          true,
          startedAt
        );
        if (!isRecord(json)) {
          throw new ModelErrorClass({
            message: "Chat Completions response is not a valid JSON object",
          });
        }

        if (!("choices" in json) || !Array.isArray(json.choices)) {
          throw new ModelErrorClass({
            message: "Chat Completions response missing 'choices' array",
          });
        }

        return chatCompletionsToModelOutput(
          json as unknown as ChatCompletionsResponse,
          startedAt
        );
      },
      catch: (error) => {
        if (error instanceof ModelErrorClass) {
          return error;
        }
        return new ModelErrorClass({
          message:
            error instanceof Error
              ? error.message
              : "Chat Completions request failed",
        });
      },
    });
  });
}

function makeChatCompletionsLayer(
  config: ChatCompletionsModelConfig
): Layer<ChatCompletionsModel> {
  return effect(ChatCompletionsModel)(
    gen(function* () {
      return ChatCompletionsModel.of({
        generate: (messages, generateConfig) => {
          const requestAttempt = makeRequest(config, messages, generateConfig);

          const timeoutMs = generateConfig.timeoutMs;
          const timedAttempt =
            timeoutMs !== undefined && timeoutMs > 0
              ? requestAttempt.pipe(
                  timeout(millis(timeoutMs)),
                  catchTag("TimeoutException", () =>
                    fail(
                      new ModelErrorClass({
                        status: 408,
                        message: `Request timed out after ${timeoutMs}ms`,
                      })
                    )
                  )
                )
              : requestAttempt;

          return retrySalted(
            timedAttempt,
            rateLimitRetrySchedule(config.retry ?? {})
          );
        },
      });
    })
  );
}

export function makeChatCompletionsModelLayer(
  config: ChatCompletionsModelConfig
): Layer<Model> {
  const chatLayer = makeChatCompletionsLayer(config);

  return effect(Model)(
    gen(function* () {
      const chatModel = yield* ChatCompletionsModel;
      return Model.of({
        generate: (messages, generateConfig) =>
          chatModel.generate(messages, generateConfig),
      });
    })
  ).pipe(provide(chatLayer));
}

export const __internalMakeChatCompletionsLayer = makeChatCompletionsLayer;

export function chatCompletionsConfigFromProvider(
  model: string,
  provider: ProviderConfig
): ChatCompletionsModelConfig {
  return {
    model,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    sessionId: provider.sessionId,
    retry: provider.retry,
    traceHeaders: provider.traceHeaders,
    authHeaderName: provider.authHeaderName,
  };
}
