import { describe, expect, it } from "bun:test";

import { failureOption } from "effect/Cause";
import { runPromiseExit } from "effect/Effect";
import * as Exit from "effect/Exit";
import { getOrThrow } from "effect/Option";

import { assertFailure } from "../../test/helpers/exit-asserts";
import { ProviderConfigError, resolveProviderConfig } from "./provider-config";

const BENCH_HARNESS_APP_REFERRER = "https://test.example.com/";
const BENCH_HARNESS_APP_TITLE = "Test App";

describe("provider-config", () => {
  describe("resolveProviderConfig", () => {
    describe("precedence", () => {
      it("uses default base URL when no inputs provided", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.baseUrl).toBe("https://openrouter.ai/api/v1");
          expect(exit.value.providerKind).toBe("openrouter");
        }
      });

      it("respects baseUrlFlag over MODEL_BASE_URL", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            baseUrlFlag: "https://custom.example.com",
            modelBaseUrlEnv: "https://should-be-overridden.com",
            providerFlag: "chat",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.baseUrl).toBe("https://custom.example.com");
        }
      });

      it("respects MODEL_BASE_URL over OPENROUTER_BASE_URL", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            modelBaseUrlEnv: "https://model-env.example.com",
            openrouterBaseUrlEnv: "https://should-be-overridden.com",
            providerFlag: "chat",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.baseUrl).toBe("https://model-env.example.com");
        }
      });

      it("uses OPENROUTER_BASE_URL when MODEL_BASE_URL not set", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            openrouterBaseUrlEnv: "https://or-env.example.com",
            providerFlag: "openrouter",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.baseUrl).toBe("https://or-env.example.com/api/v1");
        }
      });

      it("uses default base URL when no env vars set", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.baseUrl).toBe("https://openrouter.ai/api/v1");
        }
      });

      it("respects apiKeyFlag over MODEL_API_KEY", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-flag",
            modelApiKeyEnv: "sk-model-env",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.apiKey).toBe("sk-flag");
        }
      });

      it("respects MODEL_API_KEY over OPENROUTER_API_KEY", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            modelApiKeyEnv: "sk-model-env",
            openrouterApiKeyEnv: "sk-or-env",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.apiKey).toBe("sk-model-env");
        }
      });

      it("uses OPENROUTER_API_KEY when MODEL_API_KEY not set", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            openrouterApiKeyEnv: "sk-or-env",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.apiKey).toBe("sk-or-env");
        }
      });

      it("respects providerFlag over MODEL_PROVIDER env", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            baseUrlFlag: "https://custom.example.com",
            providerFlag: "openrouter",
            modelProviderEnv: "chat",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.providerKind).toBe("openrouter");
        }
      });

      it("respects MODEL_PROVIDER env when providerFlag not set", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            baseUrlFlag: "https://custom.example.com",
            modelProviderEnv: "chat",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.providerKind).toBe("chat");
        }
      });

      it("rejects invalid MODEL_PROVIDER env value", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            modelProviderEnv: "invalid",
          })
        );
        assertFailure(exit);
        const error = getOrThrow(failureOption(exit.cause));
        expect(error).toBeInstanceOf(ProviderConfigError);
        expect(error.message).toContain("Invalid provider kind");
      });
    });

    describe("provider kind resolution", () => {
      it("defaults to openrouter for OpenRouter default base URL", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.providerKind).toBe("openrouter");
        }
      });

      it("defaults to openrouter for default OpenRouter base URL with trailing slash", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            baseUrlFlag: "https://openrouter.ai/",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.providerKind).toBe("openrouter");
        }
      });

      it("requires explicit provider kind for non-OpenRouter URLs", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            baseUrlFlag: "https://custom.llm-provider.com",
          })
        );
        assertFailure(exit);
        const error = getOrThrow(failureOption(exit.cause));
        expect(error).toBeInstanceOf(ProviderConfigError);
        expect(error.message).toContain(
          "Provider kind must be explicitly specified"
        );
      });

      it("accepts chat provider kind for non-OpenRouter URL", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            baseUrlFlag: "https://custom.llm-provider.com",
            providerFlag: "chat",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.providerKind).toBe("chat");
          expect(exit.value.baseUrl).toBe("https://custom.llm-provider.com");
        }
      });
    });

    describe("URL normalization", () => {
      it("normalizes OpenRouter URLs with /api/v1 suffix", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            baseUrlFlag: "https://openrouter.ai",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.baseUrl).toBe("https://openrouter.ai/api/v1");
        }
      });

      it("preserves existing /api/v1 suffix on OpenRouter URLs", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            baseUrlFlag: "https://openrouter.ai/api/v1",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.baseUrl).toBe("https://openrouter.ai/api/v1");
        }
      });

      it("does not normalize chat provider URLs", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            baseUrlFlag: "https://api.openai.com/v1",
            providerFlag: "chat",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.baseUrl).toBe("https://api.openai.com/v1");
        }
      });

      it("removes trailing slashes", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            baseUrlFlag: "https://custom.example.com/",
            providerFlag: "chat",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.baseUrl).toBe("https://custom.example.com");
        }
      });

      it("normalizes trailing slashes before /api/v1 for OpenRouter", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            baseUrlFlag: "https://openrouter.ai/",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.baseUrl).toBe("https://openrouter.ai/api/v1");
        }
      });
    });

    describe("validation - API key", () => {
      it("rejects missing API key", async () => {
        const exit = await runPromiseExit(resolveProviderConfig({}));
        assertFailure(exit);
        const error = getOrThrow(failureOption(exit.cause));
        expect(error).toBeInstanceOf(ProviderConfigError);
        expect(error.message).toContain("API key is required");
      });

      it("rejects empty API key", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "",
          })
        );
        assertFailure(exit);
        const error = getOrThrow(failureOption(exit.cause));
        expect(error).toBeInstanceOf(ProviderConfigError);
        expect(error.message).toContain("API key is required");
      });

      it("rejects whitespace-only API key", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "   ",
          })
        );
        assertFailure(exit);
        const error = getOrThrow(failureOption(exit.cause));
        expect(error).toBeInstanceOf(ProviderConfigError);
        expect(error.message).toContain("API key is required");
      });
    });

    describe("validation - base URL", () => {
      it("rejects invalid URL", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            baseUrlFlag: "not a url",
          })
        );
        assertFailure(exit);
        const error = getOrThrow(failureOption(exit.cause));
        expect(error).toBeInstanceOf(ProviderConfigError);
        expect(error.message).toContain("Invalid base URL");
      });

      it("rejects non-HTTP(S) URL", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            baseUrlFlag: "ftp://example.com",
          })
        );
        assertFailure(exit);
        const error = getOrThrow(failureOption(exit.cause));
        expect(error).toBeInstanceOf(ProviderConfigError);
        expect(error.message).toContain("Invalid base URL");
      });

      it("accepts HTTP URL", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            baseUrlFlag: "http://local.example.com",
            providerFlag: "chat",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.baseUrl).toBe("http://local.example.com");
        }
      });

      it("accepts HTTPS URL", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            baseUrlFlag: "https://secure.example.com",
            providerFlag: "chat",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.baseUrl).toBe("https://secure.example.com");
        }
      });
    });

    describe("validation - control characters", () => {
      it("rejects control characters in base URL", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            baseUrlFlag: "https://example.com/\u0000path",
          })
        );
        assertFailure(exit);
        const error = getOrThrow(failureOption(exit.cause));
        expect(error).toBeInstanceOf(ProviderConfigError);
        expect(error.message).toContain("control characters");
      });

      it("rejects control characters in session ID", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            sessionId: "session\u0001id",
          })
        );
        assertFailure(exit);
        const error = getOrThrow(failureOption(exit.cause));
        expect(error).toBeInstanceOf(ProviderConfigError);
        expect(error.message).toContain("control characters");
      });

      it("accepts valid session ID", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            sessionId: "valid-session-id-123",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.sessionId).toBe("valid-session-id-123");
        }
      });
    });

    describe("optional fields", () => {
      it("includes sessionId when provided", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            sessionId: "test-session",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.sessionId).toBe("test-session");
        }
      });

      it("includes traceHeaders when provided", async () => {
        const headers = { "x-trace": "value" };
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            traceHeaders: headers,
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.traceHeaders).toEqual(headers);
        }
      });

      it("includes retry config when provided", async () => {
        const retry = { maxRetries: 5, baseDelayMs: 500 };
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            retry,
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.retry).toEqual(retry);
        }
      });

      it("includes appReferrer when provided", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            appReferrer: BENCH_HARNESS_APP_REFERRER,
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.appReferrer).toBe(BENCH_HARNESS_APP_REFERRER);
        }
      });

      it("includes appTitle when provided", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            appTitle: BENCH_HARNESS_APP_TITLE,
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.appTitle).toBe(BENCH_HARNESS_APP_TITLE);
        }
      });

      it("includes authHeaderName from env", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            authHeaderNameEnv: "x-api-key",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.authHeaderName).toBe("x-api-key");
        }
      });

      it("defaults authHeaderName to Authorization", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.authHeaderName).toBe("Authorization");
        }
      });
    });

    describe("backward compatibility", () => {
      it("behaves identically to OpenRouter defaults when no new inputs", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            openrouterApiKeyEnv: "sk-or-key",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.apiKey).toBe("sk-or-key");
          expect(exit.value.baseUrl).toBe("https://openrouter.ai/api/v1");
          expect(exit.value.providerKind).toBe("openrouter");
        }
      });

      it("preserves OpenRouter base URL env behavior", async () => {
        const exit = await runPromiseExit(
          resolveProviderConfig({
            apiKeyFlag: "sk-test",
            openrouterBaseUrlEnv: "https://custom.openrouter.com",
          })
        );
        expect(Exit.isSuccess(exit)).toBe(true);
        if (Exit.isSuccess(exit)) {
          expect(exit.value.baseUrl).toBe(
            "https://custom.openrouter.com/api/v1"
          );
          expect(exit.value.providerKind).toBe("openrouter");
        }
      });
    });
  });
});
