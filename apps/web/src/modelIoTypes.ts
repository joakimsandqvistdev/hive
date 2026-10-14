export type ModelIoPort = {
  direction: "input" | "output";
  portKey: string;
  dataTypeId: string;
  dataTypeLabel: string;
  mediaType: string;
  label: string;
  transport: "prompt" | "connection" | null;
  minCount: number;
  maxCount: number;
  sortOrder: number;
};

export type ModelInputGroup = { key: string; label: string; minCount: number; maxCount: number; portKeys: string[] };
export type ModelIoContract = {
  modelId: string;
  name: string;
  modality: "image" | "video";
  inputs: ModelIoPort[];
  outputs: ModelIoPort[];
  inputGroups: ModelInputGroup[];
};

export function formatModelPortCardinality(minCount: number, maxCount: number) {
  if (minCount === maxCount) return minCount === 1 ? "required" : `exactly ${minCount}`;
  return `${minCount}–${maxCount}`;
}
