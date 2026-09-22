import { TaggedError } from "effect/Data";
import type { Effect } from "effect/Effect";
import { fail, succeed } from "effect/Effect";

import type { RetryConfig } from "../runtime/retry";

export type ProviderKind = "openrouter" | "chat";

export interface ProviderConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly providerKind: ProviderKind;
  readonly sessionId?: string;
  readonly traceHeaders?: Readonly<Record<string, string>>;
  readonly retry?: RetryConfig;
  readonly appReferrer?: string;
  readonly appTitle?: string;
  readonly authHeaderName?: string;
}

export interface ProviderConfigInput {
  readonly baseUrlFlag?: string;
  readonly apiKeyFlag?: string;
  readonly providerFlag?: ProviderKind;
  readonly modelBaseUrlEnv?: string;
  readonly modelApiKeyEnv?: string;
  readonly modelProviderEnv?: string;
  readonly openrouterBaseUrlEnv?: string;
  readonly openrouterApiKeyEnv?: string;
  readonly sessionId?: string;
  readonly traceHeaders?: Readonly<Record<string, string>>;
  readonly retry?: RetryConfig;
  readonly appReferrer?: string;
  readonly appTitle?: string;
  readonly authHeaderNameEnv?: string;
}

export class ProviderConfigError extends TaggedError("ProviderConfigError")<{
  readonly message: string;
}> {}

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if ((code >= 0x00 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f)) {
      return true;
    }
  }
  return false;
}

const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai";

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isOpenRouterDefault(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    const defaultUrl = new URL(OPENROUTER_DEFAULT_BASE_URL);
    return url.origin === defaultUrl.origin;
  } catch {
    return false;
  }
}

function normalizeBaseUrl(baseUrl: string, providerKind: ProviderKind): string {
  if (providerKind !== "openrouter") {
    return baseUrl.replace(/\/+$/u, "");
  }
  const trimmed = baseUrl.replace(/\/+$/u, "");
  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
}

export function resolveProviderConfig(
  input: ProviderConfigInput
): Effect<ProviderConfig, ProviderConfigError> {
  const rawBaseUrl =
    input.baseUrlFlag ??
    input.modelBaseUrlEnv ??
    input.openrouterBaseUrlEnv ??
    OPENROUTER_DEFAULT_BASE_URL;

  const apiKey =
    input.apiKeyFlag ?? input.modelApiKeyEnv ?? input.openrouterApiKeyEnv;

  let providerKindRaw: ProviderKind | undefined;
  if (input.providerFlag !== undefined) {
    providerKindRaw = input.providerFlag;
  } else if (input.modelProviderEnv !== undefined) {
    if (
      input.modelProviderEnv !== "openrouter" &&
      input.modelProviderEnv !== "chat"
    ) {
      return fail(
        new ProviderConfigError({
          message: `Invalid provider kind: must be "openrouter" or "chat" (got: ${input.modelProviderEnv})`,
        })
      );
    }
    providerKindRaw = input.modelProviderEnv;
  }

  if (apiKey === undefined || apiKey.trim() === "") {
    return fail(
      new ProviderConfigError({
        message: "API key is required and must be non-empty",
      })
    );
  }

  if (!isValidHttpUrl(rawBaseUrl)) {
    return fail(
      new ProviderConfigError({
        message: `Invalid base URL: must be a valid HTTP or HTTPS URL (got: ${rawBaseUrl})`,
      })
    );
  }

  if (hasControlChars(rawBaseUrl)) {
    return fail(
      new ProviderConfigError({
        message: "Base URL contains control characters",
      })
    );
  }

  if (input.sessionId !== undefined && hasControlChars(input.sessionId)) {
    return fail(
      new ProviderConfigError({
        message: "Session ID contains control characters",
      })
    );
  }

  let providerKind: ProviderKind;
  if (providerKindRaw !== undefined) {
    providerKind = providerKindRaw;
  } else if (
    isOpenRouterDefault(rawBaseUrl) ||
    input.openrouterBaseUrlEnv !== undefined
  ) {
    providerKind = "openrouter";
  } else {
    return fail(
      new ProviderConfigError({
        message:
          "Provider kind must be explicitly specified when using a non-OpenRouter base URL (use --provider or MODEL_PROVIDER)",
      })
    );
  }

  const baseUrl = normalizeBaseUrl(rawBaseUrl, providerKind);

  const authHeaderName = input.authHeaderNameEnv ?? "Authorization";

  return succeed({
    apiKey,
    baseUrl,
    providerKind,
    sessionId: input.sessionId,
    traceHeaders: input.traceHeaders,
    retry: input.retry,
    appReferrer: input.appReferrer,
    appTitle: input.appTitle,
    authHeaderName,
  });
}
