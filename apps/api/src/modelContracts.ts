import { asc, eq } from "drizzle-orm";
import { db } from "./db.js";
import { dataTypes, modelDataTypes, modelInputGroupPorts, modelInputGroups, models } from "./schema.js";

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
  modality: "image" | "video" | "audio" | "text";
  inputs: ModelIoPort[];
  outputs: ModelIoPort[];
  inputGroups: ModelInputGroup[];
};

export async function loadDataTypes() { return db.select().from(dataTypes).orderBy(asc(dataTypes.label)); }

export async function loadModelIoContracts(): Promise<ModelIoContract[]> {
  const [modelRows, portRows, groupRows, memberRows] = await Promise.all([
    db.select().from(models).where(eq(models.enabled, true)).orderBy(asc(models.sortOrder), asc(models.id)),
    db.select({ modelId: modelDataTypes.modelId, direction: modelDataTypes.direction, portKey: modelDataTypes.portKey,
      dataTypeId: modelDataTypes.dataTypeId, dataTypeLabel: dataTypes.label, mediaType: dataTypes.mediaType,
      label: modelDataTypes.label, transport: modelDataTypes.transport, minCount: modelDataTypes.minCount,
      maxCount: modelDataTypes.maxCount, sortOrder: modelDataTypes.sortOrder })
      .from(modelDataTypes).innerJoin(dataTypes, eq(dataTypes.id, modelDataTypes.dataTypeId))
      .orderBy(asc(modelDataTypes.modelId), asc(modelDataTypes.direction), asc(modelDataTypes.sortOrder)),
    db.select().from(modelInputGroups).orderBy(asc(modelInputGroups.modelId), asc(modelInputGroups.groupKey)),
    db.select().from(modelInputGroupPorts),
  ]);
  const membersByGroup = new Map<string, string[]>();
  for (const member of memberRows) {
    const key = `${member.modelId}\0${member.groupKey}`;
    membersByGroup.set(key, [...(membersByGroup.get(key) ?? []), member.portKey]);
  }
  const groupsByModel = new Map<string, ModelInputGroup[]>();
  for (const group of groupRows) {
    groupsByModel.set(group.modelId, [...(groupsByModel.get(group.modelId) ?? []), {
      key: group.groupKey, label: group.label, minCount: group.minCount, maxCount: group.maxCount,
      portKeys: membersByGroup.get(`${group.modelId}\0${group.groupKey}`) ?? [],
    }]);
  }
  const contracts = new Map<string, ModelIoContract>(modelRows.map((model) => [model.id, {
    modelId: model.id, name: model.name, modality: model.modality, inputs: [], outputs: [], inputGroups: groupsByModel.get(model.id) ?? [],
  }]));
  for (const row of portRows) {
    const contract = contracts.get(row.modelId);
    if (!contract) continue;
    const port: ModelIoPort = { ...row, direction: row.direction, transport: row.transport };
    if (row.direction === "input") contract.inputs.push(port);
    else contract.outputs.push(port);
  }
  return [...contracts.values()];
}
