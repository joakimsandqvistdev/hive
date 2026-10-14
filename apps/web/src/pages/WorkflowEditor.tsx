import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addEdge, Background, BackgroundVariant, Controls, Handle, MiniMap, Position, ReactFlow, useEdgesState, useNodesState, type Connection, type Edge } from "@xyflow/react";
import { Alert, Badge, Button, Group, Loader, Modal, Paper, Select, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { API_BASE } from "../auth";
import { agentModalityLabel } from "../agentModality";
import { defaultImageModelParameters, imageModelOptions, ImageModelParametersFields } from "../components/ImageModelParametersFields";
import type { AppView } from "../navigation/navigationState";
import { emptyWorkflowForm } from "./workflowTypes";
import type { Agent, AgentNodeData, Definition, Workflow, WorkflowForm, WorkflowNode } from "./workflowTypes";
import "@xyflow/react/dist/style.css";

export function WorkflowEditor({ workflowId, onClose, onNavigate }: {
  workflowId: string;
  onClose: () => void;
  onNavigate: (view: AppView) => void;
}) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [draft, setDraft] = useState<WorkflowForm>(emptyWorkflowForm);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [startingRun, setStartingRun] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [formOpened, setFormOpened] = useState(false);
  const [form, setForm] = useState<WorkflowForm>(emptyWorkflowForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [removeNodeOpened, setRemoveNodeOpened] = useState(false);
  const nextNodeId = useRef(1);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true); setDetailError(null); setSaveError(null); setDirty(false);
    void Promise.all([
      fetch(`${API_BASE}/api/workflows/${workflowId}`, { credentials: "include" }),
      fetch(`${API_BASE}/api/agents?page=1&pageSize=50`, { credentials: "include" }),
    ]).then(async ([workflowResponse, agentsResponse]) => {
      const workflowBody = await workflowResponse.json() as { workflow?: Workflow; definition?: Definition };
      const agentBody = await agentsResponse.json() as { items?: Agent[] };
      if (!workflowResponse.ok) throw new Error(workflowResponse.status === 404 ? "This workflow could not be found." : "Could not open this workflow.");
      if (!agentsResponse.ok) throw new Error("Could not load the agent library.");
      if (cancelled || !workflowBody.workflow) return;
      const definition = workflowBody.definition ?? { nodes: [], edges: [] };
      const availableAgents = agentBody.items ?? [];
      setWorkflow(workflowBody.workflow);
      setDraft({ name: workflowBody.workflow.name, description: workflowBody.workflow.description });
      setAgents(availableAgents);
      const byId = new Map(availableAgents.map((agent) => [agent.id, agent]));
      const mappedNodes: WorkflowNode[] = definition.nodes.map((node) => {
        const agent = byId.get(node.agentId);
        const parameters = { ...defaultImageModelParameters, ...agent?.parameters, ...node.parameters } as AgentNodeData["parameters"];
        if (agent?.parameters.modelId && imageModelOptions.some((option) => option.value === agent.parameters.modelId)) {
          parameters.modelId = agent.parameters.modelId as typeof parameters.modelId;
        }
        return { id: node.id, type: "agent", position: node.position, data: {
          agentId: node.agentId, agentName: agent?.name ?? "Unavailable agent", modality: agent?.modality ?? "unknown",
          agentPrompt: agent?.prompt ?? "This agent is no longer available.", prompt: node.prompt ?? agent?.prompt ?? "",
          parameters,
        } };
      });
      setNodes(mappedNodes); setEdges(definition.edges); nextNodeId.current = mappedNodes.length + 1;
    }).catch((error: unknown) => { if (!cancelled) setDetailError(error instanceof Error ? error.message : "Could not open this workflow."); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [workflowId, setEdges, setNodes]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) => addEdge({ ...connection, animated: true }, current)); setDirty(true);
  }, [setEdges]);
  const selectedNode = nodes.find((node) => node.selected) ?? null;
  const agentOptions = useMemo(() => agents.map((agent) => ({ value: agent.id, label: `${agent.name} · ${agentModalityLabel(agent.modality, agent.parameters.modelId)}` })), [agents]);

  const addAgentNode = () => {
    const id = `node-${crypto.randomUUID?.() ?? nextNodeId.current++}`;
    const index = nodes.length;
    setNodes((current) => [...current, { id, type: "agent", position: { x: 90 + (index % 3) * 260, y: 90 + Math.floor(index / 3) * 170 }, data: {
      agentId: "", agentName: "Choose an agent", modality: "unconfigured", agentPrompt: "Select an existing agent in the configuration panel.", prompt: "", parameters: { ...defaultImageModelParameters },
    }, selected: true }]);
    setDirty(true);
  };

  const updateSelectedNode = (patch: Partial<AgentNodeData>) => {
    if (!selectedNode) return;
    setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, ...patch } } : node));
    setDirty(true);
  };
  const selectAgent = (agentId: string | null) => {
    const agent = agents.find((item) => item.id === agentId);
    updateSelectedNode({ agentId: agent?.id ?? "", agentName: agent?.name ?? "Choose an agent", modality: agent?.modality ?? "unconfigured", agentPrompt: agent?.prompt ?? "Select an existing agent in the configuration panel.", prompt: agent?.prompt ?? "", parameters: { ...defaultImageModelParameters, ...agent?.parameters } as AgentNodeData["parameters"] });
  };

  const saveWorkflow = async () => {
    if (!workflow) return;
    if (!draft.name.trim()) { setSaveError("Add a workflow name before saving."); return; }
    if (nodes.some((node) => !node.data.agentId)) { setSaveError("Choose an agent for every node before saving."); return; }
    setSaving(true); setSaveError(null);
    const definition: Definition = {
      nodes: nodes.map((node) => ({ id: node.id, agentId: node.data.agentId, prompt: node.data.prompt, parameters: node.data.parameters, position: node.position })),
      edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, targetHandle: edge.targetHandle })),
    };
    try {
      const response = await fetch(`${API_BASE}/api/workflows/${workflow.id}`, { method: "PUT", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...draft, definition }) });
      const body = await response.json() as { workflow?: Workflow; error?: string };
      if (!response.ok || !body.workflow) {
        const message = body.error === "invalid_workflow_agents" ? "One or more selected agents are unavailable. Review the nodes."
          : body.error === "unsupported_image_connections" ? "Connections must point to a Qwen-Image-Edit-2511 node and use image-node outputs."
          : body.error === "invalid_reference_count" ? "Check this model’s required Image and Mask connections on the workflow canvas."
              : "Could not save this workflow.";
        throw new Error(message);
      }
      setWorkflow({ ...body.workflow, nodeCount: nodes.length }); setDirty(false);
    } catch (error) { setSaveError(error instanceof Error ? error.message : "Could not save this workflow."); }
    finally { setSaving(false); }
  };

  const startRun = async () => {
    if (!workflow) return;
    setStartingRun(true); setRunError(null);
    try {
      const response = await fetch(`${API_BASE}/api/workflows/${workflow.id}/runs`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      const body = await response.json() as { run?: { id: string }; error?: string };
      if (!response.ok || !body.run) {
        const message = body.error === "workflow_has_no_nodes" ? "Add and save at least one agent node before running this workflow." : "Could not start this run. Check the workflow and try again.";
        throw new Error(message);
      }
      onNavigate("runs");
    } catch (error) { setRunError(error instanceof Error ? error.message : "Could not start this run."); }
    finally { setStartingRun(false); }
  };

  const removeSelectedNode = () => {
    if (!selectedNode) return;
    setNodes((current) => current.filter((node) => node.id !== selectedNode.id));
    setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id));
    setRemoveNodeOpened(false); setDirty(true);
  };

  return <div className="workflow-editor-page">
    <header className="workflow-editor-header">
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <Button variant="subtle" onClick={onClose}>← Workflows</Button>
          <div className="workflow-editor-title"><Text fw={650} lineClamp={1}>{workflow?.name ?? "Workflow"}</Text><Text size="xs" c={dirty ? "hiveWarning.8" : "dimmed"}>{dirty ? "Unsaved changes" : "All changes saved"}</Text></div>
          <Button variant="subtle" onClick={() => { setForm({ ...draft }); setFormError(null); setFormOpened(true); }}>Details</Button>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Button variant="light" onClick={() => void startRun()} loading={startingRun} disabled={!workflow || dirty || saving || nodes.length === 0}>Run workflow</Button>
          <Button onClick={() => void saveWorkflow()} loading={saving} disabled={!dirty}>Save workflow</Button>
        </Group>
      </Group>
    </header>
    {detailError && <Alert m="sm" color="hiveError" title="Could not open workflow">{detailError}</Alert>}
    {saveError && <Alert m="sm" color="hiveError" title="Could not save workflow">{saveError}</Alert>}
    {runError && <Alert m="sm" color="hiveError" title="Could not start run">{runError}</Alert>}
    {detailLoading ? <Group justify="center" className="workflow-editor-loading"><Loader size="sm" /><Text c="dimmed">Loading workflow…</Text></Group> : workflow && <div className="workflow-editor-body">
      <section className="workflow-editor-canvas" aria-label="Workflow canvas">
        <ReactFlow<WorkflowNode, Edge> nodes={nodes} edges={edges} onNodesChange={(changes) => { onNodesChange(changes); if (changes.some((change) => change.type === "position")) setDirty(true); }} onEdgesChange={(changes) => { onEdgesChange(changes); if (changes.some((change) => change.type === "remove")) setDirty(true); }} onConnect={onConnect} nodeTypes={nodeTypes} fitView deleteKeyCode={null} proOptions={{ hideAttribution: false }}>
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} /><Controls /><MiniMap pannable zoomable />
        </ReactFlow>
        {nodes.length === 0 && <div className="workflow-canvas-empty"><Text fw={600}>Start building this workflow</Text><Text size="sm" c="dimmed">Add an agent node, then choose an agent in the configuration panel.</Text></div>}
      </section>
      <aside className="workflow-config-panel" aria-label="Workflow and node configuration">
        <Group gap="xs" mb="lg" grow><Button variant="light" onClick={addAgentNode}>Add agent node</Button><Button variant="light" color="hiveError" disabled={!selectedNode} onClick={() => setRemoveNodeOpened(true)}>Remove selected</Button></Group>
        {selectedNode ? <Stack gap="md">
          <div><Text className="page-eyebrow">Node configuration</Text><Title order={2} size="h4" mt={5}>Agent node</Title></div>
          <Select label="Agent" placeholder="Choose a premade agent" data={agentOptions} value={selectedNode.data.agentId || null} onChange={selectAgent} searchable nothingFoundMessage="No agents found" />
          {selectedNode.data.agentId && <Paper className="workflow-agent-summary" withBorder><Group justify="space-between" gap="xs"><Text fw={600}>{selectedNode.data.agentName}</Text><Badge variant="light" color="hiveSky">{agentModalityLabel(selectedNode.data.modality, selectedNode.data.parameters.modelId)}</Badge></Group><Text size="xs" fw={600} mt="xs">Agent prompt</Text><Text size="xs" c="dimmed">{selectedNode.data.agentPrompt || "No agent prompt."}</Text></Paper>}
          <Textarea label="Prompt" description="Defaults to the selected agent’s prompt. Edit it for this workflow node." placeholder="Enter the prompt for this workflow node…" value={selectedNode.data.prompt} onChange={(event) => updateSelectedNode({ prompt: event.currentTarget.value })} maxLength={2000} minRows={5} autosize />
          <Text size="xs" c="dimmed">This node prompt is saved with the workflow and can differ from the reusable agent prompt.</Text>
          {selectedNode.data.parameters.modelId === "sd15-inpainting" && <Text size="xs" c="dimmed">Connect a source image to Image and a black/white mask image to Mask. White mask pixels are edited.</Text>}
          {selectedNode.data.modality === "image" ? <ImageModelParametersFields showModelSelect={false} value={selectedNode.data.parameters} onChange={(parameters) => updateSelectedNode({ parameters })} /> : <Text size="xs" c="dimmed">Model parameters are not available for this modality yet.</Text>}
        </Stack> : <Stack gap="md">
          <div><Text className="page-eyebrow">Workflow</Text><Title order={2} size="h4" mt={5}>Configuration</Title></div>
          <Text size="sm" c="dimmed">Select a node to configure its agent and prompt. Connect nodes on the canvas to define the workflow order.</Text>
          <Paper className="workflow-agent-summary" withBorder><Text size="sm" c="dimmed">{nodes.length} {nodes.length === 1 ? "node" : "nodes"} · {edges.length} {edges.length === 1 ? "connection" : "connections"}</Text></Paper>
        </Stack>}
      </aside>
    </div>}
    <Modal opened={formOpened} onClose={() => setFormOpened(false)} title="Workflow details" centered>
      <Stack gap="md">
        {formError && <Alert color="hiveError" title="Workflow details">{formError}</Alert>}
        <TextInput label="Name" value={form.name} maxLength={100} onChange={(event) => { const name = event.currentTarget.value; setForm((current) => ({ ...current, name })); }} required />
        <Textarea label="Description" value={form.description} maxLength={1000} onChange={(event) => { const description = event.currentTarget.value; setForm((current) => ({ ...current, description })); }} minRows={3} autosize />
        <Group justify="flex-end"><Button variant="default" onClick={() => setFormOpened(false)}>Cancel</Button><Button onClick={() => { setDraft(form); setDirty(true); setFormOpened(false); }}>Apply details</Button></Group>
      </Stack>
    </Modal>
    <Modal opened={removeNodeOpened} onClose={() => setRemoveNodeOpened(false)} title="Remove workflow node" centered>
      <Stack gap="md"><Text>Remove <Text component="span" fw={600}>{selectedNode?.data.agentName ?? "this node"}</Text> from this workflow?</Text><Text size="sm" c="dimmed">Connections to this node will also be removed. Save the workflow to keep this change.</Text><Group justify="flex-end"><Button variant="default" onClick={() => setRemoveNodeOpened(false)}>Cancel</Button><Button color="hiveError" onClick={removeSelectedNode}>Remove node</Button></Group></Stack>
    </Modal>
  </div>;
}

const nodeTypes = { agent: AgentNodeView };

function AgentNodeView({ data, selected }: { data: AgentNodeData; selected: boolean }) {
  return <Paper className="workflow-agent-node" data-selected={selected || undefined} withBorder shadow="sm"><Handle id="image" type="target" position={Position.Left} style={{ top: "40%" }} /><Text className="workflow-input-label" style={{ top: "34%" }}>Image</Text><Handle id="mask" type="target" position={Position.Left} style={{ top: "68%" }} /><Text className="workflow-input-label" style={{ top: "62%" }}>Mask</Text><Group justify="space-between" gap="xs" wrap="nowrap"><Text size="xs" c="hiveSky.7" fw={700}>{agentModalityLabel(data.modality, data.parameters.modelId)}</Text>{data.agentId && <Badge size="xs" variant="light" color="hiveSky">Configured</Badge>}</Group><Text fw={650} mt={5} lineClamp={1}>{data.agentName}</Text><Text size="xs" c="dimmed" mt={3} lineClamp={3}>{data.prompt || "No prompt configured."}</Text><Handle type="source" position={Position.Right} /></Paper>;
}
