import type { RunStatus } from "./runTypes";

export function nodeTypeLabel(modality?: string, modelId?: unknown) { return typeof modelId === "string" ? modelId : modality ?? "Input"; }
export function date(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value)) : "—"; }
export function statusColor(status: RunStatus | string) { return status === "succeeded" || status === "published" ? "hiveSuccess" : status === "failed" ? "hiveError" : status === "running" ? "hiveSky" : status === "queued" || status === "awaiting_publish" || status === "awaiting_review" ? "hiveWarning" : "gray"; }
export function active(status: RunStatus) { return status === "queued" || status === "running" || status === "cancel_requested"; }
export function timingLabel(startedAt: string | null, finishedAt: string | null, now: number, workflowComplete = false) {
  if (!startedAt) return finishedAt ? "Not started · Finished " + date(finishedAt) : "Waiting to start";
  if (workflowComplete && !finishedAt) return "Workflow complete";
  const end = finishedAt ? new Date(finishedAt).getTime() : now;
  const totalSeconds = Math.floor(Math.max(0, end - new Date(startedAt).getTime()) / 1000);
  const duration = Math.floor(totalSeconds / 60) + "m " + String(totalSeconds % 60).padStart(2, "0") + "s";
  return finishedAt ? duration + " · Finished " + date(finishedAt) : duration + " elapsed";
}
