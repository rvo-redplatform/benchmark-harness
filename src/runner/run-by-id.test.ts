import { describe, expect, it } from "bun:test";

import { succeed } from "effect/Effect";
import { fail as layerFail, succeed as layerSucceed } from "effect/Layer";
import { fromIterable } from "effect/Stream";

import type { InjectedBenchmarkRunConfig } from "../benchmarks/benchmark-config";
import type { Benchmark } from "../benchmarks/types";
import { Dataset } from "../harness/dataset";
import { assertLeft, assertRight } from "../internal/testing";
import type { ProviderConfig } from "../providers/provider-config";
import { datasetSizeById, runBenchmarkById } from "./run-by-id";

const INJECTED_BENCHMARK: Benchmark<InjectedBenchmarkRunConfig> = {
  id: "injected_benchmark",
  makeDatasetLayer: () =>
    layerSucceed(Dataset, {
      stream: () => fromIterable([]),
      size: succeed(7),
    }),
  makeLayer: () => layerFail(new Error("injected benchmark used")),
  temperature: 0,
  defaultEpochs: 1,
};

const INJECTED_CONFIG = {
  benchmarkId: "injected_benchmark",
  model: "injected/model",
  options: { subset: "all" },
} as const;

describe("benchmark runner by id", () => {
  it("runs an injected benchmark instead of the native registry", async () => {
    const result = await runBenchmarkById({
      benchmarkId: INJECTED_BENCHMARK.id,
      injectedBenchmark: INJECTED_BENCHMARK,
      apiKey: "unused",
      benchmarkConfig: INJECTED_CONFIG,
      epochs: 1,
      maxConcurrency: 1,
      sessionId: "test",
    });

    assertLeft(result);
    expect(result.left).toContain("injected benchmark used");
  });

  it("rejects an injected-id config without an injected benchmark", async () => {
    const result = await runBenchmarkById({
      benchmarkId: INJECTED_BENCHMARK.id,
      apiKey: "unused",
      benchmarkConfig: INJECTED_CONFIG,
      epochs: 1,
      maxConcurrency: 1,
      sessionId: "test",
    });

    assertLeft(result);
    expect(result.left).toContain("injected benchmark is required");
  });

  it("rejects an injected benchmark for a native config", async () => {
    const result = await runBenchmarkById({
      benchmarkId: "search_hle",
      injectedBenchmark: INJECTED_BENCHMARK,
      apiKey: "unused",
      benchmarkConfig: {
        benchmarkId: "search_hle",
        model: "injected/model",
      },
      epochs: 1,
      maxConcurrency: 1,
      sessionId: "test",
    });

    assertLeft(result);
    expect(result.left).toContain("cannot be supplied for native benchmark");
  });

  it("resolves dataset size from an injected benchmark", async () => {
    const result = await datasetSizeById(
      INJECTED_BENCHMARK.id,
      INJECTED_BENCHMARK
    );

    assertRight(result);
    expect(result.right).toBe(7);
  });

  it("rejects an injected benchmark whose id does not match", async () => {
    const mismatched = {
      ...INJECTED_BENCHMARK,
      id: "other_injected_benchmark",
    };

    const runResult = await runBenchmarkById({
      benchmarkId: INJECTED_BENCHMARK.id,
      injectedBenchmark: mismatched,
      apiKey: "unused",
      benchmarkConfig: INJECTED_CONFIG,
      epochs: 1,
      maxConcurrency: 1,
      sessionId: "test",
    });
    const sizeResult = await datasetSizeById(INJECTED_BENCHMARK.id, mismatched);

    assertLeft(runResult);
    assertLeft(sizeResult);
    expect(runResult.left).toContain("Benchmark id mismatch");
    expect(sizeResult.left).toBe(runResult.left);
  });

  describe("provider configuration", () => {
    it("accepts OpenRouter provider with default base URL", async () => {
      const providerConfig: ProviderConfig = {
        apiKey: "sk-test",
        baseUrl: "https://openrouter.ai/api/v1",
        providerKind: "openrouter",
        sessionId: "test",
      };

      const result = await runBenchmarkById({
        benchmarkId: INJECTED_BENCHMARK.id,
        injectedBenchmark: INJECTED_BENCHMARK,
        apiKey: "sk-test",
        benchmarkConfig: INJECTED_CONFIG,
        epochs: 1,
        maxConcurrency: 1,
        sessionId: "test",
        providerConfig,
      });

      assertLeft(result);
      expect(result.left).toContain("injected benchmark used");
    });

    it("accepts chat provider with custom base URL", async () => {
      const providerConfig: ProviderConfig = {
        apiKey: "sk-test",
        baseUrl: "https://api.openai.com/v1",
        providerKind: "chat",
        sessionId: "test",
      };

      const result = await runBenchmarkById({
        benchmarkId: INJECTED_BENCHMARK.id,
        injectedBenchmark: INJECTED_BENCHMARK,
        apiKey: "sk-test",
        benchmarkConfig: INJECTED_CONFIG,
        epochs: 1,
        maxConcurrency: 1,
        sessionId: "test",
        providerConfig,
      });

      assertLeft(result);
      expect(result.left).toContain("injected benchmark used");
    });

    it("rejects missing API key", async () => {
      const result = await runBenchmarkById({
        benchmarkId: INJECTED_BENCHMARK.id,
        injectedBenchmark: INJECTED_BENCHMARK,
        apiKey: "",
        benchmarkConfig: INJECTED_CONFIG,
        epochs: 1,
        maxConcurrency: 1,
        sessionId: "test",
      });

      assertLeft(result);
      expect(result.left).toContain("API key is required");
    });

    it("rejects invalid provider kind from env", async () => {
      const originalProvider = process.env.MODEL_PROVIDER;
      process.env.MODEL_PROVIDER = "invalid";

      try {
        const result = await runBenchmarkById({
          benchmarkId: INJECTED_BENCHMARK.id,
          injectedBenchmark: INJECTED_BENCHMARK,
          apiKey: "sk-test",
          benchmarkConfig: INJECTED_CONFIG,
          epochs: 1,
          maxConcurrency: 1,
          sessionId: "test",
          baseUrl: "https://custom.example.com",
        });

        assertLeft(result);
        expect(result.left).toContain("Invalid provider kind");
      } finally {
        if (originalProvider === undefined) {
          delete process.env.MODEL_PROVIDER;
        } else {
          process.env.MODEL_PROVIDER = originalProvider;
        }
      }
    });

    it("rejects non-OpenRouter URL without explicit provider", async () => {
      const result = await runBenchmarkById({
        benchmarkId: INJECTED_BENCHMARK.id,
        injectedBenchmark: INJECTED_BENCHMARK,
        apiKey: "sk-test",
        benchmarkConfig: INJECTED_CONFIG,
        epochs: 1,
        maxConcurrency: 1,
        sessionId: "test",
        baseUrl: "https://custom.llm-provider.com",
      });

      assertLeft(result);
      expect(result.left).toContain(
        "Provider kind must be explicitly specified"
      );
    });

    it("respects AUTH_HEADER_NAME environment variable", async () => {
      const originalAuthHeader = process.env.AUTH_HEADER_NAME;
      process.env.AUTH_HEADER_NAME = "x-api-key";

      try {
        const providerConfig: ProviderConfig = {
          apiKey: "sk-test",
          baseUrl: "https://api.example.com/v1",
          providerKind: "chat",
          sessionId: "test",
          authHeaderName: "x-api-key",
        };

        const result = await runBenchmarkById({
          benchmarkId: INJECTED_BENCHMARK.id,
          injectedBenchmark: INJECTED_BENCHMARK,
          apiKey: "sk-test",
          benchmarkConfig: INJECTED_CONFIG,
          epochs: 1,
          maxConcurrency: 1,
          sessionId: "test",
          providerConfig,
        });

        assertLeft(result);
        expect(result.left).toContain("injected benchmark used");
      } finally {
        if (originalAuthHeader === undefined) {
          delete process.env.AUTH_HEADER_NAME;
        } else {
          process.env.AUTH_HEADER_NAME = originalAuthHeader;
        }
      }
    });
  });
});
