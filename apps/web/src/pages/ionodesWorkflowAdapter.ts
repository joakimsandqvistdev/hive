import { addNode, createGraph, type CompatibilityRule, type GraphDocument, type GraphNode as IonodesNode } from "ionodes";
import type { ModelIoContract } from "../modelIoTypes";
import type { DataType, Definition, NodeDefinition, WorkflowNode } from "./workflowTypes";
import { instagramPublishingContract, textOverlayContract } from "./processingNodeTypes";

type PortMetadata = {
  portKey: string;
  dataTypeLabel: string;
  mediaType: string;
  transport: "prompt" | "connection" | null;
  minCount: number;
  maxCount: number;
  sortOrder: number;
};

type WorkflowMetadata = {
  kind: NodeDefinition["kind"];
  modelId: string | null;
  dataTypeId: string | null;
  inputText: string;
  artifactId: string | null;
  parameters: Record<string, unknown>;
};

const datatypeColors: Record<string, string> = {
  text: "#63d5b0",
  image: "#b18cff",
  video: "#78a9ff",
  audio: "#f2bd63",
};

function colorForDatatype(dataTypeId: string) {
  const known = datatypeColors[dataTypeId];
  if (known) return known;
  let hash = 0;
  for (const character of dataTypeId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 82% 68%)`;
}

function portsForNode(node: NodeDefinition, contracts: ModelIoContract[], types: DataType[]) {
  const contract = contracts.find((item) => item.modelId === node.modelId);
  const processing = node.kind === "processing" && node.parameters.operationId === "text-overlay" ? textOverlayContract : undefined;
  const publishing = node.kind === "publishing" ? instagramPublishingContract(String(node.parameters.operationId ?? "")) : undefined;
  const dataType = types.find((item) => item.id === node.dataTypeId);
  const inputs = node.kind === "model" ? contract?.inputs ?? [] : node.kind === "processing" ? processing?.inputs ?? [] : node.kind === "publishing" ? publishing?.inputs ?? [] : [];
  const outputs = node.kind === "model" ? contract?.outputs ?? [] : node.kind === "processing" ? processing?.outputs ?? [] : node.kind === "publishing" ? publishing?.outputs ?? [] : dataType ? [{
    direction: "output" as const,
    portKey: "output",
    dataTypeId: dataType.id,
    dataTypeLabel: dataType.label,
    mediaType: dataType.mediaType,
    label: dataType.label,
    transport: null,
    minCount: 1,
    maxCount: 1,
    sortOrder: 0,
  }] : [];
  return { inputs, outputs, contract: contract ?? processing ?? publishing };
}

function toIonodesNode(node: NodeDefinition, contracts: ModelIoContract[], types: DataType[]): IonodesNode {
  const { inputs, outputs, contract } = portsForNode(node, contracts, types);
  const description = node.kind === "input"
    ? node.inputText || (node.artifactId ? "File uploaded" : "Input not set")
    : node.kind === "processing" ? "Processing · Text Overlay" : node.kind === "publishing" ? `Publishing · ${contract?.name ?? "Instagram"}` : contract?.name ?? "Model";
  return {
    id: node.id,
    title: node.label,
    description,
    position: node.position,
    connectors: [...inputs, ...outputs].map((port) => ({
      id: `${node.id}:${port.direction}:${port.portKey}`,
      direction: port.direction,
      label: port.label,
      type: port.dataTypeId,
      color: colorForDatatype(port.dataTypeId),
      cardinality: port.direction === "input" && port.maxCount === 1 ? "one" as const : "many" as const,
      metadata: {
        portKey: port.portKey,
        dataTypeLabel: port.dataTypeLabel,
        mediaType: port.mediaType,
        transport: port.transport,
        minCount: port.minCount,
        maxCount: port.maxCount,
        sortOrder: port.sortOrder,
      } satisfies PortMetadata,
    })),
    metadata: {
      kind: node.kind,
      modelId: node.modelId ?? null,
      dataTypeId: node.dataTypeId ?? null,
      inputText: node.inputText,
      artifactId: node.artifactId ?? null,
      parameters: node.parameters,
    } satisfies WorkflowMetadata,
  };
}

function portKey(connector: IonodesNode["connectors"][number]) {
  return (connector.metadata as PortMetadata | undefined)?.portKey;
}

function findConnector(node: IonodesNode, direction: "input" | "output", key?: string | null) {
  const candidates = node.connectors.filter((connector) => connector.direction === direction);
  return (key ? candidates.find((connector) => portKey(connector) === key) : undefined)
    ?? (candidates.length === 1 ? candidates[0] : undefined);
}

function findTargetConnector(node: IonodesNode, source: IonodesNode["connectors"][number], key?: string | null) {
  const candidates = node.connectors.filter((connector) => connector.direction === "input");
  if (key) return candidates.find((connector) => portKey(connector) === key);
  const compatible = candidates.filter((connector) => connector.type === source.type);
  return compatible.length === 1 ? compatible[0] : undefined;
}

export function toIonodesGraph(definition: Definition, contracts: ModelIoContract[], types: DataType[], graphId: string): GraphDocument {
  const graph = createGraph(graphId);
  const nodes = definition.nodes.map((node) => toIonodesNode(node, contracts, types));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return {
    ...graph,
    nodes,
    connections: definition.edges.map((edge) => {
      const source = nodesById.get(edge.source);
      const target = nodesById.get(edge.target);
      const sourceConnector = source && findConnector(source, "output", edge.sourceHandle);
      const targetConnector = target && sourceConnector && findTargetConnector(target, sourceConnector, edge.targetHandle);
      if (!source || !target || !sourceConnector || !targetConnector || sourceConnector.type !== targetConnector.type) {
        throw new Error("This workflow has a connection that cannot be mapped to its model ports. Review the workflow before editing it.");
      }
      return {
        id: edge.id,
        sourceNodeId: source.id,
        sourceConnectorId: sourceConnector.id,
        targetNodeId: target.id,
        targetConnectorId: targetConnector.id,
      };
    }),
  };
}

function workflowMetadata(node: IonodesNode): WorkflowMetadata {
  const metadata = node.metadata as Partial<WorkflowMetadata> | undefined;
  if ((metadata?.kind !== "input" && metadata?.kind !== "model" && metadata?.kind !== "processing" && metadata?.kind !== "publishing") || typeof metadata.parameters !== "object" || metadata.parameters === null) {
    throw new Error(`Node “${node.title}” is missing Hive workflow data.`);
  }
  return {
    kind: metadata.kind,
    modelId: typeof metadata.modelId === "string" ? metadata.modelId : null,
    dataTypeId: typeof metadata.dataTypeId === "string" ? metadata.dataTypeId : null,
    inputText: typeof metadata.inputText === "string" ? metadata.inputText : "",
    artifactId: typeof metadata.artifactId === "string" ? metadata.artifactId : null,
    parameters: metadata.parameters as Record<string, unknown>,
  };
}

function portFromConnector(connector: IonodesNode["connectors"][number]) {
  const metadata = connector.metadata as PortMetadata | undefined;
  if (!metadata) throw new Error(`Port “${connector.label ?? connector.id}” is missing Hive model data.`);
  return {
    direction: connector.direction,
    portKey: metadata.portKey,
    dataTypeId: connector.type ?? "",
    dataTypeLabel: metadata.dataTypeLabel,
    mediaType: metadata.mediaType,
    label: connector.label ?? metadata.portKey,
    transport: metadata.transport,
    minCount: metadata.minCount,
    maxCount: metadata.maxCount,
    sortOrder: metadata.sortOrder,
  };
}

export function toWorkflowNode(node: IonodesNode, contracts: ModelIoContract[]): WorkflowNode {
  const metadata = workflowMetadata(node);
  const contract = contracts.find((item) => item.modelId === metadata.modelId);
  return {
    id: node.id,
    position: node.position,
    data: {
      ...metadata,
      label: node.title,
      inputPorts: node.connectors.filter((connector) => connector.direction === "input").map(portFromConnector),
      outputPorts: node.connectors.filter((connector) => connector.direction === "output").map(portFromConnector),
      contract,
    },
  };
}

export function toWorkflowDefinition(graph: GraphDocument): Definition {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  return {
    nodes: graph.nodes.map((node) => {
      const metadata = workflowMetadata(node);
      return {
        id: node.id,
        ...metadata,
        label: node.title,
        position: node.position,
      };
    }),
    edges: graph.connections.map((connection) => {
      const source = nodesById.get(connection.sourceNodeId);
      const target = nodesById.get(connection.targetNodeId);
      const sourceConnector = source?.connectors.find((item) => item.id === connection.sourceConnectorId);
      const targetConnector = target?.connectors.find((item) => item.id === connection.targetConnectorId);
      if (!sourceConnector || !targetConnector) throw new Error("This workflow has a connection to a missing port.");
      return {
        id: connection.id,
        source: connection.sourceNodeId,
        sourceHandle: portKey(sourceConnector) ?? null,
        target: connection.targetNodeId,
        targetHandle: portKey(targetConnector) ?? null,
      };
    }),
  };
}

export const validateWorkflowConnection: CompatibilityRule = (source, target, graph) => {
  if (!source.type || source.type !== target.type) return "Connect ports with matching datatypes.";
  const metadata = target.metadata as PortMetadata | undefined;
  const maxCount = metadata?.maxCount;
  if (typeof maxCount === "number" && graph.connections.filter((connection) => connection.targetConnectorId === target.id).length >= maxCount) {
    return "This input has reached its connection limit.";
  }
  return true;
};

export function addWorkflowNode(graph: GraphDocument, node: NodeDefinition, contracts: ModelIoContract[], types: DataType[]) {
  return addNode(graph, toIonodesNode(node, contracts, types));
}
