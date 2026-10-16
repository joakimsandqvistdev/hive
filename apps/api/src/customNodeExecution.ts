import type { ModelIoContract } from "./modelContracts.js";
import type { WorkflowDefinition } from "./workflowDefinition.js";
import { deriveCustomNodeInterface, type BoundaryPort, type CustomNodeCatalogItem, type CustomNodeInterfaceSelection } from "./customNodeCatalog.js";

type Endpoint = { nodeId: string; portKey: string };
type Expanded = { definition: WorkflowDefinition; inputs: BoundaryPort[]; outputs: BoundaryPort[] };

export function expandCustomNodes(definition: WorkflowDefinition, models: ModelIoContract[], catalog: CustomNodeCatalogItem[]): WorkflowDefinition {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const expand = (source: WorkflowDefinition, prefix: string, stack: Set<string>, selection: CustomNodeInterfaceSelection | null = null): Expanded => {
    const childContracts = new Map(catalog.map((item) => [item.id, item.contract]));
    const nodeInterface = deriveCustomNodeInterface(source, models, childContracts, selection);
    if (!nodeInterface) throw new Error("custom_node_missing");
    const children = new Map<string, Expanded>();
    const nodes: WorkflowDefinition["nodes"] = [];
    const edges: WorkflowDefinition["edges"] = [];
    for (const node of source.nodes) {
      if (node.kind !== "custom") {
        nodes.push({ ...node, id: `${prefix}${node.id}` });
        continue;
      }
      const id = String(node.parameters?.customNodeId ?? "");
      const item = byId.get(id);
      if (!item) throw new Error("custom_node_missing");
      if (stack.has(id)) throw new Error("custom_node_cycle");
      const nextStack = new Set(stack); nextStack.add(id);
      const child = expand(item.definition as unknown as WorkflowDefinition, `${prefix}${node.id}__`, nextStack, item.interfaceSelection);
      children.set(node.id, child);
      nodes.push(...child.definition.nodes);
      edges.push(...child.definition.edges);
    }
    const resolve = (nodeId: string, key: string | null | undefined, direction: "input" | "output"): Endpoint => {
      const node = source.nodes.find((item) => item.id === nodeId);
      if (!node) throw new Error("custom_node_missing");
      if (node.kind !== "custom") return { nodeId: `${prefix}${nodeId}`, portKey: key ?? "" };
      const child = children.get(nodeId);
      const port = (direction === "input" ? child?.inputs : child?.outputs)?.find((item) => item.portKey === key);
      if (!port) throw new Error("custom_node_interface_outdated");
      return { nodeId: port.boundaryNodeId, portKey: port.boundaryPortKey };
    };
    for (const edge of source.edges) {
      const from = resolve(edge.source, edge.sourceHandle, "output");
      const to = resolve(edge.target, edge.targetHandle, "input");
      edges.push({ ...edge, id: `${prefix}${edge.id}`, source: from.nodeId, sourceHandle: from.portKey, target: to.nodeId, targetHandle: to.portKey });
    }
    const mapBoundary = (port: BoundaryPort, direction: "input" | "output"): BoundaryPort => {
      const node = source.nodes.find((item) => item.id === port.boundaryNodeId);
      if (node?.kind === "custom") {
        const child = children.get(node.id);
        const nested = (direction === "input" ? child?.inputs : child?.outputs)?.find((item) => item.portKey === port.boundaryPortKey);
        if (!nested) throw new Error("custom_node_interface_outdated");
        return { ...port, boundaryNodeId: nested.boundaryNodeId, boundaryPortKey: nested.boundaryPortKey };
      }
      return { ...port, boundaryNodeId: `${prefix}${port.boundaryNodeId}` };
    };
    return {
      definition: { nodes, edges },
      inputs: nodeInterface.inputs.map((port) => mapBoundary(port, "input")),
      outputs: nodeInterface.outputs.map((port) => mapBoundary(port, "output")),
    };
  };
  const expanded = expand(definition, "", new Set()).definition;
  if (expanded.nodes.length > 100 || expanded.edges.length > 300) throw new Error("custom_node_graph_too_large");
  return expanded;
}
