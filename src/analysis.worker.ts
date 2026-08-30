import { runBudgetBeamSearch } from "./engine/index.js";
import type {
  BeamSearchOptions,
  BudgetPolicyResult,
  SingleRunResult,
} from "./engine/index.js";

export interface AnalysisWorkerRequest {
  kind: "beam";
  jobId: number;
  run: SingleRunResult;
  options?: BeamSearchOptions;
}

export type AnalysisWorkerResponse =
  | {
    kind: "beam-result";
    jobId: number;
    result: BudgetPolicyResult;
  }
  | {
    kind: "error";
    jobId: number;
    message: string;
  };

interface WorkerPort {
  postMessage(message: AnalysisWorkerResponse): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<AnalysisWorkerRequest>) => void,
  ): void;
}

const port = self as unknown as WorkerPort;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

port.addEventListener("message", (event) => {
  const request = event.data;
  try {
    port.postMessage({
      kind: "beam-result",
      jobId: request.jobId,
      result: runBudgetBeamSearch(request.run, request.options),
    });
  } catch (error) {
    port.postMessage({
      kind: "error",
      jobId: request.jobId,
      message: errorMessage(error),
    });
  }
});
