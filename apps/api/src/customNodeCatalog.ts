import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./db.js";
import type { ModelIoContract, ModelIoPort } from "./modelContracts.js";
import type { WorkflowDefinition } from "./workflowDefinition.js";
import { loadModelIoContracts } from "./modelContracts.js";
import { processingContract, instagramPublishingContract } from "./processingNodes.js";
import { workflowEdges, workflowNodes, workflows } from "./schema.js";

export type BoundaryPort = ModelIoPort & { boundaryNodeId: string; boundaryPortKey: string };
export type CustomNodeInterfaceSelection = { inputs: Array<{ nodeId: string; portKey: string; label?: string }>; outputs: Array<{ nodeId: string; portKey: string; label?: string }> };
export type CustomNodeInterface = { inputs: BoundaryPort[]; outputs: BoundaryPort[]; signature: string };
export type CustomNodeCatalogItem = {
  id: string; name: string; description: string; needsAttention: boolean;
  definition: { nodes: Array<Record<string, any>>; edges: Array<Record<string, any>> };
  interfaceSelection: CustomNodeInterfaceSelection | null;
  interface: CustomNodeInterface;
  contract: ModelIoContract;
};

export function snapshotCustomNodeReferences(definition: WorkflowDefinition, catalog: CustomNodeCatalogItem[]): WorkflowDefinition {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  return { ...definition, nodes: definition.nodes.map((node) => {
    if (node.kind !== "custom") return node;
    const existing = savedInterface(node);
    if (existing) return node;
    const customNodeId = String(node.parameters?.customNodeId ?? "");
    const item = byId.get(customNodeId);
    return item ? { ...node, parameters: { ...node.parameters, customInterfaceSnapshot: item.interface } } : node;
  }) };
}

export function hasOutdatedCustomNodeReferences(definition: WorkflowDefinition, catalog: CustomNodeCatalogItem[], attentionById?: Map<string, boolean>) {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  return definition.nodes.some((node) => {
    if (node.kind !== "custom") return false;
    const customNodeId = String(node.parameters?.customNodeId ?? "");
    const current = byId.get(customNodeId);
    const snapshot = savedInterface(node);
    return !current || (attentionById?.get(customNodeId) ?? current.needsAttention) || !snapshot || current.interface.signature !== snapshot.signature;
  });
}

function definitionFor(nodes: typeof workflowNodes.$inferSelect[], edges: typeof workflowEdges.$inferSelect[]) {
  return {
    nodes: nodes.map(({ nodeId, kind, label, modelId, dataTypeId, inputText, artifactId, parameters, positionX, positionY }) => ({
      id: nodeId, kind, label, modelId, dataTypeId, inputText, artifactId, parameters, position: { x: positionX, y: positionY },
    })),
    edges: edges.map(({ edgeId, sourceNodeId, sourceHandle, targetNodeId, targetHandle }) => ({ id: edgeId, source: sourceNodeId, sourceHandle, target: targetNodeId, targetHandle })),
  };
}

function savedInterface(node: { parameters?: Record<string, unknown> }) {
  const snapshot = node.parameters?.customInterfaceSnapshot;
  if (!snapshot || typeof snapshot !== "object") return null;
  const value = snapshot as Partial<CustomNodeInterface>;
  if (!Array.isArray(value.inputs) || !Array.isArray(value.outputs)) return null;
  return { inputs: value.inputs as BoundaryPort[], outputs: value.outputs as BoundaryPort[], signature: typeof value.signature === "string" ? value.signature : "" };
}

export function portHash(direction: string, nodeId: string, portKey: string) {
  return `${direction === "input" ? "in" : "out"}_${createHash("sha1").update(`${nodeId}\0${portKey}`).digest("hex").slice(0, 12)}`;
}

function nodeContract(node: Record<string, any>, models: ModelIoContract[], customContracts: Map<string, ModelIoContract>): ModelIoContract | null {
  if (node.kind === "input") {
    const type = String(node.dataTypeId ?? "text");
    return { modelId: `input:${node.id}`, name: node.label, modality: "custom", inputs: [], outputs: [{ direction: "output", portKey: "output", dataTypeId: type, dataTypeLabel: type, mediaType: type === "text" ? "text/plain" : `${type}/*`, label: type, transport: null, minCount: 0, maxCount: 1, sortOrder: 0 }], inputGroups: [] };
  }
  if (node.kind === "model") return models.find((item) => item.modelId === node.modelId) ?? null;
  if (node.kind === "processing") return processingContract(node.parameters ?? {}) ?? null;
  if (node.kind === "publishing") return instagramPublishingContract(node.parameters ?? {}) ?? null;
  if (node.kind === "custom") {
    const id = String(node.parameters?.customNodeId ?? "");
    return customContracts.get(id) ?? snapshotContract(node);
  }
  return null;
}

function snapshotContract(node: Record<string, any>): ModelIoContract | null {
  const snapshot = savedInterface(node);
  if (!snapshot) return null;
  const port = (item: BoundaryPort): ModelIoPort => ({ direction: item.direction, portKey: item.portKey, dataTypeId: item.dataTypeId, dataTypeLabel: item.dataTypeLabel, mediaType: item.mediaType, label: item.label, transport: item.transport, minCount: item.minCount, maxCount: item.maxCount, sortOrder: item.sortOrder });
  return { modelId: `custom-node:${node.parameters.customNodeId ?? "missing"}`, name: String(node.label ?? "Missing custom node"), modality: "custom", inputs: snapshot.inputs.map(port), outputs: snapshot.outputs.map(port), inputGroups: [] };
}

export function isCustomNodeInterfaceSelectionValid(definition: { nodes: Array<Record<string, any>>; edges: Array<Record<string, any>> }, models: ModelIoContract[], customContracts: Map<string, ModelIoContract>, selection: CustomNodeInterfaceSelection): boolean {
  const keys = { inputs: new Set<string>(), outputs: new Set<string>() };
  for (const node of definition.nodes) {
    const contract = nodeContract(node, models, customContracts);
    if (!contract) return false;
    for (const direction of ["inputs", "outputs"] as const) {
      const ports = direction === "inputs" ? contract.inputs : contract.outputs;
      for (const port of ports) keys[direction].add(`${node.id}\0${port.portKey}`);
    }
  }
  for (const direction of ["inputs", "outputs"] as const) {
    const requested = selection[direction];
    const seen = new Set<string>();
    for (const item of requested) {
      const key = `${item.nodeId}\0${item.portKey}`;
      if (!keys[direction].has(key) || seen.has(key)) return false;
      seen.add(key);
    }
  }
  return true;
}

export function deriveCustomNodeInterface(definition: { nodes: Array<Record<string, any>>; edges: Array<Record<string, any>> }, models: ModelIoContract[], customContracts: Map<string, ModelIoContract>, selection: CustomNodeInterfaceSelection | null = null): CustomNodeInterface | null {
  const contracts = new Map<string, ModelIoContract>();
  for (const node of definition.nodes) {
    const contract = nodeContract(node, models, customContracts);
    if (!contract) return null;
    contracts.set(node.id, contract);
  }
  const connectedInputs = new Set<string>();
  const connectedOutputs = new Set<string>();
  for (const edge of definition.edges) {
    const sourceContract = contracts.get(edge.source);
    const targetContract = contracts.get(edge.target);
    const source = sourceContract?.outputs.find((port) => !edge.sourceHandle || port.portKey === edge.sourceHandle);
    const target = targetContract?.inputs.find((port) => !edge.targetHandle || port.portKey === edge.targetHandle);
    if (source && target) {
      connectedOutputs.add(`${edge.source}\0${source.portKey}`);
      connectedInputs.add(`${edge.target}\0${target.portKey}`);
    }
  }
  const inputs: BoundaryPort[] = [];
  const outputs: BoundaryPort[] = [];
  for (const node of [...definition.nodes].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const contract = contracts.get(node.id)!;
    for (const port of contract.inputs) {
      const selected = selection?.inputs.find((item) => item.nodeId === node.id && item.portKey === port.portKey);
      if (selection ? selected : !connectedInputs.has(`${node.id}\0${port.portKey}`)) inputs.push({ ...port, label: selected?.label?.trim() || port.label, portKey: portHash("input", node.id, port.portKey), boundaryNodeId: node.id, boundaryPortKey: port.portKey, sortOrder: inputs.length });
    }
    for (const port of contract.outputs) {
      const selected = selection?.outputs.find((item) => item.nodeId === node.id && item.portKey === port.portKey);
      if (selection ? selected : !connectedOutputs.has(`${node.id}\0${port.portKey}`)) outputs.push({ ...port, label: selected?.label?.trim() || port.label, portKey: portHash("output", node.id, port.portKey), boundaryNodeId: node.id, boundaryPortKey: port.portKey, sortOrder: outputs.length });
    }
  }
  const signature = JSON.stringify({ inputs: inputs.map(({ portKey, label, dataTypeId, minCount, maxCount }) => ({ portKey, label, dataTypeId, minCount, maxCount })), outputs: outputs.map(({ portKey, label, dataTypeId }) => ({ portKey, label, dataTypeId })) });
  return { inputs, outputs, signature };
}

export async function loadCustomNodeCatalog(ownerId: string): Promise<CustomNodeCatalogItem[]> {
  const rows = await db.select().from(workflows).where(and(eq(workflows.userId, ownerId), eq(workflows.isCustomNode, true)));
  if (!rows.length) return [];
  const [nodeRows, edgeRows, models] = await Promise.all([
    db.select().from(workflowNodes).where(eq(workflowNodes.userId, ownerId)),
    db.select().from(workflowEdges).where(eq(workflowEdges.userId, ownerId)),
    loadModelIoContracts(),
  ]);
  const definitions = new Map(rows.map((row) => [row.id, definitionFor(nodeRows.filter((node) => node.workflowId === row.id), edgeRows.filter((edge) => edge.workflowId === row.id))]));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const cache = new Map<string, CustomNodeCatalogItem>();
  const resolving = new Set<string>();
  const resolve = (id: string): CustomNodeCatalogItem | null => {
    const cached = cache.get(id);
    if (cached) return cached;
    const row = rowById.get(id);
    const definition = definitions.get(id);
    if (!row || !definition || resolving.has(id)) return null;
    resolving.add(id);
    const childContracts = new Map<string, ModelIoContract>();
    for (const node of definition.nodes.filter((item) => item.kind === "custom")) {
      const childId = String(node.parameters?.customNodeId ?? "");
      const child = resolve(childId);
      if (child) childContracts.set(child.id, child.contract);
    }
    const nodeInterface = deriveCustomNodeInterface(definition, models, childContracts, row.interfaceSelection) ?? { inputs: [], outputs: [], signature: "invalid" };
    const contract: ModelIoContract = { modelId: `custom-node:${id}`, name: row.name, modality: "custom", inputs: nodeInterface.inputs.map(({ boundaryNodeId: _n, boundaryPortKey: _p, ...port }) => port), outputs: nodeInterface.outputs.map(({ boundaryNodeId: _n, boundaryPortKey: _p, ...port }) => port), inputGroups: [] };
    const item = { id, name: row.name, description: row.description, needsAttention: row.needsAttention, definition, interfaceSelection: row.interfaceSelection, interface: nodeInterface, contract };
    cache.set(id, item);
    resolving.delete(id);
    return item;
  };
  return rows.map((row) => resolve(row.id)).filter((item): item is CustomNodeCatalogItem => Boolean(item));
}
