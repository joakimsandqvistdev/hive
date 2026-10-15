import { randomInt } from "node:crypto";
import { FormData } from "undici";
import { audioModelParametersSchema } from "./audioModelParameters.js";
import { imageModelParametersSchema } from "./modelParameters.js";
import { videoModelParametersSchema } from "./videoModelParameters.js";

export type SnapshotNode = {
  id: string; kind: "input" | "model" | "processing"; label: string; modelId?: string; dataTypeId?: string;
  inputText?: string; artifactId?: string; parameters?: Record<string, unknown>;
  position?: { x?: number; y?: number };
  modelIoContract?: { modality: string; inputs: Array<{ portKey: string; dataTypeId: string; sortOrder: number }>; outputs: Array<{ portKey: string; dataTypeId: string }> };
};
export type SnapshotEdge = { source: string; sourceHandle: string; target: string; targetHandle: string };
export type NodeOutput = { dataTypeId: string; text?: string; artifactId?: string };
export type BoundModelInput = { port: { portKey: string; dataTypeId: string; sortOrder: number }; output: NodeOutput };
export type ResolvedModelSettings = { modality: "image" | "video" | "audio"; parameters: Record<string, unknown> };
export type RunnerInput = {
  modality: "image" | "video" | "audio";
  form: FormData;
  outputDataTypeId: "image" | "video" | "audio";
  mediaType: "image/png" | "video/mp4" | "audio/wav";
  extension: "png" | "mp4" | "wav";
  maxOutputBytes: number;
};
export type ResolvedArtifact = {
  dataTypeId: string; runId: string | null; byteSize: number; mediaType: string;
  displayName: string; readBytes: () => Promise<Uint8Array>;
};

export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function bindModelInputs(
  node: SnapshotNode,
  edges: SnapshotEdge[],
  outputs: Map<string, NodeOutput>,
  nodeById: Map<string, SnapshotNode>,
): BoundModelInput[] {
  const contract = node.modelIoContract;
  if (!contract) throw new Error("Model input/output contract is missing.");
  const incoming = edges.filter((edge) => edge.target === node.id).sort((a, b) => {
    const order = (key: string) => contract.inputs.find((port) => port.portKey === key)?.sortOrder ?? 0;
    const left = nodeById.get(a.source)?.position ?? {}, right = nodeById.get(b.source)?.position ?? {};
    return order(a.targetHandle) - order(b.targetHandle) || (left.y ?? 0) - (right.y ?? 0) || (left.x ?? 0) - (right.x ?? 0) || a.source.localeCompare(b.source);
  });
  return incoming.map((edge) => {
    const output = outputs.get(edge.source);
    const port = contract.inputs.find((input) => input.portKey === edge.targetHandle);
    if (!output || !port || output.dataTypeId !== port.dataTypeId) throw new Error("Connected node output does not match the model input datatype.");
    return { port, output };
  });
}

export function resolveModelSettings(node: SnapshotNode): ResolvedModelSettings {
  const modality = node.modelIoContract?.modality;
  if (modality !== "image" && modality !== "video" && modality !== "audio") throw new Error("Model input/output contract is missing.");
  const parameterSchema = modality === "video" ? videoModelParametersSchema : modality === "audio" ? audioModelParametersSchema : imageModelParametersSchema;
  const parsed = parameterSchema.safeParse({ ...node.parameters, modelId: node.modelId });
  if (!parsed.success) throw new Error("Model settings are invalid. Edit and save the workflow again.");
  const configured = parsed.data as Record<string, unknown>;
  if (modality === "audio") return { modality, parameters: configured };
  if (typeof configured.resolution !== "string" || typeof configured.seed !== "number" || typeof configured.randomizeSeed !== "boolean") {
    throw new Error("Model settings are invalid. Edit and save the workflow again.");
  }
  const [width, height] = configured.resolution.split("x").map(Number);
  return {
    modality,
    parameters: { ...configured, width, height, seed: configured.randomizeSeed ? randomInt(0, 2_147_483_648) : configured.seed },
  };
}

export async function buildRunnerInput(
  bound: BoundModelInput[],
  modality: ResolvedModelSettings["modality"],
  settings: Record<string, unknown>,
  loadArtifact: (artifactId: string, dataTypeId: string) => Promise<ResolvedArtifact>,
): Promise<RunnerInput> {
  const prompt = bound.find((input) => input.port.portKey === "prompt")?.output.text?.trim();
  if (!prompt) throw new Error("Connect a nonempty text input to the model prompt port.");
  const form = new FormData();
  form.set("model_id", String(settings.modelId));
  form.set("prompt", prompt);
  if (modality === "audio") {
    form.set("voice", String(settings.voice));
    form.set("speed", String(settings.speed));
  } else {
    form.set("seed", String(settings.seed));
    form.set("num_inference_steps", String(settings.steps));
    form.set("width", String(settings.width));
    form.set("height", String(settings.height));
  }
  if (modality === "video") {
    form.set("frames", String(settings.frames));
    form.set("fps", String(settings.fps));
    form.set("guidance_scale", String(settings.guidanceScale));
    form.set("negative_prompt", bound.find((input) => input.port.portKey === "negative_prompt")?.output.text ?? "");
  } else if (modality === "image") {
    for (const [key, field] of [["trueCfgScale", "true_cfg_scale"], ["imageGuidanceScale", "image_guidance_scale"], ["guidanceScale", "guidance_scale"], ["strength", "strength"]]) {
      if (settings[key!] !== undefined) form.set(field!, String(settings[key!]));
    }
  }

  let referenceBytes = 0;
  for (const input of bound.filter((item) => item.output.dataTypeId !== "text")) {
    const artifactId = input.output.artifactId;
    if (!artifactId) throw new Error("Connected input did not produce a file.");
    const artifact = await loadArtifact(artifactId, input.output.dataTypeId);
    if (artifact.dataTypeId !== input.output.dataTypeId) {
      throw new Error("Connected file is unavailable.");
    }
    referenceBytes += artifact.byteSize;
    if (artifact.byteSize > 10 * 1024 * 1024 || referenceBytes > 25 * 1024 * 1024) throw new Error("Image references exceed their size limits.");
    const bytes = await artifact.readBytes();
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    form.append("images", new Blob([buffer], { type: artifact.mediaType }), artifact.displayName);
  }

  const output = modality === "video" ? { outputDataTypeId: "video", mediaType: "video/mp4", extension: "mp4", maxOutputBytes: 50 * 1024 * 1024 }
    : modality === "audio" ? { outputDataTypeId: "audio", mediaType: "audio/wav", extension: "wav", maxOutputBytes: 25 * 1024 * 1024 }
      : { outputDataTypeId: "image", mediaType: "image/png", extension: "png", maxOutputBytes: 25 * 1024 * 1024 };
  return { modality, form, ...output } as RunnerInput;
}
