import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Group, Loader, Modal, Paper, Select, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { addEdge, Background, BackgroundVariant, Controls, Handle, MiniMap, Position, ReactFlow, useEdgesState, useNodesState, type Connection, type Edge } from "@xyflow/react";
import { apiFetch } from "../apiClient";
import { useDownloadedModels } from "../hooks/useDownloadedModels";
import { defaultImageModelParameters, imageModelDefaultSteps, type ImageModelParameters } from "../components/ImageModelParametersFields";
import { defaultVideoModelParameters, type VideoModelParameters } from "../components/VideoModelParametersFields";
import { WorkflowNodeConfiguration } from "./WorkflowNodeConfiguration";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import type { AppView } from "../navigation/navigationState";
import type { ModelIoContract } from "../modelIoTypes";
import type { DataType, Definition, Workflow, WorkflowNode, WorkflowNodeData } from "./workflowTypes";
import "@xyflow/react/dist/style.css";

export function WorkflowEditor({ workflowId, onClose, onNavigate }: { workflowId: string; onClose: () => void; onNavigate: (view: AppView) => void }) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [contracts, setContracts] = useState<ModelIoContract[]>([]);
  const [types, setTypes] = useState<DataType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const downloaded = useDownloadedModels();
  const createdUploads = useRef(new Set<string>());
  useEffect(() => () => {
    for (const id of createdUploads.current) void apiFetch(`/api/artifacts/${id}`, { method: "DELETE" }).catch(() => {});
  }, []);
  const selected = nodes.find((node) => node.selected);
  const selectedEdge = edges.find((edge) => edge.selected);

  const hydrate = useCallback((node: Definition["nodes"][number], models: ModelIoContract[], dataTypes: DataType[]): WorkflowNode => {
    const contract = models.find((model) => model.modelId === node.modelId);
    const type = dataTypes.find((item) => item.id === node.dataTypeId);
    return { id: node.id, type: "workflow", position: node.position, data: { ...node,
      inputPorts: contract?.inputs ?? [], contract,
      outputPorts: node.kind === "model" ? contract?.outputs ?? [] : type ? [{ direction: "output", portKey: "output", dataTypeId: type.id, dataTypeLabel: type.label, mediaType: type.mediaType, label: type.label, transport: null, minCount: 1, maxCount: 1, sortOrder: 0 }] : [],
    } };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([apiFetch(`/api/workflows/${workflowId}`), apiFetch("/api/models/contracts")])
      .then(async ([flowResponse, catalogResponse]) => {
        if (!flowResponse.ok || !catalogResponse.ok) throw new Error("Could not load workflow and model definitions.");
        const flow = await flowResponse.json() as { workflow: Workflow; definition: Definition };
        const catalog = await catalogResponse.json() as { models: ModelIoContract[]; dataTypes: DataType[] };
        if (cancelled) return;
        setWorkflow(flow.workflow); setContracts(catalog.models); setTypes(catalog.dataTypes);
        setNodes(flow.definition.nodes.map((node) => hydrate(node, catalog.models, catalog.dataTypes))); setEdges(flow.definition.edges);
      }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not open workflow."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workflowId, hydrate, setNodes, setEdges]);
  const options = useMemo(() => [
    { group: "Inputs", items: types.filter((type) => ["text", "image", "audio"].includes(type.id)).map((type) => ({ value: `input:${type.id}`, label: `${type.label} input` })) },
    { group: "Downloaded models", items: contracts.filter((model) => downloaded.modelIds.has(model.modelId)).map((model) => ({ value: `model:${model.modelId}`, label: model.name })) },
  ], [types, contracts, downloaded.modelIds]);
  const onConnect = useCallback((connection: Connection) => {
    const source = nodes.find((node) => node.id === connection.source)?.data.outputPorts.find((port) => port.portKey === connection.sourceHandle);
    const target = nodes.find((node) => node.id === connection.target)?.data.inputPorts.find((port) => port.portKey === connection.targetHandle);
    if (!source || !target || source.dataTypeId !== target.dataTypeId) { setError("Connect ports with matching datatypes."); return; }
    const count = edges.filter((edge) => edge.target === connection.target && edge.targetHandle === connection.targetHandle).length;
    if (count >= target.maxCount) { setError("This input has reached its connection limit."); return; }
    setEdges((current) => addEdge(connection, current)); setDirty(true); setError(null);
  }, [nodes, edges, setEdges]);
  function update(patch: Partial<WorkflowNodeData>) {
    if (!selected) return;
    setNodes((current) => current.map((node) => node.id === selected.id ? { ...node, data: { ...node.data, ...patch } } : node)); setDirty(true);
  }
  function addNode() {
    if (!choice) return;
    const [kind, id] = choice.split(":") as ["input" | "model", string];
    const model = contracts.find((item) => item.modelId === id);
    const dataType = types.find((item) => item.id === id);
    let parameters: Record<string, unknown> = {};
    if (model?.modality === "video") parameters = { ...defaultVideoModelParameters(id as VideoModelParameters["modelId"]) };
    else if (model) parameters = { ...defaultImageModelParameters, modelId: id, steps: imageModelDefaultSteps(id as ImageModelParameters["modelId"]), guidanceScale: id === "flux2-klein-4b" ? 1 : ["sana-sprint-06b", "sd35-medium"].includes(id) ? 4.5 : 7.5 };
    const node = hydrate({ id: `node-${crypto.randomUUID()}`, kind, label: model?.name ?? `${dataType?.label ?? id} input`, modelId: model?.modelId ?? null, dataTypeId: kind === "input" ? id : null, inputText: "", artifactId: null, parameters,
      position: { x: 90 + (nodes.length % 3) * 280, y: 90 + Math.floor(nodes.length / 3) * 190 } }, contracts, types);
    node.selected = true;
    setNodes((current) => [...current.map((item) => ({ ...item, selected: false })), node]); setDirty(true); setPickerOpen(false); setChoice(null);
  }
  async function upload(file: File | null) {
    if (!file || !selected) return;
    const nodeId = selected.id;
    const dataTypeId = selected.data.dataTypeId;
    const limit = (dataTypeId === "image" ? 10 : 25) * 1024 * 1024;
    if (file.size > limit) { setError(`This file exceeds the ${dataTypeId === "image" ? 10 : 25} MB limit.`); return; }
    setUploading(true); setError(null);
    try {
      const response = await apiFetch(`/api/artifacts/upload?dataTypeId=${encodeURIComponent(dataTypeId ?? "")}&name=${encodeURIComponent(file.name)}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file });
      const body = await response.json().catch(() => ({})) as { artifact?: { id: string }; message?: string };
      if (!response.ok || !body.artifact) throw new Error(body.message ?? "Could not upload this file.");
      const artifactId = body.artifact.id;
      createdUploads.current.add(artifactId);
      setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, artifactId } } : node)); setDirty(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed."); }
    finally { setUploading(false); }
  }
  async function save() {
    if (!workflow) return;
    setSaving(true); setError(null);
    const definition: Definition = { nodes: nodes.map(({ id, data, position }) => ({ id, kind: data.kind, label: data.label, modelId: data.modelId, dataTypeId: data.dataTypeId, inputText: data.inputText, artifactId: data.artifactId, parameters: data.parameters, position })), edges: edges.map(({ id, source, sourceHandle, target, targetHandle }) => ({ id, source, sourceHandle, target, targetHandle })) };
    try {
      const response = await apiFetch(`/api/workflows/${workflowId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: workflow.name, description: workflow.description, definition }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error === "invalid_input_counts" ? "Connect all required model inputs and check connection limits." : body.error === "invalid_input" ? "Fill every text input and upload a file for each media input." : "Could not save workflow. Check node settings and connections.");
      setWorkflow(body.workflow); setDirty(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save workflow."); }
    finally { setSaving(false); }
  }
  async function run() {
    setRunning(true); setError(null);
    try {
      const response = await apiFetch(`/api/workflows/${workflowId}/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error === "model_not_downloaded" ? "Download every model used by this workflow from Models before running." : "Could not start workflow.");
      onNavigate("runs");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start workflow."); }
    finally { setRunning(false); }
  }
  return <div className="workflow-editor-page">
    <header className="workflow-editor-header"><Group justify="space-between"><Group><Button variant="subtle" onClick={() => { if (!dirty || window.confirm("Discard unsaved workflow changes?")) onClose(); }}>Back</Button><div><Text className="page-eyebrow">Workflow editor</Text><Title order={2} size="h3">{workflow?.name ?? "Workflow"}</Title></div><Button variant="subtle" onClick={() => setDetailsOpen(true)}>Edit details</Button></Group><Group><Button variant="light" onClick={() => void run()} loading={running} disabled={dirty || !nodes.length || loading || saving || uploading}>Run workflow</Button><Button onClick={() => void save()} loading={saving} disabled={!dirty || uploading}>Save workflow</Button></Group></Group></header>
    {error && <Alert m="sm" color="hiveError" title="Workflow">{error}</Alert>}
    {loading ? <Group justify="center" className="workflow-editor-loading"><Loader /><Text>Loading workflow…</Text></Group> : workflow && <div className="workflow-editor-body">
      <section className="workflow-editor-canvas" aria-label="Workflow canvas"><ReactFlow<WorkflowNode, Edge> nodes={nodes} edges={edges} onNodesChange={(changes) => { onNodesChange(changes); if (changes.some((change) => change.type === "position")) setDirty(true); }} onEdgesChange={(changes) => { onEdgesChange(changes); if (changes.some((change) => change.type === "remove")) setDirty(true); }} onConnect={onConnect} nodeTypes={nodeTypes} fitView deleteKeyCode={null}><Background variant={BackgroundVariant.Dots} gap={20} size={1} /><Controls /><MiniMap pannable zoomable /></ReactFlow>{!nodes.length && <div className="workflow-canvas-empty"><Text fw={600}>Start building this workflow</Text><Text size="sm" c="dimmed">Add input nodes and downloaded models, then connect matching ports.</Text></div>}</section>
      <aside className="workflow-config-panel" aria-label="Node configuration"><Group grow mb="lg"><Button variant="light" onClick={() => { void downloaded.refresh(); setPickerOpen(true); }}>Add node</Button><Button variant="light" color="hiveError" disabled={(!selected && !selectedEdge) || uploading} onClick={() => { if (selected) setRemoveOpen(true); else if (selectedEdge) { setEdges((current) => current.filter((edge) => edge.id !== selectedEdge.id)); setDirty(true); } }}>Remove selected</Button></Group>
        <WorkflowNodeConfiguration selected={selected} types={types} downloadedModelIds={downloaded.modelIds} uploading={uploading} onUpdate={update} onUpload={(file) => void upload(file)} />
      </aside></div>}
    <Modal opened={pickerOpen} onClose={() => setPickerOpen(false)} title="Add node" centered><Stack><Select label="Node" placeholder="Choose an input or downloaded model" data={options} value={choice} onChange={setChoice} searchable /><Text size="xs" c="dimmed">Only downloaded models are available here. Download additional models from Models.</Text>{downloaded.status === "unavailable" && <Alert color="hiveWarning">Could not check model downloads. Input nodes remain available.</Alert>}<Button onClick={addNode} disabled={!choice}>Add node</Button></Stack></Modal>
    <ConfirmActionModal opened={removeOpen} onClose={() => setRemoveOpen(false)} title="Remove node" confirmLabel="Remove node" onConfirm={() => { if (!selected) return; setNodes((current) => current.filter((node) => node.id !== selected.id)); setEdges((current) => current.filter((edge) => edge.source !== selected.id && edge.target !== selected.id)); setDirty(true); setRemoveOpen(false); }}>
      <Text>Remove {selected?.data.label} and its connections?</Text>
    </ConfirmActionModal>
    <Modal opened={detailsOpen} onClose={() => setDetailsOpen(false)} title="Workflow details" centered>{workflow && <Stack><TextInput label="Name" value={workflow.name} maxLength={100} onChange={(event) => { setWorkflow({ ...workflow, name: event.currentTarget.value }); setDirty(true); }} /><Textarea label="Description" value={workflow.description} maxLength={1000} onChange={(event) => { setWorkflow({ ...workflow, description: event.currentTarget.value }); setDirty(true); }} /><Button onClick={() => setDetailsOpen(false)}>Done</Button></Stack>}</Modal>
  </div>;
}
const nodeTypes = { workflow: WorkflowNodeView };
function WorkflowNodeView({ data, selected }: { data: WorkflowNodeData; selected: boolean }) {
  return <Paper className="workflow-node" data-selected={selected || undefined} withBorder shadow="sm">
    {data.inputPorts.map((port, index) => { const top = `${25 + (index + 1) * 50 / (data.inputPorts.length + 1)}%`; return <Fragment key={port.portKey}><Handle id={port.portKey} type="target" position={Position.Left} style={{ top }} /><Text className="workflow-input-label" style={{ top }}>{port.label}</Text></Fragment>; })}
    {data.outputPorts.map((port, index) => { const top = `${35 + (index + 1) * 40 / (data.outputPorts.length + 1)}%`; return <Fragment key={port.portKey}><Handle id={port.portKey} type="source" position={Position.Right} style={{ top }} /><Text className="workflow-output-label" style={{ top }}>{port.dataTypeLabel}</Text></Fragment>; })}
    <Badge variant="light" size="xs">{data.kind === "input" ? `${data.dataTypeId} input` : "Model"}</Badge><Text fw={650} mt={6} lineClamp={2}>{data.label}</Text><Text size="xs" c="dimmed" mt={4} lineClamp={2}>{data.kind === "input" ? data.inputText || (data.artifactId ? "File uploaded" : "Upload a file") : data.contract?.name}</Text>
  </Paper>;
}
