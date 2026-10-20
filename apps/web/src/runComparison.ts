import type { Artifact, Detail, RunNode } from "./runTypes";

const secretKey = /(secret|token|password|credential|authorization|api[-_]?key|client[-_]?secret)/i;

export function redactSensitive(value: unknown, key = ""): unknown {
  if (secretKey.test(key)) return "[redacted]";
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [childKey, redactSensitive(child, childKey)]));
  }
  return value;
}

export function stableStringify(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)]));
    return item;
  };
  return JSON.stringify(normalize(value));
}

export function displayJson(value: unknown, limit = 12_000): string {
  const result = JSON.stringify(redactSensitive(value), null, 2) ?? "Unavailable";
  return result.length > limit ? `${result.slice(0, limit)}\n… truncated` : result;
}

export function safeErrorSummary(value: string): string {
  return value.slice(0, 1000)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/((?:access|refresh)?[_-]?(?:token|secret|password|credential|authorization|api[_-]?key))\s*[:=]\s*["']?[^\s,"'}]+/gi, "$1=[redacted]");
}

export function nodeLabel(node: RunNode): string {
  return node.nodeSnapshotJson?.name ?? node.nodeSnapshotJson?.label ?? node.nodeId;
}

export function nodeKind(node: RunNode): string {
  return String(node.nodeSnapshotJson?.kind ?? node.nodeSnapshotJson?.modality ?? node.nodeSnapshotJson?.dataTypeId ?? "unknown");
}

export function suggestedMatchKey(node: RunNode): string {
  return `${nodeKind(node).toLowerCase()}|${nodeLabel(node).trim().replace(/\s+/g, " ").toLowerCase()}`;
}

export function nodeDuration(node: RunNode): number | null {
  if (!node.startedAt || !node.finishedAt) return null;
  const duration = new Date(node.finishedAt).getTime() - new Date(node.startedAt).getTime();
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

export type NodePair = { baseline: RunNode | null; comparison: RunNode | null; matchKind: "id" | "confirmed" | "unmatched" };

export function pairNodes(baseline: RunNode[], comparison: RunNode[], confirmedMatches: Record<string, string>): NodePair[] {
  const rightById = new Map(comparison.map((node) => [node.nodeId, node]));
  const matchedRight = new Set<string>();
  const pairs: NodePair[] = [];
  for (const left of baseline) {
    const sameId = rightById.get(left.nodeId);
    if (sameId) { matchedRight.add(sameId.nodeId); pairs.push({ baseline: left, comparison: sameId, matchKind: "id" }); continue; }
    const chosenId = confirmedMatches[left.nodeId];
    const chosen = chosenId ? rightById.get(chosenId) : undefined;
    if (chosen && !matchedRight.has(chosen.nodeId)) { matchedRight.add(chosen.nodeId); pairs.push({ baseline: left, comparison: chosen, matchKind: "confirmed" }); }
    else pairs.push({ baseline: left, comparison: null, matchKind: "unmatched" });
  }
  for (const right of comparison) if (!matchedRight.has(right.nodeId)) pairs.push({ baseline: null, comparison: right, matchKind: "unmatched" });
  return pairs;
}

export function suggestedMatches(baseline: RunNode[], comparison: RunNode[], confirmedMatches: Record<string, string>): Array<{ baseline: RunNode; comparison: RunNode }> {
  const leftUsed = new Set(Object.keys(confirmedMatches));
  const rightUsed = new Set(Object.values(confirmedMatches));
  const leftByKey = new Map<string, RunNode[]>();
  const rightByKey = new Map<string, RunNode[]>();
  for (const node of baseline) if (!comparison.some((right) => right.nodeId === node.nodeId) && !leftUsed.has(node.nodeId)) leftByKey.set(suggestedMatchKey(node), [...(leftByKey.get(suggestedMatchKey(node)) ?? []), node]);
  for (const node of comparison) if (!baseline.some((left) => left.nodeId === node.nodeId) && !rightUsed.has(node.nodeId)) rightByKey.set(suggestedMatchKey(node), [...(rightByKey.get(suggestedMatchKey(node)) ?? []), node]);
  const matches: Array<{ baseline: RunNode; comparison: RunNode }> = [];
  for (const [key, leftNodes] of leftByKey) {
    const rightNodes = rightByKey.get(key) ?? [];
    if (leftNodes.length === 1 && rightNodes.length === 1) matches.push({ baseline: leftNodes[0]!, comparison: rightNodes[0]! });
  }
  return matches;
}

export type OutputState = "same" | "changed" | "only-baseline" | "only-comparison" | "unavailable" | "missing";

export function outputState(left: RunNode | null, right: RunNode | null, artifactsA: Artifact[], artifactsB: Artifact[]): OutputState {
  if (!left) return right?.outputJson ? "only-comparison" : "missing";
  if (!right) return left.outputJson ? "only-baseline" : "missing";
  const a = left.outputJson;
  const b = right.outputJson;
  if (!a && !b) return "missing";
  if (!a) return "only-comparison";
  if (!b) return "only-baseline";
  if (typeof a.text === "string" || typeof b.text === "string") return a.text === b.text ? "same" : "changed";
  if (typeof a.artifactId === "string" || typeof b.artifactId === "string") {
    if (!a.artifactId || !b.artifactId) return a.artifactId ? "only-baseline" : "only-comparison";
    const artifactA = artifactsA.find((artifact) => artifact.id === a.artifactId);
    const artifactB = artifactsB.find((artifact) => artifact.id === b.artifactId);
    if (!artifactA || !artifactB) return "unavailable";
    if (!artifactA.checksum || !artifactB.checksum) return "unavailable";
    return artifactA.checksum === artifactB.checksum ? "same" : "changed";
  }
  return stableStringify(a) === stableStringify(b) ? "same" : "changed";
}

export function nodeChanged(pair: NodePair, artifactsA: Artifact[], artifactsB: Artifact[]): boolean {
  const { baseline: left, comparison: right } = pair;
  if (!left || !right) return true;
  const leftSettings = { kind: nodeKind(left), label: nodeLabel(left), modelId: left.nodeSnapshotJson?.modelId ?? left.parameters?.modelId, dataTypeId: left.nodeSnapshotJson?.dataTypeId, parameters: redactSensitive(left.parameters ?? {}), resolvedInput: redactSensitive(left.resolvedInputJson ?? null), inputText: left.nodeSnapshotJson?.inputText };
  const rightSettings = { kind: nodeKind(right), label: nodeLabel(right), modelId: right.nodeSnapshotJson?.modelId ?? right.parameters?.modelId, dataTypeId: right.nodeSnapshotJson?.dataTypeId, parameters: redactSensitive(right.parameters ?? {}), resolvedInput: redactSensitive(right.resolvedInputJson ?? null), inputText: right.nodeSnapshotJson?.inputText };
  const output = outputState(left, right, artifactsA, artifactsB);
  return left.status !== right.status || stableStringify(leftSettings) !== stableStringify(rightSettings) || (output !== "same" && output !== "missing");
}

export type TextDiffRow = { kind: "same" | "added" | "removed"; text: string };

export function diffLines(left: string, right: string): TextDiffRow[] {
  const a = left.split("\n");
  const b = right.split("\n");
  if (a.length * b.length > 1_000_000) return [{ kind: "removed", text: left.slice(0, 4000) }, { kind: "added", text: right.slice(0, 4000) }];
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const rows: TextDiffRow[] = [];
  let i = 0; let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { rows.push({ kind: "same", text: a[i++]! }); j++; }
    else if (table[i + 1]![j]! >= table[i]![j + 1]!) rows.push({ kind: "removed", text: a[i++]! });
    else rows.push({ kind: "added", text: b[j++]! });
  }
  while (i < a.length) rows.push({ kind: "removed", text: a[i++]! });
  while (j < b.length) rows.push({ kind: "added", text: b[j++]! });
  return rows;
}

export function workflowDefinitionChanged(a: Detail, b: Detail): boolean {
  return stableStringify(redactSensitive(a.run.workflowSnapshotJson)) !== stableStringify(redactSensitive(b.run.workflowSnapshotJson));
}

export function runInputsChanged(a: Detail, b: Detail): boolean {
  return stableStringify(redactSensitive(a.run.inputJson ?? {})) !== stableStringify(redactSensitive(b.run.inputJson ?? {}));
}
