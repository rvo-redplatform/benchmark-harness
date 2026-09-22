import { afterEach, describe, expect, it } from "bun:test";

import { gen, provide, runPromiseExit } from "effect/Effect";

import { assertSuccess } from "../../test/helpers/exit-asserts";
import type { ModelMessage } from "../harness/core";
import { MessageRole } from "../harness/core";
import type { GenerateConfig } from "../harness/model";
import {
  ChatCompletionsModel,
  __internalMakeChatCompletionsLayer,
} from "./chat-completions-model";

describe("chat-completions-model", () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  function makeResponse(options: {
    content: string;
    finishReason?: "stop" | "length" | null;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }): unknown {
    return {
      id: "chatcmpl-test-id",
      object: "chat.completion",
      created: Date.now(),
      model: "test-model",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: options.content,
          },
          finish_reason: options.finishReason ?? "stop",
        },
      ],
      usage: options.usage
        ? {
            prompt_tokens: options.usage.promptTokens,
            completion_tokens: options.usage.completionTokens,
            total_tokens: options.usage.totalTokens,
          }
        : undefined,
    };
  }

  const defaultConfig: GenerateConfig = {
    reasoningEffort: "medium",
    timeoutMs: 1000,
  };

  it("constructs correct URL with /v1/chat/completions path", async () => {
    const originalFetch = globalThis.fetch;
    let capturedRequest: Request | undefined;
    globalThis.fetch = async (input, init) => {
      capturedRequest =
        input instanceof Request ? input : new Request(input, init);
      return new Response(
        JSON.stringify(makeResponse({ content: "test response" })),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "test-model",
      apiKey: "test-key",
      baseUrl: "https://example.test",
    });

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(
          [{ role: MessageRole.User, content: "Hello" }],
          defaultConfig
        );
      }).pipe(provide(layer))
    );

    assertSuccess(exit);
    expect(capturedRequest?.url).toBe(
      "https://example.test/v1/chat/completions"
    );
  });

  it("normalizes baseUrl by stripping trailing slashes", async () => {
    const originalFetch = globalThis.fetch;
    let capturedRequest: Request | undefined;
    globalThis.fetch = async (input, init) => {
      capturedRequest =
        input instanceof Request ? input : new Request(input, init);
      return new Response(
        JSON.stringify(makeResponse({ content: "test response" })),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "test-model",
      apiKey: "test-key",
      baseUrl: "https://example.test/",
    });

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(
          [{ role: MessageRole.User, content: "Hello" }],
          defaultConfig
        );
      }).pipe(provide(layer))
    );

    assertSuccess(exit);
    expect(capturedRequest?.url).toBe(
      "https://example.test/v1/chat/completions"
    );
  });

  it("constructs URLs preserving path segments", async () => {
    const originalFetch = globalThis.fetch;
    let capturedRequest: Request | undefined;
    globalThis.fetch = async (input, init) => {
      capturedRequest =
        input instanceof Request ? input : new Request(input, init);
      return new Response(
        JSON.stringify(makeResponse({ content: "test response" })),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "test-model",
      apiKey: "test-key",
      baseUrl: "https://example.test/api",
    });

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(
          [{ role: MessageRole.User, content: "Hello" }],
          defaultConfig
        );
      }).pipe(provide(layer))
    );

    assertSuccess(exit);
    expect(capturedRequest?.url).toBe(
      "https://example.test/api/v1/chat/completions"
    );
  });

  it("sends Bearer auth header", async () => {
    const originalFetch = globalThis.fetch;
    let capturedRequest: Request | undefined;
    globalThis.fetch = async (input, init) => {
      capturedRequest =
        input instanceof Request ? input : new Request(input, init);
      return new Response(
        JSON.stringify(makeResponse({ content: "test response" })),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "test-model",
      apiKey: "secret-api-key",
      baseUrl: "https://example.test",
    });

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(
          [{ role: MessageRole.User, content: "Hello" }],
          defaultConfig
        );
      }).pipe(provide(layer))
    );

    assertSuccess(exit);
    expect(capturedRequest?.headers.get("authorization")).toBe(
      "Bearer secret-api-key"
    );
  });

  it("sends custom auth header without Bearer prefix", async () => {
    const originalFetch = globalThis.fetch;
    let capturedRequest: Request | undefined;
    globalThis.fetch = async (input, init) => {
      capturedRequest =
        input instanceof Request ? input : new Request(input, init);
      return new Response(
        JSON.stringify(makeResponse({ content: "test response" })),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "test-model",
      apiKey: "secret-api-key",
      baseUrl: "https://example.test",
      authHeaderName: "x-api-key",
    });

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(
          [{ role: MessageRole.User, content: "Hello" }],
          defaultConfig
        );
      }).pipe(provide(layer))
    );

    assertSuccess(exit);
    expect(capturedRequest?.headers.get("x-api-key")).toBe("secret-api-key");
    expect(capturedRequest?.headers.get("authorization")).toBeNull();
  });

  it("includes trace headers in request", async () => {
    const originalFetch = globalThis.fetch;
    let capturedRequest: Request | undefined;
    globalThis.fetch = async (input, init) => {
      capturedRequest =
        input instanceof Request ? input : new Request(input, init);
      return new Response(
        JSON.stringify(makeResponse({ content: "test response" })),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "test-model",
      apiKey: "test-key",
      baseUrl: "https://example.test",
      traceHeaders: {
        "x-trace-id": "trace-123",
        "x-session-id": "session-456",
      },
    });

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(
          [{ role: MessageRole.User, content: "Hello" }],
          defaultConfig
        );
      }).pipe(provide(layer))
    );

    assertSuccess(exit);
    expect(capturedRequest?.headers.get("x-trace-id")).toBe("trace-123");
    expect(capturedRequest?.headers.get("x-session-id")).toBe("session-456");
  });

  it("sends correct request body with messages", async () => {
    const originalFetch = globalThis.fetch;
    let capturedRequest: Request | undefined;
    globalThis.fetch = async (input, init) => {
      capturedRequest =
        input instanceof Request ? input : new Request(input, init);
      return new Response(
        JSON.stringify(makeResponse({ content: "test response" })),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "test-model",
      apiKey: "test-key",
      baseUrl: "https://example.test",
    });

    const messages: ModelMessage[] = [
      { role: MessageRole.System, content: "You are helpful." },
      { role: MessageRole.User, content: "Hello" },
    ];

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(messages, defaultConfig);
      }).pipe(provide(layer))
    );

    assertSuccess(exit);
    const body = await capturedRequest?.clone().json();
    expect(body).toMatchObject({
      model: "test-model",
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hello" },
      ],
    });
  });

  it("includes max_tokens when provided", async () => {
    const originalFetch = globalThis.fetch;
    let capturedRequest: Request | undefined;
    globalThis.fetch = async (input, init) => {
      capturedRequest =
        input instanceof Request ? input : new Request(input, init);
      return new Response(
        JSON.stringify(makeResponse({ content: "test response" })),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "test-model",
      apiKey: "test-key",
      baseUrl: "https://example.test",
    });

    const config: GenerateConfig = {
      ...defaultConfig,
      maxTokens: 1024,
    };

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(
          [{ role: MessageRole.User, content: "Hello" }],
          config
        );
      }).pipe(provide(layer))
    );

    assertSuccess(exit);
    const body = await capturedRequest?.clone().json();
    expect(body).toMatchObject({
      max_tokens: 1024,
    });
    expect(body).not.toHaveProperty("temperature");
  });

  it("excludes temperature even when provided in config", async () => {
    const originalFetch = globalThis.fetch;
    let capturedRequest: Request | undefined;
    globalThis.fetch = async (input, init) => {
      capturedRequest =
        input instanceof Request ? input : new Request(input, init);
      return new Response(
        JSON.stringify(makeResponse({ content: "test response" })),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "test-model",
      apiKey: "test-key",
      baseUrl: "https://example.test",
    });

    const config: GenerateConfig = {
      ...defaultConfig,
      temperature: 0.7,
    };

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(
          [{ role: MessageRole.User, content: "Hello" }],
          config
        );
      }).pipe(provide(layer))
    );

    assertSuccess(exit);
    const body = await capturedRequest?.clone().json();
    expect(body).not.toHaveProperty("temperature");
  });

  it("strips variant suffix from model name", async () => {
    const originalFetch = globalThis.fetch;
    let capturedRequest: Request | undefined;
    globalThis.fetch = async (input, init) => {
      capturedRequest =
        input instanceof Request ? input : new Request(input, init);
      return new Response(
        JSON.stringify(makeResponse({ content: "test response" })),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "model-name:variant",
      apiKey: "test-key",
      baseUrl: "https://example.test",
    });

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(
          [{ role: MessageRole.User, content: "Hello" }],
          defaultConfig
        );
      }).pipe(provide(layer))
    );

    assertSuccess(exit);
    const body = await capturedRequest?.clone().json();
    expect(body.model).toBe("model-name");
  });

  it("maps response content to completion and message", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify(makeResponse({ content: "Hello! How can I help?" })),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "test-model",
      apiKey: "test-key",
      baseUrl: "https://example.test",
    });

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(
          [{ role: MessageRole.User, content: "Hello" }],
          defaultConfig
        );
      }).pipe(provide(layer))
    );

    assertSuccess(exit);
    expect(exit.value.completion).toBe("Hello! How can I help?");
    expect(exit.value.message.content).toBe("Hello! How can I help?");
    expect(exit.value.message.role).toBe(MessageRole.Assistant);
  });

  it("captures usage metrics from response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify(
          makeResponse({
            content: "test response",
            usage: {
              promptTokens: 15,
              completionTokens: 8,
              totalTokens: 23,
            },
          })
        ),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "test-model",
      apiKey: "test-key",
      baseUrl: "https://example.test",
    });

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(
          [{ role: MessageRole.User, content: "Hello" }],
          defaultConfig
        );
      }).pipe(provide(layer))
    );

    assertSuccess(exit);
    expect(exit.value.usage).toMatchObject({
      inputTokens: 15,
      outputTokens: 8,
      totalTokens: 23,
    });
  });

  it("handles null content in response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify(
          makeResponse({
            content: null as unknown as string,
            finishReason: "stop",
          })
        ),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "test-model",
      apiKey: "test-key",
      baseUrl: "https://example.test",
    });

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(
          [{ role: MessageRole.User, content: "Hello" }],
          defaultConfig
        );
      }).pipe(provide(layer))
    );

    assertSuccess(exit);
    expect(exit.value.completion).toBe("");
    expect(exit.value.message.content).toBe("");
  });

  it("captures generation time", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify(makeResponse({ content: "test response" })),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "test-model",
      apiKey: "test-key",
      baseUrl: "https://example.test",
    });

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(
          [{ role: MessageRole.User, content: "Hello" }],
          defaultConfig
        );
      }).pipe(provide(layer))
    );

    assertSuccess(exit);
    expect(exit.value.generationTimeMs).toBeDefined();
    expect(typeof exit.value.generationTimeMs).toBe("number");
    expect(exit.value.generationTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("includes raw response in output", async () => {
    const originalFetch = globalThis.fetch;
    const responseData = makeResponse({ content: "test response" });
    globalThis.fetch = async () => {
      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "test-model",
      apiKey: "test-key",
      baseUrl: "https://example.test",
    });

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(
          [{ role: MessageRole.User, content: "Hello" }],
          defaultConfig
        );
      }).pipe(provide(layer))
    );

    assertSuccess(exit);
    expect(exit.value.rawResponse).toBeDefined();
    expect(exit.value.rawResponse).toMatchObject({
      id: "chatcmpl-test-id",
      model: "test-model",
    });
  });

  it("handles HTTP 4xx errors with ModelError", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response("Bad request", { status: 400 });
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "test-model",
      apiKey: "test-key",
      baseUrl: "https://example.test",
      retry: { maxRetries: 0, baseDelayMs: 0 },
    });

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(
          [{ role: MessageRole.User, content: "Hello" }],
          defaultConfig
        );
      }).pipe(provide(layer))
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause._tag).toBe("Fail");
      if (exit.cause._tag === "Fail") {
        expect(exit.cause.error._tag).toBe("ModelError");
        if (exit.cause.error._tag === "ModelError") {
          expect(exit.cause.error.status).toBe(400);
          expect(exit.cause.error.message).toContain("400");
        }
      }
    }
  });

  it("handles HTTP 5xx errors with ModelError", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response("Internal server error", { status: 500 });
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "test-model",
      apiKey: "test-key",
      baseUrl: "https://example.test",
      retry: { maxRetries: 0, baseDelayMs: 0 },
    });

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(
          [{ role: MessageRole.User, content: "Hello" }],
          defaultConfig
        );
      }).pipe(provide(layer))
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause._tag).toBe("Fail");
      if (exit.cause._tag === "Fail") {
        expect(exit.cause.error._tag).toBe("ModelError");
        if (exit.cause.error._tag === "ModelError") {
          expect(exit.cause.error.status).toBe(500);
          expect(exit.cause.error.message).toContain("500");
        }
      }
    }
  });

  it("handles non-JSON response with ModelError", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response("Not JSON", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "test-model",
      apiKey: "test-key",
      baseUrl: "https://example.test",
      retry: { maxRetries: 0, baseDelayMs: 0 },
    });

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(
          [{ role: MessageRole.User, content: "Hello" }],
          defaultConfig
        );
      }).pipe(provide(layer))
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause._tag).toBe("Fail");
      if (exit.cause._tag === "Fail") {
        expect(exit.cause.error._tag).toBe("ModelError");
      }
    }
  });

  it("handles missing choices array in response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ id: "test", model: "test" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "test-model",
      apiKey: "test-key",
      baseUrl: "https://example.test",
      retry: { maxRetries: 0, baseDelayMs: 0 },
    });

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(
          [{ role: MessageRole.User, content: "Hello" }],
          defaultConfig
        );
      }).pipe(provide(layer))
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause._tag).toBe("Fail");
      if (exit.cause._tag === "Fail") {
        expect(exit.cause.error._tag).toBe("ModelError");
        if (exit.cause.error._tag === "ModelError") {
          expect(exit.cause.error.message).toContain("missing 'choices'");
        }
      }
    }
  });

  it("uses endpointId as model when provided", async () => {
    const originalFetch = globalThis.fetch;
    let capturedRequest: Request | undefined;
    globalThis.fetch = async (input, init) => {
      capturedRequest =
        input instanceof Request ? input : new Request(input, init);
      return new Response(
        JSON.stringify(makeResponse({ content: "test response" })),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };
    restore = () => {
      globalThis.fetch = originalFetch;
    };

    const layer = __internalMakeChatCompletionsLayer({
      model: "default-model",
      apiKey: "test-key",
      baseUrl: "https://example.test",
    });

    const config: GenerateConfig = {
      ...defaultConfig,
      endpointId: "custom-model-id",
    };

    const exit = await runPromiseExit(
      gen(function* () {
        const model = yield* ChatCompletionsModel;
        return yield* model.generate(
          [{ role: MessageRole.User, content: "Hello" }],
          config
        );
      }).pipe(provide(layer))
    );

    assertSuccess(exit);
    const body = await capturedRequest?.clone().json();
    expect(body.model).toBe("custom-model-id");
  });
});
