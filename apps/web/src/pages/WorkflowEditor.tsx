import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Group, Loader, Modal, Select, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { GraphEditor, createId, removeConnection, removeNode, type GraphDocument } from "ionodes";
import { apiFetch } from "../apiClient";
import { useDownloadedModels } from "../hooks/useDownloadedModels";
import { defaultImageModelParameters, imageModelDefaultSteps, type ImageModelParameters } from "../components/ImageModelParametersFields";
import { defaultVideoModelParameters, type VideoModelParameters } from "../components/VideoModelParametersFields";
import { defaultAudioModelParameters } from "../components/AudioModelParametersFields";
import { WorkflowNodeConfiguration } from "./WorkflowNodeConfiguration";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import { startWorkflowRun } from "./startWorkflowRun";
import type { AppView } from "../navigation/navigationState";
import type { ModelIoContract } from "../modelIoTypes";
import type { DataType, Definition, Workflow, WorkflowNode, WorkflowNodeData } from "./workflowTypes";
import { addWorkflowNode, toIonodesGraph, toWorkflowDefinition, toWorkflowNode, validateWorkflowConnection } from "./ionodesWorkflowAdapter";
import "ionodes/style.css";

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
  const [graph, setGraph] = useState<GraphDocument>(() => toIonodesGraph({ nodes: [], edges: [] }, [], [], workflowId));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const downloaded = useDownloadedModels();
  const createdUploads = useRef(new Set<string>());
  useEffect(() => () => {
    for (const id of createdUploads.current) void apiFetch(`/api/artifacts/${id}`, { method: "DELETE" }).catch(() => {});
  }, []);
  const selectedGraphNode = graph.nodes.find((node) => node.id === selectedNodeId);
  const selected: WorkflowNode | undefined = selectedGraphNode ? toWorkflowNode(selectedGraphNode, contracts) : undefined;
  useEffect(() => {
    let cancelled = false;
    void Promise.all([apiFetch(`/api/workflows/${workflowId}`), apiFetch("/api/models/contracts")])
      .then(async ([flowResponse, catalogResponse]) => {
        if (!flowResponse.ok || !catalogResponse.ok) throw new Error("Could not load workflow and model definitions.");
        const flow = await flowResponse.json() as { workflow: Workflow; definition: Definition };
        const catalog = await catalogResponse.json() as { models: ModelIoContract[]; dataTypes: DataType[] };
        if (cancelled) return;
        setWorkflow(flow.workflow); setContracts(catalog.models); setTypes(catalog.dataTypes);
        setGraph(toIonodesGraph(flow.definition, catalog.models, catalog.dataTypes, workflowId));
      }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not open workflow."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workflowId]);
  const options = useMemo(() => [
    { group: "Inputs", items: types.filter((type) => ["text", "image", "audio"].includes(type.id)).map((type) => ({ value: `input:${type.id}`, label: `${type.label} input` })) },
    { group: "Downloaded models", items: contracts.filter((model) => downloaded.modelIds.has(model.modelId)).map((model) => ({ value: `model:${model.modelId}`, label: model.name })) },
  ], [types, contracts, downloaded.modelIds]);
  function update(patch: Partial<WorkflowNodeData>) {
    if (!selected) return;
    setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => {
      if (node.id !== selected.id) return node;
      const { label, inputText, artifactId, parameters } = patch;
      const metadata = { ...node.metadata, ...(inputText !== undefined ? { inputText } : {}), ...(artifactId !== undefined ? { artifactId } : {}), ...(parameters !== undefined ? { parameters } : {}) };
      const nextLabel = label ?? node.title;
      const currentInputText = inputText ?? selected.data.inputText;
      const currentArtifactId = artifactId ?? selected.data.artifactId;
      const description = selected.data.kind === "input" ? currentInputText || (currentArtifactId ? "File uploaded" : "Input not set") : selected.data.contract?.name ?? "Model";
      return { ...node, title: nextLabel, description, metadata };
    }) })); setDirty(true);
  }
  function addNode() {
    if (!choice) return;
    const [kind, id] = choice.split(":") as ["input" | "model", string];
    const model = contracts.find((item) => item.modelId === id);
    const dataType = types.find((item) => item.id === id);
    let parameters: Record<string, unknown> = {};
    if (model?.modality === "video") parameters = { ...defaultVideoModelParameters(id as VideoModelParameters["modelId"]) };
    else if (model?.modality === "audio") parameters = { ...defaultAudioModelParameters, modelId: "kokoro-82m" };
    else if (model) parameters = { ...defaultImageModelParameters, modelId: id, steps: imageModelDefaultSteps(id as ImageModelParameters["modelId"]), guidanceScale: id === "flux2-klein-4b" ? 1 : ["sana-sprint-06b", "sd35-medium"].includes(id) ? 4.5 : 7.5 };
    const node: Definition["nodes"][number] = { id: createId("node"), kind, label: model?.name ?? `${dataType?.label ?? id} input`, modelId: model?.modelId ?? null, dataTypeId: kind === "input" ? id : null, inputText: "", artifactId: null, parameters,
      position: { x: 90 + (graph.nodes.length % 3) * 280, y: 90 + Math.floor(graph.nodes.length / 3) * 190 } };
    setGraph((current) => addWorkflowNode(current, node, contracts, types)); setSelectedNodeId(node.id); setSelectedConnectionId(null); setDirty(true); setPickerOpen(false); setChoice(null);
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
      setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, description: "File uploaded", metadata: { ...node.metadata, artifactId } } : node) })); setDirty(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed."); }
    finally { setUploading(false); }
  }
  async function save() {
    if (!workflow) return;
    setSaving(true); setError(null);
    try {
      const definition = toWorkflowDefinition(graph);
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
      await startWorkflowRun(workflowId);
      onNavigate("runs");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start workflow."); }
    finally { setRunning(false); }
  }
  return <div className="workflow-editor-page">
    <header className="workflow-editor-header"><Group justify="space-between" className="workflow-editor-header-row"><Group className="workflow-header-leading" gap="sm"><Button variant="subtle" onClick={() => { if (!dirty || window.confirm("Discard unsaved workflow changes?")) onClose(); }}>Back</Button>{error && <Alert className="workflow-header-error" color="hiveError" variant="light" radius="sm" p="xs" role="alert">{error}</Alert>}</Group><Group><Button variant="subtle" onClick={() => setDetailsOpen(true)}>Edit details</Button><Button variant="light" onClick={() => void run()} loading={running} disabled={dirty || !graph.nodes.length || loading || saving || uploading}>Run workflow</Button><Button onClick={() => void save()} loading={saving} disabled={!dirty || uploading}>Save workflow</Button></Group></Group></header>
    {loading ? <Group justify="center" className="workflow-editor-loading"><Loader /><Text>Loading workflow…</Text></Group> : workflow && <div className="workflow-editor-body">
      <section className="workflow-editor-canvas" aria-label="Workflow canvas"><GraphEditor graph={graph} graphTitle={workflow?.name ?? "Workflow"} onChange={(next) => { setGraph(next); setDirty(true); setError(null); }} onSelectionChange={({ nodeIds, connectionIds }) => { setSelectedNodeId(nodeIds[0] ?? null); setSelectedConnectionId(connectionIds[0] ?? null); }} validateConnection={validateWorkflowConnection} showConnectionWarnings={false} showEmptyState={false} showPalette={false} showInspector={false} showStatusBar={false} className="hive-ionodes" theme={{ "--ionodes-bg": "var(--mantine-color-gray-0)" }} canvas={{ hideAttribution: true, backgroundColor: "#d6dde5", miniMapMaskColor: "rgba(124, 135, 148, 0.16)", miniMapNodeColor: (_node, invalid) => invalid ? "var(--mantine-color-hiveError-6)" : "var(--mantine-color-hiveSky-6)" }} /></section>
      <aside className="workflow-config-panel" aria-label="Node configuration"><Group grow mb="lg"><Button variant="light" onClick={() => { void downloaded.refresh(); setPickerOpen(true); }}>Add node</Button><Button variant="light" color="hiveError" disabled={(!selected && !selectedConnectionId) || uploading} onClick={() => { if (selected) setRemoveOpen(true); else if (selectedConnectionId) { setGraph((current) => removeConnection(current, selectedConnectionId)); setSelectedConnectionId(null); setDirty(true); } }}>Remove selected</Button></Group>
        <WorkflowNodeConfiguration selected={selected} types={types} downloadedModelIds={downloaded.modelIds} uploading={uploading} onUpdate={update} onUpload={(file) => void upload(file)} />
      </aside></div>}
    <Modal opened={pickerOpen} onClose={() => setPickerOpen(false)} title="Add node" centered><Stack><Select label="Node" placeholder="Choose an input or downloaded model" data={options} value={choice} onChange={setChoice} searchable /><Text size="xs" c="dimmed">Only downloaded models are available here. Download additional models from Models.</Text>{downloaded.status === "unavailable" && <Alert color="hiveWarning">Could not check model downloads. Input nodes remain available.</Alert>}<Button onClick={addNode} disabled={!choice}>Add node</Button></Stack></Modal>
    <ConfirmActionModal opened={removeOpen} onClose={() => setRemoveOpen(false)} title="Remove node" confirmLabel="Remove node" onConfirm={() => { if (!selected) return; setGraph((current) => removeNode(current, selected.id)); setSelectedNodeId(null); setSelectedConnectionId(null); setDirty(true); setRemoveOpen(false); }}>
      <Text>Remove {selected?.data.label} and its connections?</Text>
    </ConfirmActionModal>
    <Modal opened={detailsOpen} onClose={() => setDetailsOpen(false)} title="Workflow details" centered>{workflow && <Stack><TextInput label="Name" value={workflow.name} maxLength={100} onChange={(event) => { setWorkflow({ ...workflow, name: event.currentTarget.value }); setDirty(true); }} /><Textarea label="Description" value={workflow.description} maxLength={1000} onChange={(event) => { setWorkflow({ ...workflow, description: event.currentTarget.value }); setDirty(true); }} /><Button onClick={() => setDetailsOpen(false)}>Done</Button></Stack>}</Modal>
  </div>;
}
