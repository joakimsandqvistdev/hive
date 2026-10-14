import { modelRunnerRejection, modelRunnerTransportFailure, type RunnerModality } from "./modelRunnerErrors.js";

const modalityForLabel = (label: string): RunnerModality => label.toLowerCase() === "video" ? "video" : label.toLowerCase() === "audio" ? "audio" : "image";

/** @deprecated Use modelRunnerTransportFailure with a modality. */
export const imageRunnerTransportFailure = (error: unknown, runnerLabel = "Image"): string => modelRunnerTransportFailure(error, modalityForLabel(runnerLabel));

/** @deprecated Use modelRunnerRejection with a modality. */
export const imageRunnerRejection = (response: { status: number; json: () => Promise<unknown> }, runnerLabel = "Image"): Promise<string> => modelRunnerRejection(response, modalityForLabel(runnerLabel));

