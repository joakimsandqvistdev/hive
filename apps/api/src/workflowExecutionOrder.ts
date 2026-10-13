export type WorkflowExecutionNode = { id: string };
export type WorkflowExecutionEdge = { source: string; target: string };

/** Return the worker's stable, serial execution order for a workflow DAG. */
export function workflowExecutionOrder<TNode extends WorkflowExecutionNode>(
  nodes: TNode[],
  edges: WorkflowExecutionEdge[],
): TNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) {
      throw new Error("Workflow contains a connection to a missing node.");
    }
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)!.push(edge.target);
  }

  const ready = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const orderedNodes: TNode[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    orderedNodes.push(nodeById.get(id)!);
    for (const target of outgoing.get(id) ?? []) {
      const degree = (indegree.get(target) ?? 1) - 1;
      indegree.set(target, degree);
      if (degree === 0) ready.push(target);
    }
  }

  if (orderedNodes.length !== nodes.length) throw new Error("Workflow connections contain a cycle.");
  return orderedNodes;
}
