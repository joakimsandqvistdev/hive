import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Group, Loader, Modal, Select, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { GraphEditor, createId, removeConnection, removeNode, type GraphDocument } from "ionodes";
import { apiFetch } from "../apiClient";
import { useDownloadedModels } from "../hooks/useDownloadedModels";
import { defaultImageModelParameters, imageModelDefaultSteps, type ImageModelParameters } from "../components/ImageModelParametersFields";
import { defaultVideoModelParameters, type VideoModelParameters } from "../components/VideoModelParametersFields";
import { defaultAudioModelParameters } from "../components/AudioModelParametersFields";
import { defaultTextModelParameters } from "../components/TextModelParametersFields";
import { WorkflowNodeConfiguration } from "./WorkflowNodeConfiguration";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import { startWorkflowRun } from "./startWorkflowRun";
import type { AppView } from "../navigation/navigationState";
import type { ModelIoContract } from "../modelIoTypes";
import type { DataType, Definition, Workflow, WorkflowNode, WorkflowNodeData } from "./workflowTypes";
import { addWorkflowNode, toIonodesGraph, toWorkflowDefinition, toWorkflowNode, validateWorkflowConnection } from "./ionodesWorkflowAdapter";
import "ionodes/style.css";
import { stillImageVideoDefaults, textOverlayDefaults } from "./processingNodeTypes";

export function WorkflowEditor({ workflowId, onClose, onNavigate }: { workflowId: string; onClose: () => void; onNavigate: (view: AppView) => void }) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [contracts, setContracts] = useState<ModelIoContract[]>([]);
  const [types, setTypes] = useState<DataType[]>([]);
  const [instagramAccounts, setInstagramAccounts] = useState<Array<{ id: string; username: string }>>([]);
  const [mediaItems, setMediaItems] = useState<Array<{ id: string; dataTypeId: string; displayName: string; mediaType: string; savedToLibrary: boolean }>>([]);
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
    void Promise.all([apiFetch(`/api/workflows/${workflowId}`), apiFetch("/api/models/contracts"), apiFetch("/api/instagram/account"), apiFetch("/api/artifacts")])
      .then(async ([flowResponse, catalogResponse, accountResponse, mediaResponse]) => {
        if (!flowResponse.ok || !catalogResponse.ok || !accountResponse.ok || !mediaResponse.ok) throw new Error("Could not load workflow and model definitions.");
        const flow = await flowResponse.json() as { workflow: Workflow; definition: Definition };
        const catalog = await catalogResponse.json() as { models: ModelIoContract[]; dataTypes: DataType[] };
        const accountBody = await accountResponse.json() as { account: { id: string; username: string } | null };
        const mediaBody = await mediaResponse.json() as { items: Array<{ id: string; dataTypeId: string; displayName: string; mediaType: string; savedToLibrary: boolean }> };
        if (cancelled) return;
        setWorkflow(flow.workflow); setContracts(catalog.models); setTypes(catalog.dataTypes);
        setInstagramAccounts(accountBody.account ? [accountBody.account] : []);
        setMediaItems(mediaBody.items);
        setGraph(toIonodesGraph(flow.definition, catalog.models, catalog.dataTypes, workflowId));
      }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not open workflow."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workflowId]);
  const options = useMemo(() => [
    { group: "Inputs", items: types.filter((type) => ["text", "image", "audio", "video"].includes(type.id)).map((type) => ({ value: `input:${type.id}`, label: `${type.label} input` })) },
    { group: "Processing", items: [{ value: "processing:text-overlay", label: "Text Overlay" }, { value: "processing:still-image-video", label: "Still Image Video" }] },
    { group: "Publishing", items: [{ value: "publishing:instagram-post", label: "Instagram Post" }, { value: "publishing:instagram-reel", label: "Instagram Reel" }] },
    { group: "Models", items: contracts.filter((model) => downloaded.modelIds.has(model.modelId)).map((model) => ({ value: `model:${model.modelId}`, label: model.name })) },
  ], [types, contracts, downloaded.modelIds]);
  function addNode() {
    if (!choice) return;
    const [kind, id] = choice.split(":") as ["input" | "model" | "processing" | "publishing", string];
    const model = contracts.find((item) => item.modelId === id);
    const dataType = types.find((item) => item.id === id);
    let parameters: Record<string, unknown> = {};
    if (model?.modality === "text") parameters = { ...defaultTextModelParameters, modelId: id as "qwen3-0.6b" | "qwen3-1.7b" };
    else if (model?.modality === "video") parameters = { ...defaultVideoModelParameters(id as VideoModelParameters["modelId"]) };
    else if (model?.modality === "audio") parameters = { ...defaultAudioModelParameters, modelId: "kokoro-82m" };
    else if (model) parameters = { ...defaultImageModelParameters, modelId: id, steps: imageModelDefaultSteps(id as ImageModelParameters["modelId"]), guidanceScale: id === "flux2-klein-4b" ? 1 : ["sana-sprint-06b", "sd35-medium"].includes(id) ? 4.5 : 7.5 };
    if (kind === "processing" && id === "text-overlay") parameters = { ...textOverlayDefaults };
    if (kind === "processing" && id === "still-image-video") parameters = { ...stillImageVideoDefaults };
    if (kind === "publishing") parameters = { operationId: id, accountId: instagramAccounts[0]?.id ?? "00000000-0000-4000-8000-000000000000", mode: "manual", shareToFeed: true };
    const node: Definition["nodes"][number] = { id: createId("node"), kind, label: model?.name ?? (kind === "processing" ? "Text Overlay" : kind === "publishing" ? (id === "instagram-reel" ? "Instagram Reel" : "Instagram Post") : `${dataType?.label ?? id} input`), modelId: model?.modelId ?? null, dataTypeId: kind === "input" ? id : null, inputText: "", artifactId: null, parameters,
      position: { x: 90 + (graph.nodes.length % 3) * 280, y: 90 + Math.floor(graph.nodes.length / 3) * 190 } };
    setGraph((current) => addWorkflowNode(current, node, contracts, types)); setSelectedNodeId(node.id); setSelectedConnectionId(null); setDirty(true); setPickerOpen(false); setChoice(null);
  }
  function duplicateSelectedNode() {
    if (!selectedGraphNode || !selected) return;
    const nodeId = createId("node");
    const nodeDefinition: Definition["nodes"][number] = {
      id: nodeId,
      kind: selected.data.kind,
      label: `${selected.data.label.slice(0, 94)} copy`,
      modelId: selected.data.modelId,
      dataTypeId: selected.data.dataTypeId,
      inputText: selected.data.inputText,
      artifactId: selected.data.artifactId,
      parameters: structuredClone(selected.data.parameters),
      position: { x: Math.min(selected.position.x + 48, 999_900), y: Math.min(selected.position.y + 48, 999_900) },
    };
    const next = addWorkflowNode(graph, nodeDefinition, contracts, types);
    setGraph(next); setSelectedNodeId(nodeId); setSelectedConnectionId(null); setDirty(true); setError(null);
  }
  async function upload(file: File | null, target: WorkflowNode | undefined = selected) {
    if (!file || !target) return;
    const nodeId = target.id;
    const dataTypeId = target.data.dataTypeId;
    const maxMb = dataTypeId === "image" ? 10 : dataTypeId === "video" ? 50 : 25;
    if (file.size > maxMb * 1024 * 1024) { setError(`This file exceeds the ${maxMb} MB limit.`); return; }
    setUploading(true); setError(null);
    try {
      const response = await apiFetch(`/api/artifacts/upload?workflowId=${encodeURIComponent(workflowId)}&dataTypeId=${encodeURIComponent(dataTypeId ?? "")}&name=${encodeURIComponent(file.name)}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file });
      const body = await response.json().catch(() => ({})) as { artifact?: { id: string }; message?: string };
      if (!response.ok || !body.artifact) throw new Error(body.message ?? "Could not upload this file.");
      const artifactId = body.artifact.id;
      createdUploads.current.add(artifactId);
      setMediaItems((items) => [...items.filter((item) => item.id !== artifactId), { id: artifactId, dataTypeId: dataTypeId ?? "", displayName: file.name, mediaType: file.type, savedToLibrary: false }]);
      setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, description: "File uploaded", metadata: { ...node.metadata, artifactId } } : node) })); setDirty(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed."); }
    finally { setUploading(false); }
  }
  async function importUrl(url: string, target: WorkflowNode | undefined = selected) {
    if (!target || !workflow) return;
    const nodeId = target.id;
    setUploading(true); setError(null);
    try {
      const response = await apiFetch("/api/artifacts/import-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, dataTypeId: target.data.dataTypeId, workflowId }) });
      const body = await response.json() as { artifact?: { id: string; displayName: string; mediaType: string }; error?: string };
      if (!response.ok || !body.artifact) throw new Error(body.error === "invalid_import_url" ? "Use a public HTTP or HTTPS URL with no redirects to private/local addresses." : "Could not import media from this URL.");
      const artifact = body.artifact; createdUploads.current.add(artifact.id);
      setMediaItems((items) => [...items, { id: artifact.id, dataTypeId: target.data.dataTypeId ?? "", displayName: artifact.displayName, mediaType: artifact.mediaType, savedToLibrary: false }]);
      setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, description: "Media imported", metadata: { ...node.metadata, artifactId: artifact.id } } : node) })); setDirty(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not import media from URL."); }
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
    <header className="workflow-editor-header"><Group justify="space-between" className="workflow-editor-header-row"><Group className="workflow-header-leading" gap="sm"><Button variant="subtle" onClick={() => { if (!dirty || window.confirm("Discard unsaved workflow changes?")) onClose(); }}>Back</Button>{error && <Alert className="workflow-header-error" color="hiveError" variant="light" radius="sm" p="xs" role="alert">{error}</Alert>}</Group><Group wrap="wrap"><Button size="sm" variant="light" leftSection={<AddNodeIcon />} onClick={() => { void downloaded.refresh(); setPickerOpen(true); }}>Add node</Button><Button size="sm" variant="light" color="hiveSky" leftSection={<DuplicateIcon />} aria-label="Duplicate selected node" disabled={!selected || uploading} onClick={duplicateSelectedNode}>Duplicate</Button><Button size="sm" variant="light" color="hiveError" leftSection={<RemoveIcon />} disabled={(!selected && !selectedConnectionId) || uploading} onClick={() => { if (selected) setRemoveOpen(true); else if (selectedConnectionId) { setGraph((current) => removeConnection(current, selectedConnectionId)); setSelectedConnectionId(null); setDirty(true); } }}>Remove selected</Button><Button variant="subtle" onClick={() => setDetailsOpen(true)}>Edit details</Button><Button variant="light" onClick={() => void run()} loading={running} disabled={dirty || !graph.nodes.length || loading || saving || uploading}>Run workflow</Button><Button onClick={() => void save()} loading={saving} disabled={!dirty || uploading}>Save workflow</Button></Group></Group></header>
    {loading ? <Group justify="center" className="workflow-editor-loading"><Loader /><Text>Loading workflow…</Text></Group> : workflow && <div className="workflow-editor-body">
      <section className="workflow-editor-canvas" aria-label="Workflow canvas"><GraphEditor graph={graph} graphTitle={workflow?.name ?? "Workflow"} onChange={(next) => { setGraph(next); setDirty(true); setError(null); }} onSelectionChange={({ nodeIds, connectionIds }) => { setSelectedNodeId(nodeIds[0] ?? null); setSelectedConnectionId(connectionIds[0] ?? null); }} validateConnection={validateWorkflowConnection} showConnectionWarnings={false} showEmptyState={false} showPalette={false} showInspector={false} showStatusBar={false} className="hive-ionodes" nodeEditorLabel="Configure" renderNodeEditor={(graphNode, updateGraphNode) => {
        const node = toWorkflowNode(graphNode, contracts);
        const updateNode = (patch: Partial<WorkflowNodeData>) => {
          const { label, inputText, artifactId, parameters } = patch;
          const metadata = { ...graphNode.metadata as object, ...(inputText !== undefined ? { inputText } : {}), ...(artifactId !== undefined ? { artifactId } : {}), ...(parameters !== undefined ? { parameters } : {}) };
          const nextLabel = label ?? graphNode.title;
          const description = node.data.kind === "input" ? node.data.dataTypeId === "text" ? "Text input" : (artifactId ?? node.data.artifactId) ? "Media selected" : "Input not set" : node.data.kind === "processing" ? `Processing · ${parameters?.operationId === "still-image-video" ? "Still Image Video" : "Text Overlay"}` : node.data.contract?.name ?? "Model";
          updateGraphNode({ title: nextLabel, description, metadata }); setDirty(true);
        };
        return <WorkflowNodeConfiguration selected={node} types={types} instagramAccounts={instagramAccounts} downloadedModelIds={downloaded.modelIds} mediaItems={mediaItems} uploading={uploading} onUpdate={updateNode} onUpload={(file) => void upload(file, node)} onImportUrl={(url) => void importUrl(url, node)} />;
      }} theme={{ "--ionodes-bg": "var(--hive-canvas-background)", "--ionodes-surface": "var(--hive-canvas-surface)", "--ionodes-text": "var(--hive-canvas-text)", "--ionodes-muted": "var(--hive-canvas-muted)", "--ionodes-border": "var(--hive-canvas-border)", "--ionodes-accent": "var(--hive-canvas-accent)", "--ionodes-danger": "var(--hive-canvas-danger)" }} canvas={{ hideAttribution: true, backgroundColor: "#d6dde5", miniMapMaskColor: "rgba(124, 135, 148, 0.16)", miniMapNodeColor: (_node, invalid) => invalid ? "#ba514d" : "#4285f4" }} /></section>
      </div>}
    <Modal opened={pickerOpen} onClose={() => setPickerOpen(false)} title="Add node" centered><Stack><Select label="Node" placeholder="Choose an input or downloaded model" data={options} value={choice} onChange={setChoice} searchable /><Text size="xs" c="dimmed">Only downloaded models are available here. Download additional models from Models.</Text>{downloaded.status === "unavailable" && <Alert color="hiveWarning">Could not check model downloads. Input nodes remain available.</Alert>}<Button onClick={addNode} disabled={!choice}>Add node</Button></Stack></Modal>
    <ConfirmActionModal opened={removeOpen} onClose={() => setRemoveOpen(false)} title="Remove node" confirmLabel="Remove node" onConfirm={() => { if (!selected) return; setGraph((current) => removeNode(current, selected.id)); setSelectedNodeId(null); setSelectedConnectionId(null); setDirty(true); setRemoveOpen(false); }}>
      <Text>Remove {selected?.data.label} and its connections?</Text>
    </ConfirmActionModal>
    <Modal opened={detailsOpen} onClose={() => setDetailsOpen(false)} title="Workflow details" centered>{workflow && <Stack><TextInput label="Name" value={workflow.name} maxLength={100} onChange={(event) => { setWorkflow({ ...workflow, name: event.currentTarget.value }); setDirty(true); }} /><Textarea label="Description" value={workflow.description} maxLength={1000} onChange={(event) => { setWorkflow({ ...workflow, description: event.currentTarget.value }); setDirty(true); }} /><Button onClick={() => setDetailsOpen(false)}>Done</Button></Stack>}</Modal>
  </div>;
}

function AddNodeIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function DuplicateIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>; }
function RemoveIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 12.2a1 1 0 0 1-1 .8H7.8a1 1 0 0 1-1-.8L6 7m4 4v5m4-5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
