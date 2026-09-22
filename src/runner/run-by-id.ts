import { FetchHttpClient } from "@effect/platform";
import { flatMap, provide } from "effect/Effect";
import {
  mergeAll as layerMergeAll,
  provide as layerProvide,
  succeed as layerSucceed,
} from "effect/Layer";

import type {
  BenchmarkRunConfig,
  InjectedBenchmarkRunConfig,
} from "../benchmarks/benchmark-config";
import {
  isNativeBenchmarkConfig,
  modelFromConfig,
} from "../benchmarks/benchmark-config";
import { getBenchmark } from "../benchmarks/registry";
import type {
  Benchmark,
  BenchmarkMetadata,
  BenchmarkRunInput,
} from "../benchmarks/types";
import { Dataset } from "../harness/dataset";
import type {
  CheckpointStoreService,
  ProgressReporterService,
} from "../harness/progress";
import {
  CheckpointStore,
  NOOP_CHECKPOINT_STORE,
  NOOP_PROGRESS_REPORTER,
  ProgressReporter,
} from "../harness/progress";
import type { RunResult, RunConfig } from "../harness/run";
import { runBenchmark } from "../harness/run";
import { runHarnessPromise } from "../internal/effect-logger";
import type { AsyncEither } from "../internal/either";
import { Either } from "../internal/either";
import { definedValues } from "../internal/guards";
import { wLog } from "../internal/log";
import type {
  ProviderConfig,
  ProviderKind,
} from "../providers/provider-config";
import type { ResultStoreService } from "../results/result-store";
import {
  GenerationResolver,
  makeOpenRouterGenerationResolver,
} from "../runtime/generation-resolver";
import { withRunAttempt } from "../runtime/response-cache";
import type { RetryConfig } from "../runtime/retry";
import { filterTraceHeaders } from "./trace-headers";

const NOOP_GENERATION_RESOLVER = {
  resolveSourceGeneration: () => Promise.resolve(undefined) as any,
} as const;

export interface RunBenchmarkInput {
  readonly benchmarkId: string;
  readonly injectedBenchmark?: Benchmark<InjectedBenchmarkRunConfig>;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly provider?: ProviderKind;
  readonly benchmarkConfig: BenchmarkRunConfig;
  readonly epochs: number;
  readonly maxConcurrency: number;
  readonly range?: {
    readonly start?: number;
    readonly end?: number;
  };
  readonly sessionId: string;
  readonly runAttempt?: number;
  readonly datasetRetry?: RetryConfig;
  readonly progressReporter?: ProgressReporterService;
  readonly checkpointStore?: CheckpointStoreService;
  readonly abortSignal?: AbortSignal;
  readonly resultStore?: ResultStoreService;
  readonly maxOutputTokensCeiling?: number;
  readonly traceHeaders?: Readonly<Record<string, string>>;
  readonly providerConfig?: ProviderConfig;
}

export interface RunBenchmarkOutput {
  readonly result: RunResult;
  readonly resultsPath: string | null;
}

export function runBenchmarkById(
  input: RunBenchmarkInput
): AsyncEither<RunBenchmarkOutput, string> {
  const providerConfigResult = resolveProviderConfigForRun(input);
  if (Either.isLeft(providerConfigResult)) {
    return Promise.resolve(Either.left(providerConfigResult.left));
  }
  const providerConfig = providerConfigResult.right;

  const benchmarkResult = resolveRunBenchmark(input, providerConfig);
  if (Either.isLeft(benchmarkResult)) {
    return Promise.resolve(Either.left(benchmarkResult.left));
  }
  const { benchmark, benchmarkLayer } = benchmarkResult.right;
  const progressLayer = layerSucceed(
    ProgressReporter,
    input.progressReporter ?? NOOP_PROGRESS_REPORTER
  );
  const checkpointLayer = layerSucceed(
    CheckpointStore,
    input.checkpointStore ?? NOOP_CHECKPOINT_STORE
  );
  const model = modelFromConfig(input.benchmarkConfig);
  const runConfig: RunConfig = definedValues({
    epochs: input.epochs,
    maxConcurrency: input.maxConcurrency,
    range: input.range,
    degradeSolverErrors: benchmark.degradeSolverErrors,
    logAnnotations: definedValues({
      benchmark: input.benchmarkId,
      session_id: input.sessionId,
      model,
      run_attempt:
        input.runAttempt !== undefined ? `${input.runAttempt}` : undefined,
    }),
  });
  const fullBenchmarkLayer = benchmarkLayer.pipe(
    layerProvide(FetchHttpClient.layer)
  );

  const resolverLayer =
    providerConfig.providerKind === "openrouter"
      ? layerSucceed(
          GenerationResolver,
          makeOpenRouterGenerationResolver(
            definedValues({
              apiKey: providerConfig.apiKey,
              baseUrl: providerConfig.baseUrl,
              traceHeaders: providerConfig.traceHeaders,
            })
          )
        )
      : layerSucceed(GenerationResolver, NOOP_GENERATION_RESOLVER);

  const layers = layerMergeAll(
    fullBenchmarkLayer,
    progressLayer,
    checkpointLayer,
    resolverLayer
  );
  const runOpts =
    input.abortSignal !== undefined ? { signal: input.abortSignal } : undefined;
  const program = runBenchmark(runConfig).pipe(provide(layers));
  return runHarnessPromise(
    input.runAttempt === undefined
      ? program
      : withRunAttempt(input.runAttempt, program),
    runOpts
  )
    .then((result) => {
      if (input.resultStore !== undefined) {
        return runHarnessPromise(
          input.resultStore.write({
            result,
            benchmark,
            benchmarkConfig: input.benchmarkConfig,
            epochs: input.epochs,
            sessionId: input.sessionId,
          })
        )
          .then((resultsPath) => Either.right({ result, resultsPath }))
          .catch((storeErr) => {
            wLog("Failed to persist benchmark results", {
              error: String(storeErr),
            });
            return Either.right({ result, resultsPath: null });
          });
      }
      return Either.right({ result, resultsPath: null });
    })
    .catch((error) => Either.left(String(error)));
}

export function datasetSizeById(
  benchmarkId: string,
  injectedBenchmark?: Benchmark<InjectedBenchmarkRunConfig>
): AsyncEither<number, string> {
  const benchmarkResult = resolveBenchmark(benchmarkId, injectedBenchmark);
  if (Either.isLeft(benchmarkResult)) {
    return Promise.resolve(Either.left(benchmarkResult.left));
  }
  const benchmark = benchmarkResult.right;
  const datasetLayer = benchmark.makeDatasetLayer();
  const program = Dataset.pipe(flatMap((d) => d.size));
  return runHarnessPromise(program.pipe(provide(datasetLayer)))
    .then((size) => Either.right(size))
    .catch((error) => Either.left(String(error)));
}

function resolveBenchmark(
  benchmarkId: string,
  injectedBenchmark: Benchmark<InjectedBenchmarkRunConfig> | undefined
): Either.Either<BenchmarkMetadata, string> {
  if (injectedBenchmark !== undefined) {
    return injectedBenchmark.id === benchmarkId
      ? Either.right(injectedBenchmark)
      : Either.left(
          `Benchmark id mismatch: requested "${benchmarkId}", supplied "${injectedBenchmark.id}"`
        );
  }
  const benchmark = getBenchmark(benchmarkId);
  return benchmark === undefined
    ? Either.left(`Unknown benchmark "${benchmarkId}"`)
    : Either.right(benchmark);
}

function makeBenchmarkLayer<Config extends BenchmarkRunConfig>(
  benchmark: Benchmark<Config>,
  input: RunBenchmarkInput,
  benchmarkConfig: Config,
  providerConfig: ProviderConfig
): ReturnType<Benchmark["makeLayer"]> {
  const maxRetries = benchmarkConfig.maxRetries;
  const traceHeaders = filterTraceHeaders(input.traceHeaders);
  const benchmarkInput: BenchmarkRunInput<Config> = {
    benchmarkConfig,
    ...definedValues({
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      traceHeaders,
      sessionId: input.sessionId,
      datasetRetry: input.datasetRetry,
      modelRetry: maxRetries !== undefined ? { maxRetries } : undefined,
      maxOutputTokensCeiling: input.maxOutputTokensCeiling,
      providerConfig,
    }),
  };
  return benchmark.makeLayer(benchmarkInput);
}

function resolveProviderConfigForRun(
  input: RunBenchmarkInput
): Either.Either<ProviderConfig, string> {
  if (input.providerConfig !== undefined) {
    return Either.right(input.providerConfig);
  }

  const modelBaseUrlEnv = process.env.MODEL_BASE_URL;
  const modelApiKeyEnv = process.env.MODEL_API_KEY;
  const modelProviderEnv = process.env.MODEL_PROVIDER;
  const authHeaderNameEnv = process.env.AUTH_HEADER_NAME;
  const openrouterBaseUrlEnv = process.env.OPENROUTER_BASE_URL;
  const openrouterApiKeyEnv = process.env.OPENROUTER_API_KEY;

  const rawBaseUrl =
    input.baseUrl ??
    modelBaseUrlEnv ??
    openrouterBaseUrlEnv ??
    "https://openrouter.ai";

  const apiKey = input.apiKey ?? modelApiKeyEnv ?? openrouterApiKeyEnv;

  if (apiKey === undefined || apiKey.trim() === "") {
    return Either.left("API key is required and must be non-empty");
  }

  if (!isValidHttpUrl(rawBaseUrl)) {
    return Either.left(
      `Invalid base URL: must be a valid HTTP or HTTPS URL (got: ${rawBaseUrl})`
    );
  }

  let providerKind: "openrouter" | "chat";
  const isOpenRouterDefault =
    rawBaseUrl === "https://openrouter.ai" ||
    rawBaseUrl === "https://openrouter.ai/";

  if (input.provider !== undefined) {
    providerKind = input.provider;
  } else if (modelProviderEnv !== undefined) {
    if (modelProviderEnv !== "openrouter" && modelProviderEnv !== "chat") {
      return Either.left(
        `Invalid provider kind: must be "openrouter" or "chat" (got: ${modelProviderEnv})`
      );
    }
    providerKind = modelProviderEnv;
  } else if (isOpenRouterDefault || openrouterBaseUrlEnv !== undefined) {
    providerKind = "openrouter";
  } else {
    return Either.left(
      "Provider kind must be explicitly specified when using a non-OpenRouter base URL (use --provider or MODEL_PROVIDER)"
    );
  }

  const baseUrl =
    providerKind === "openrouter"
      ? normalizeOpenRouterBaseUrl(rawBaseUrl)
      : rawBaseUrl.replace(/\/+$/u, "");

  return Either.right({
    apiKey,
    baseUrl,
    providerKind,
    sessionId: input.sessionId,
    traceHeaders: input.traceHeaders,
    authHeaderName: authHeaderNameEnv,
  });
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeOpenRouterBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/u, "");
  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
}

function resolveRunBenchmark(
  input: RunBenchmarkInput,
  providerConfig: ProviderConfig
): Either.Either<
  {
    readonly benchmark: BenchmarkMetadata;
    readonly benchmarkLayer: ReturnType<Benchmark["makeLayer"]>;
  },
  string
> {
  if (isNativeBenchmarkConfig(input.benchmarkConfig)) {
    if (input.injectedBenchmark !== undefined) {
      return Either.left(
        `An injected benchmark cannot be supplied for native benchmark "${input.benchmarkId}"`
      );
    }
    const nativeBenchmark = getBenchmark(input.benchmarkId);
    if (nativeBenchmark === undefined) {
      return Either.left(`Unknown benchmark "${input.benchmarkId}"`);
    }
    return Either.right({
      benchmark: nativeBenchmark,
      benchmarkLayer: makeBenchmarkLayer(
        nativeBenchmark,
        input,
        input.benchmarkConfig,
        providerConfig
      ),
    });
  }
  if (input.injectedBenchmark === undefined) {
    return Either.left(
      `An injected benchmark is required for injected config "${input.benchmarkId}"`
    );
  }
  if (input.injectedBenchmark.id !== input.benchmarkId) {
    return Either.left(
      `Benchmark id mismatch: requested "${input.benchmarkId}", supplied "${input.injectedBenchmark.id}"`
    );
  }
  return Either.right({
    benchmark: input.injectedBenchmark,
    benchmarkLayer: makeBenchmarkLayer(
      input.injectedBenchmark,
      input,
      input.benchmarkConfig,
      providerConfig
    ),
  });
}
