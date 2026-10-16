import { useEffect, useMemo, useRef, useState } from "react";
import { ActionIcon, Alert, Button, Checkbox, Group, Loader, Modal, ScrollArea, Select, Stack, Text, Textarea, TextInput, Tooltip } from "@mantine/core";
import { GraphEditor, createId, removeConnection, removeNode, type GraphDocument } from "ionodes";
import { apiFetch } from "../apiClient";
import { useDownloadedModels } from "../hooks/useDownloadedModels";
import { defaultImageModelParameters, imageModelDefaultSteps, type ImageModelParameters } from "../components/ImageModelParametersFields";
import { defaultVideoModelParameters, type VideoModelParameters } from "../components/VideoModelParametersFields";
import { defaultAudioModelParameters } from "../components/AudioModelParametersFields";
import { defaultTextModelParameters } from "../components/TextModelParametersFields";
import { WorkflowNodeConfiguration } from "./WorkflowNodeConfiguration";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import { startCustomNodeRun, startWorkflowRun } from "./startWorkflowRun";
import { useFlashMessages } from "../components/FlashMessages";
import type { AppView } from "../navigation/navigationState";
import type { ModelIoContract } from "../modelIoTypes";
import type { DataType, Definition, Workflow, WorkflowNode, WorkflowNodeData } from "./workflowTypes";
import { addWorkflowNode, toIonodesGraph, toWorkflowDefinition, toWorkflowNode, validateWorkflowConnection } from "./ionodesWorkflowAdapter";
import "ionodes/style.css";
import { stillImageVideoDefaults, textOverlayDefaults } from "./processingNodeTypes";

type CustomNodeOption = { id: string; name: string; description: string; needsAttention?: boolean; interface: { inputs: Array<ModelIoContract["inputs"][number] & { boundaryNodeId: string; boundaryPortKey: string }>; outputs: Array<ModelIoContract["outputs"][number] & { boundaryNodeId: string; boundaryPortKey: string }>; signature: string }; contract: ModelIoContract };
type InterfaceSelection = { inputs: Array<{ nodeId: string; portKey: string; label: string }>; outputs: Array<{ nodeId: string; portKey: string; label: string }> };

export function WorkflowEditor({ workflowId, onClose, onNavigate, customNodeEditor = false }: { workflowId: string; onClose: () => void; onNavigate: (view: AppView) => void; customNodeEditor?: boolean }) {
  const { showFlash } = useFlashMessages();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [contracts, setContracts] = useState<ModelIoContract[]>([]);
  const [customNodes, setCustomNodes] = useState<CustomNodeOption[]>([]);
  const [availableCustomNodes, setAvailableCustomNodes] = useState<CustomNodeOption[]>([]);
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
  const [importOpen, setImportOpen] = useState(false);
  const [importWorkflows, setImportWorkflows] = useState<Workflow[]>([]);
  const [importWorkflowId, setImportWorkflowId] = useState<string | null>(null);
  const [importDefinition, setImportDefinition] = useState<Definition | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportName, setExportName] = useState("");
  const [exportDescription, setExportDescription] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportedWorkflow, setExportedWorkflow] = useState<Workflow | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [interfaceOpen, setInterfaceOpen] = useState(false);
  const [interfaceSelection, setInterfaceSelection] = useState<InterfaceSelection>({ inputs: [], outputs: [] });
  const [customNodeRunEligible, setCustomNodeRunEligible] = useState(false);
  const [graph, setGraph] = useState<GraphDocument>(() => toIonodesGraph({ nodes: [], edges: [] }, [], [], workflowId));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const downloaded = useDownloadedModels();
  const createdUploads = useRef(new Set<string>());
  useEffect(() => () => {
    for (const id of createdUploads.current) void apiFetch(`/api/artifacts/${id}`, { method: "DELETE" }).catch(() => {});
  }, []);
  const selectedGraphNode = graph.nodes.find((node) => node.id === selectedNodeId);
  const selected: WorkflowNode | undefined = selectedGraphNode ? toWorkflowNode(selectedGraphNode, contracts) : undefined;
  const availableBoundaryPorts = useMemo(() => graph.nodes.flatMap((graphNode) => {
    const node = toWorkflowNode(graphNode, contracts);
    return [
      ...node.data.inputPorts.map((port) => ({ direction: "inputs" as const, nodeId: node.id, nodeLabel: node.data.label, portKey: port.portKey, label: port.label, dataTypeLabel: port.dataTypeLabel })),
      ...node.data.outputPorts.map((port) => ({ direction: "outputs" as const, nodeId: node.id, nodeLabel: node.data.label, portKey: port.portKey, label: port.label, dataTypeLabel: port.dataTypeLabel })),
    ];
  }), [graph.nodes, contracts]);
  const resourcePath = customNodeEditor ? "/api/custom-nodes" : "/api/workflows";
  useEffect(() => {
    let cancelled = false;
    const customCatalogUrl = customNodeEditor ? `/api/custom-nodes/catalog?excludeId=${encodeURIComponent(workflowId)}` : "/api/custom-nodes/catalog";
    void Promise.all([apiFetch(`${resourcePath}/${workflowId}`), apiFetch("/api/models/contracts"), apiFetch("/api/instagram/account"), apiFetch("/api/artifacts"), apiFetch(customCatalogUrl)])
      .then(async ([flowResponse, catalogResponse, accountResponse, mediaResponse, customResponse]) => {
        if (!flowResponse.ok || !catalogResponse.ok || !accountResponse.ok || !mediaResponse.ok || !customResponse.ok) throw new Error("Could not load workflow and model definitions.");
        const flow = await flowResponse.json() as { workflow?: Workflow; customNode?: Workflow; definition: Definition; interface?: CustomNodeOption["interface"] | null };
        const catalog = await catalogResponse.json() as { models: ModelIoContract[]; dataTypes: DataType[]; customNodes: CustomNodeOption[] };
        const customCatalog = await customResponse.json() as { items: CustomNodeOption[] };
        const accountBody = await accountResponse.json() as { account: { id: string; username: string } | null };
        const mediaBody = await mediaResponse.json() as { items: Array<{ id: string; dataTypeId: string; displayName: string; mediaType: string; savedToLibrary: boolean }> };
        if (cancelled) return;
        setWorkflow((customNodeEditor ? flow.customNode : flow.workflow) ?? null); setCustomNodes(catalog.customNodes ?? []); setAvailableCustomNodes(customCatalog.items);
        setContracts([...catalog.models, ...(catalog.customNodes ?? []).map((item) => item.contract)]); setTypes(catalog.dataTypes);
        setInstagramAccounts(accountBody.account ? [accountBody.account] : []);
        setMediaItems(mediaBody.items);
        setGraph(toIonodesGraph(flow.definition, [...catalog.models, ...(catalog.customNodes ?? []).map((item) => item.contract)], catalog.dataTypes, workflowId));
        setCustomNodeRunEligible(Boolean(customNodeEditor && flow.customNode && !flow.customNode.needsAttention && flow.interface && flow.interface.signature !== "invalid" && flow.interface.inputs.length === 0));
        if (customNodeEditor && flow.interface) setInterfaceSelection({
        inputs: flow.interface.inputs.map((port) => ({ nodeId: port.boundaryNodeId, portKey: port.boundaryPortKey, label: port.label })),
        outputs: flow.interface.outputs.map((port) => ({ nodeId: port.boundaryNodeId, portKey: port.boundaryPortKey, label: port.label })),
        });
      }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not open workflow."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workflowId, resourcePath, customNodeEditor]);
  const options = useMemo(() => [
    { group: "Inputs", items: types.filter((type) => ["text", "image", "audio", "video"].includes(type.id)).map((type) => ({ value: `input:${type.id}`, label: `${type.label} input` })) },
    { group: "Processing", items: [{ value: "processing:text-overlay", label: "Text Overlay" }, { value: "processing:still-image-video", label: "Still Image Video" }] },
    { group: "Publishing", items: [{ value: "publishing:instagram-post", label: "Instagram Post" }, { value: "publishing:instagram-reel", label: "Instagram Reel" }] },
    { group: "Models", items: contracts.filter((model) => model.modality !== "custom" && downloaded.modelIds.has(model.modelId)).map((model) => ({ value: `model:${model.modelId}`, label: model.name })) },
    { group: "Custom nodes", items: availableCustomNodes.map((item) => ({ value: `custom:${item.id}`, label: item.name })) },
  ], [types, contracts, availableCustomNodes, downloaded.modelIds]);
  function addNode() {
    if (!choice) return;
    const [kind, id] = choice.split(":") as ["input" | "model" | "processing" | "publishing" | "custom", string];
    const model = contracts.find((item) => item.modelId === id);
    const dataType = types.find((item) => item.id === id);
    const custom = customNodes.find((item) => item.id === id);
    let parameters: Record<string, unknown> = {};
    if (model?.modality === "text") parameters = { ...defaultTextModelParameters, modelId: id as "qwen3-0.6b" | "qwen3-1.7b" };
    else if (model?.modality === "video") parameters = { ...defaultVideoModelParameters(id as VideoModelParameters["modelId"]) };
    else if (model?.modality === "audio") parameters = { ...defaultAudioModelParameters, modelId: "kokoro-82m" };
    else if (model) parameters = { ...defaultImageModelParameters, modelId: id, steps: imageModelDefaultSteps(id as ImageModelParameters["modelId"]), guidanceScale: id === "flux2-klein-4b" ? 1 : ["sana-sprint-06b", "sd35-medium"].includes(id) ? 4.5 : 7.5 };
    if (kind === "processing" && id === "text-overlay") parameters = { ...textOverlayDefaults };
    if (kind === "processing" && id === "still-image-video") parameters = { ...stillImageVideoDefaults };
    if (kind === "publishing") parameters = { operationId: id, accountId: instagramAccounts[0]?.id ?? "00000000-0000-4000-8000-000000000000", mode: "manual", shareToFeed: true };
    if (kind === "custom" && custom) parameters = { customNodeId: id, customInterfaceSnapshot: custom.interface };
    const node: Definition["nodes"][number] = { id: createId("node"), kind, label: custom?.name ?? model?.name ?? (kind === "processing" ? "Text Overlay" : kind === "publishing" ? (id === "instagram-reel" ? "Instagram Reel" : "Instagram Post") : `${dataType?.label ?? id} input`), modelId: model?.modelId ?? null, dataTypeId: kind === "input" ? id : null, inputText: "", artifactId: null, parameters,
      position: { x: 90 + (graph.nodes.length % 3) * 280, y: 90 + Math.floor(graph.nodes.length / 3) * 190 } };
    setGraph((current) => addWorkflowNode(current, node, contracts, types)); setSelectedNodeId(node.id); setSelectedNodeIds([node.id]); setSelectedConnectionId(null); setDirty(true); setPickerOpen(false); setChoice(null);
  }
  function updateSelectedNode(patch: Partial<WorkflowNodeData>) {
    if (!selected) return;
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        if (node.id !== selected.id) return node;
        const { label, inputText, artifactId, parameters } = patch;
        const metadata = {
          ...(node.metadata ?? {}),
          ...(inputText !== undefined ? { inputText } : {}),
          ...(artifactId !== undefined ? { artifactId } : {}),
          ...(parameters !== undefined ? { parameters } : {}),
        };
        const nextLabel = label ?? node.title;
        const nextArtifactId = artifactId !== undefined ? artifactId : selected.data.artifactId;
        const nextParameters = parameters ?? selected.data.parameters;
        const description = selected.data.kind === "input"
          ? selected.data.dataTypeId === "text" ? "Text input" : nextArtifactId ? "Media selected" : "Input not set"
          : selected.data.kind === "processing"
            ? `Processing · ${nextParameters.operationId === "still-image-video" ? "Still Image Video" : "Text Overlay"}`
            : selected.data.kind === "publishing"
              ? selected.data.parameters.operationId === "instagram-reel" ? "Instagram Reel" : "Instagram Post"
              : selected.data.kind === "custom"
                ? `Custom node · ${customNodes.find((item) => item.id === nextParameters.customNodeId)?.name ?? "Missing custom node"}`
              : selected.data.contract?.name ?? "Model";
        return { ...node, title: nextLabel, description, metadata };
      }),
    }));
    setDirty(true);
    setError(null);
  }
  function replaceCustomNode(customNodeId: string) {
    if (!selected || selected.data.kind !== "custom") return;
    const replacement = customNodes.find((item) => item.id === customNodeId);
    if (!replacement) return;
    const matchPorts = (oldPorts: WorkflowNodeData["inputPorts"], nextPorts: typeof replacement.interface.inputs) => {
      const map = new Map<string, string>();
      for (const oldPort of oldPorts) {
        const matches = nextPorts.filter((port) => port.label === oldPort.label && port.dataTypeId === oldPort.dataTypeId);
        const oldMatches = oldPorts.filter((port) => port.label === oldPort.label && port.dataTypeId === oldPort.dataTypeId);
        if (matches.length === 1 && oldMatches.length === 1) map.set(oldPort.portKey, matches[0]!.portKey);
      }
      return map;
    };
    const inputMap = matchPorts(selected.data.inputPorts, replacement.interface.inputs);
    const outputMap = matchPorts(selected.data.outputPorts, replacement.interface.outputs);
    const definition = toWorkflowDefinition(graph);
    definition.nodes = definition.nodes.map((node) => node.id === selected.id ? { ...node, label: replacement.name, parameters: { ...node.parameters, customNodeId, customInterfaceSnapshot: replacement.interface } } : node);
    definition.edges = definition.edges.flatMap((edge) => {
      if (edge.target === selected.id) {
        const targetHandle = edge.targetHandle ? inputMap.get(edge.targetHandle) : undefined;
        if (edge.targetHandle && !targetHandle) return [];
        return [{ ...edge, targetHandle: targetHandle ?? edge.targetHandle }];
      }
      if (edge.source === selected.id) {
        const sourceHandle = edge.sourceHandle ? outputMap.get(edge.sourceHandle) : undefined;
        if (edge.sourceHandle && !sourceHandle) return [];
        return [{ ...edge, sourceHandle: sourceHandle ?? edge.sourceHandle }];
      }
      return [edge];
    });
    setGraph(toIonodesGraph(definition, contracts, types, workflowId));
    setDirty(true); setError(null);
  }
  function duplicateNode(graphNode: GraphDocument["nodes"][number]) {
    const source = toWorkflowNode(graphNode, contracts);
    const nodeId = createId("node");
    const nodeDefinition: Definition["nodes"][number] = {
      id: nodeId,
      kind: source.data.kind,
      label: `${source.data.label.slice(0, 94)} copy`,
      modelId: source.data.modelId,
      dataTypeId: source.data.dataTypeId,
      inputText: source.data.inputText,
      artifactId: source.data.artifactId,
      parameters: structuredClone(source.data.parameters),
      position: { x: Math.min(source.position.x + 48, 999_900), y: Math.min(source.position.y + 48, 999_900) },
    };
    const next = addWorkflowNode(graph, nodeDefinition, contracts, types);
    setGraph(next); setSelectedNodeId(nodeId); setSelectedNodeIds([nodeId]); setSelectedConnectionId(null); setDirty(true); setError(null);
  }
  async function openImport() {
    setImportOpen(true); setImportError(null); setImportLoading(true);
    try {
      const all: Workflow[] = [];
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages) {
        const response = await apiFetch(`/api/workflows?page=${page}&pageSize=50`);
        if (!response.ok) throw new Error("Could not load your workflows.");
        const body = await response.json() as { items: Workflow[]; totalPages: number };
        all.push(...body.items);
        totalPages = body.totalPages;
        page += 1;
      }
      setImportWorkflows(all.filter((item) => item.id !== workflowId));
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : "Could not load your workflows.");
    } finally { setImportLoading(false); }
  }
  async function selectImportWorkflow(sourceId: string | null) {
    setImportWorkflowId(sourceId); setImportDefinition(null); setImportError(null);
    if (!sourceId) return;
    setImportLoading(true);
    try {
      const response = await apiFetch(`/api/workflows/${sourceId}`);
      const body = await response.json() as { definition?: Definition; message?: string };
      if (!response.ok || !body.definition) throw new Error(body.message ?? "Could not load nodes from this workflow.");
      setImportDefinition(body.definition);
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : "Could not load nodes from this workflow.");
    } finally { setImportLoading(false); }
  }
  function importWorkflow() {
    if (!importDefinition?.nodes.length) return;
    if (graph.nodes.length + importDefinition.nodes.length > 100) { setImportError("A workflow can contain at most 100 nodes."); return; }
    if (graph.connections.length + importDefinition.edges.length > 300) { setImportError("A workflow can contain at most 300 connections."); return; }
    const savedMediaIds = new Set(mediaItems.filter((item) => item.savedToLibrary).map((item) => item.id));
    const minX = Math.min(...importDefinition.nodes.map((node) => node.position.x));
    const maxExistingX = graph.nodes.length ? Math.max(...graph.nodes.map((node) => node.position.x)) : null;
    const offsetX = maxExistingX === null ? 0 : Math.max(0, maxExistingX + 280 - minX);
    const nodeIds = new Map(importDefinition.nodes.map((node) => [node.id, createId("node")]));
    const copiedDefinition: Definition = {
      nodes: importDefinition.nodes.map((source) => {
        const keepArtifact = source.artifactId && savedMediaIds.has(source.artifactId);
        return {
          ...source,
          id: nodeIds.get(source.id)!,
          artifactId: keepArtifact ? source.artifactId : null,
          parameters: structuredClone(source.parameters),
          position: { x: Math.min(source.position.x + offsetX, 999_900), y: source.position.y },
        };
      }),
      edges: importDefinition.edges.map((edge) => ({
        ...edge,
        id: createId("connection"),
        source: nodeIds.get(edge.source)!,
        target: nodeIds.get(edge.target)!,
      })),
    };
    const importedGraph = toIonodesGraph(copiedDefinition, contracts, types, workflowId);
    setGraph((current) => ({ ...current, nodes: [...current.nodes, ...importedGraph.nodes], connections: [...current.connections, ...importedGraph.connections] }));
    setSelectedNodeId(copiedDefinition.nodes.at(-1)?.id ?? null); setSelectedNodeIds(copiedDefinition.nodes.at(-1) ? [copiedDefinition.nodes.at(-1)!.id] : []); setSelectedConnectionId(null); setDirty(true); setError(null);
    setImportOpen(false); setImportWorkflowId(null); setImportDefinition(null);
  }
  const clearedMediaCount = (importDefinition?.nodes ?? []).filter((node) => node.artifactId && !mediaItems.some((item) => item.id === node.artifactId && item.savedToLibrary)).length;
  function openExportSelection() {
    if (!workflow || selectedNodeIds.length === 0) return;
    setExportName(`${workflow.name} selection`.slice(0, 100));
    setExportDescription(`Selected nodes exported from ${workflow.name}.`.slice(0, 1000));
    setExportedWorkflow(null);
    setExportOpen(true);
  }
  async function exportSelection() {
    if (!workflow || selectedNodeIds.length === 0) return;
    setExporting(true);
    try {
      const definition = toWorkflowDefinition(graph);
      const selectedIds = new Set(selectedNodeIds);
      const selectedDefinition: Definition = {
        nodes: definition.nodes.filter((node) => selectedIds.has(node.id)),
        edges: definition.edges.filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target)),
      };
      const response = await apiFetch(`/api/workflows/${workflowId}/export-selection`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: exportName, description: exportDescription, definition: selectedDefinition }),
      });
      const body = await response.json().catch(() => ({})) as { workflow?: Workflow; message?: string };
      if (!response.ok || !body.workflow) throw new Error(body.message ?? "Could not create a workflow from this selection.");
      setExportedWorkflow(body.workflow);
      showFlash({ tone: "success", title: "Workflow created", message: `“${body.workflow.name}” was created with ${body.workflow.nodeCount} ${body.workflow.nodeCount === 1 ? "node" : "nodes"} and ${body.workflow.connectionCount ?? 0} ${body.workflow.connectionCount === 1 ? "connection" : "connections"}.` });
    } catch (cause) {
      showFlash({ tone: "error", title: "Could not export selection", message: cause instanceof Error ? cause.message : "Could not create a workflow from this selection." });
    } finally { setExporting(false); }
  }
  function requestRemoveNode(graphNode: GraphDocument["nodes"][number]) {
    setSelectedNodeId(graphNode.id); setSelectedNodeIds([graphNode.id]); setSelectedConnectionId(null); setRemoveOpen(true);
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
      const knownPorts = new Set(availableBoundaryPorts.map((port) => `${port.direction}\0${port.nodeId}\0${port.portKey}`));
      const savedInterfaceSelection = {
        inputs: interfaceSelection.inputs.filter((port) => knownPorts.has(`inputs\0${port.nodeId}\0${port.portKey}`)),
        outputs: interfaceSelection.outputs.filter((port) => knownPorts.has(`outputs\0${port.nodeId}\0${port.portKey}`)),
      };
      const response = await apiFetch(`${resourcePath}/${workflowId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: workflow.name, description: workflow.description, definition, ...(customNodeEditor ? { interfaceSelection: savedInterfaceSelection } : {}) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error === "invalid_input_counts" ? "Connect all required model inputs and check connection limits." : body.error === "invalid_input" ? "Fill every text input and upload a file for each media input." : body.error === "custom_node_cycle" ? "Custom nodes cannot contain circular references." : body.error === "custom_node_missing" ? "A custom node is missing. Replace or remove it before saving." : "Could not save workflow. Check node settings and connections.");
      setWorkflow(customNodeEditor ? body.customNode : body.workflow);
      if (customNodeEditor) setCustomNodeRunEligible(savedInterfaceSelection.inputs.length === 0 && !body.customNode?.needsAttention);
      setDirty(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save workflow."); }
    finally { setSaving(false); }
  }
  async function run() {
    if (workflow?.needsAttention || (customNodeEditor && !customNodeRunEligible)) return;
    setRunning(true); setError(null);
    try {
      if (customNodeEditor) await startCustomNodeRun(workflowId);
      else await startWorkflowRun(workflowId);
      showFlash({ tone: "success", title: "Run started", message: `“${workflow?.name ?? (customNodeEditor ? "Custom Node" : "Workflow")}" was added to the run queue.` });
    } catch (cause) { showFlash({ tone: "error", title: `Could not start ${customNodeEditor ? "Custom Node" : "workflow"}`, message: cause instanceof Error ? cause.message : "Could not start this run." }); }
    finally { setRunning(false); }
  }
  return <div className="workflow-editor-page">
    <header className="workflow-editor-header"><Group justify="space-between" className="workflow-editor-header-row"><Group className="workflow-header-leading" gap="sm"><Button variant="subtle" onClick={() => { if (!dirty || window.confirm(`Discard unsaved ${customNodeEditor ? "custom node" : "workflow"} changes?`)) onClose(); }}>Back</Button>{workflow?.needsAttention && <Alert className="workflow-header-error" color="hiveWarning" variant="light" radius="sm" p="xs" role="status">This {customNodeEditor ? "custom node" : "workflow"} needs attention. Repair or replace outdated custom node references.</Alert>}{error && <Alert className="workflow-header-error" color="hiveError" variant="light" radius="sm" p="xs" role="alert">{error}</Alert>}</Group><Group wrap="wrap"><Button size="sm" variant="light" leftSection={<AddNodeIcon />} onClick={() => { void downloaded.refresh(); setPickerOpen(true); }}>Add node</Button><Button size="sm" variant="light" onClick={() => void openImport()}>{customNodeEditor ? "Import workflow" : "Import nodes"}</Button>{customNodeEditor && <Button size="sm" variant="light" onClick={() => setInterfaceOpen(true)}>Edit interface</Button>}{!customNodeEditor && <Button size="sm" variant="light" onClick={openExportSelection} disabled={!selectedNodeIds.length || exporting}>Export selected</Button>}<Button size="sm" variant="light" color="hiveError" leftSection={<RemoveIcon />} aria-label="Remove selected connection" disabled={!selectedConnectionId || uploading} onClick={() => { if (!selectedConnectionId) return; setGraph((current) => removeConnection(current, selectedConnectionId)); setSelectedConnectionId(null); setDirty(true); }}>Remove connection</Button><Button variant="subtle" onClick={() => setDetailsOpen(true)}>Edit details</Button>{(!customNodeEditor || customNodeRunEligible) && <Button variant="light" onClick={() => void run()} loading={running} disabled={dirty || !graph.nodes.length || loading || saving || uploading || workflow?.needsAttention || (customNodeEditor && !customNodeRunEligible)}>{customNodeEditor ? "Run custom node" : "Run workflow"}</Button>}<Button onClick={() => void save()} loading={saving} disabled={!dirty || uploading}>Save {customNodeEditor ? "custom node" : "workflow"}</Button></Group></Group></header>
    {loading ? <Group justify="center" className="workflow-editor-loading"><Loader /><Text>Loading workflow…</Text></Group> : workflow && <div className="workflow-editor-body">
      <section className="workflow-editor-canvas" aria-label="Workflow canvas">
        <GraphEditor
          graph={graph}
          graphTitle={workflow?.name ?? "Workflow"}
          selectedNodeId={selectedNodeId}
          onChange={(next) => { setGraph(next); setDirty(true); setError(null); }}
          onSelectionChange={({ nodeIds, connectionIds }) => { setSelectedNodeIds(nodeIds); setSelectedNodeId(nodeIds[0] ?? null); setSelectedConnectionId(connectionIds[0] ?? null); }}
          validateConnection={validateWorkflowConnection}
          showConnectionWarnings={false}
          showEmptyState={false}
          showPalette={false}
          showInspector={false}
          showStatusBar={false}
          className="hive-ionodes"
          renderNodeActions={(graphNode) => <>
            <Tooltip label={`Duplicate ${graphNode.title}`}>
              <ActionIcon className="nodrag nopan" variant="subtle" color="hiveSky" size="sm" aria-label={`Duplicate ${graphNode.title}`} disabled={uploading} onClick={(event) => { event.stopPropagation(); duplicateNode(graphNode); }}><DuplicateIcon /></ActionIcon>
            </Tooltip>
            <Tooltip label={`Remove ${graphNode.title}`}>
              <ActionIcon className="nodrag nopan" variant="subtle" color="hiveError" size="sm" aria-label={`Remove ${graphNode.title}`} disabled={uploading} onClick={(event) => { event.stopPropagation(); requestRemoveNode(graphNode); }}><RemoveIcon /></ActionIcon>
            </Tooltip>
          </>}
          theme={{ "--ionodes-bg": "var(--hive-canvas-background)", "--ionodes-surface": "var(--hive-canvas-surface)", "--ionodes-text": "var(--hive-canvas-text)", "--ionodes-muted": "var(--hive-canvas-muted)", "--ionodes-border": "var(--hive-canvas-border)", "--ionodes-accent": "var(--hive-canvas-accent)", "--ionodes-danger": "var(--hive-canvas-danger)" }}
          canvas={{ hideAttribution: true, backgroundColor: "#e0e5eb", miniMapMaskColor: "rgba(124, 135, 148, 0.16)", miniMapNodeColor: (_node, invalid) => invalid ? "#ba514d" : "#4285f4" }}
        />
      </section>
      {selected && <aside className="workflow-config-panel" aria-label="Node configuration">
        <WorkflowNodeConfiguration
          selected={selected}
          types={types}
          instagramAccounts={instagramAccounts}
          downloadedModelIds={downloaded.modelIds}
          mediaItems={mediaItems}
          customNodeOptions={availableCustomNodes}
          uploading={uploading}
          onUpdate={updateSelectedNode}
          onReplaceCustomNode={replaceCustomNode}
          onUpload={(file) => void upload(file)}
          onImportUrl={(url) => void importUrl(url)}
        />
      </aside>}
      </div>}
    <Modal opened={pickerOpen} onClose={() => setPickerOpen(false)} title="Add node" centered><Stack><Select label="Node" placeholder="Choose an input or downloaded model" data={options} value={choice} onChange={setChoice} searchable /><Text size="xs" c="dimmed">Only downloaded models are available here. Download additional models from Models.</Text>{downloaded.status === "unavailable" && <Alert color="hiveWarning">Could not check model downloads. Input nodes remain available.</Alert>}<Button onClick={addNode} disabled={!choice}>Add node</Button></Stack></Modal>
    <Modal opened={interfaceOpen} onClose={() => setInterfaceOpen(false)} title="Custom node interface" centered size="lg"><Stack><Text size="sm" c="dimmed">Choose which ports callers can connect to. A port can be exposed even when it is already connected inside this custom node.</Text><ScrollArea h={420} type="auto"><Stack gap="lg">{(["inputs", "outputs"] as const).map((direction) => <Stack key={direction} gap="xs"><Text fw={600}>{direction === "inputs" ? "Inputs" : "Outputs"}</Text>{availableBoundaryPorts.filter((port) => port.direction === direction).length ? availableBoundaryPorts.filter((port) => port.direction === direction).map((port) => {
      const selectedPorts = interfaceSelection[direction];
      const checked = selectedPorts.some((item) => item.nodeId === port.nodeId && item.portKey === port.portKey);
      const selectedPort = selectedPorts.find((item) => item.nodeId === port.nodeId && item.portKey === port.portKey);
      return <Stack key={`${port.nodeId}:${port.portKey}`} gap={4}><Checkbox label={`${port.nodeLabel} · ${port.label} (${port.dataTypeLabel})`} checked={checked} onChange={(event) => { const isChecked = event.currentTarget.checked; setInterfaceSelection((current) => ({ ...current, [direction]: isChecked ? [...current[direction], { nodeId: port.nodeId, portKey: port.portKey, label: port.label }] : current[direction].filter((item) => item.nodeId !== port.nodeId || item.portKey !== port.portKey) })); setDirty(true); }} />{checked && <TextInput ml="xl" label={`Public ${direction === "inputs" ? "input" : "output"} name`} value={selectedPort?.label ?? port.label} maxLength={100} required onChange={(event) => { const label = event.currentTarget.value; setInterfaceSelection((current) => ({ ...current, [direction]: current[direction].map((item) => item.nodeId === port.nodeId && item.portKey === port.portKey ? { ...item, label } : item) })); setDirty(true); }} />}</Stack>;
    }) : <Text size="sm" c="dimmed">No available {direction} ports.</Text>}</Stack>)}</Stack></ScrollArea><Group justify="flex-end"><Button onClick={() => { setInterfaceOpen(false); setDirty(true); }}>Done</Button></Group></Stack></Modal>
    <Modal opened={importOpen} onClose={() => setImportOpen(false)} title="Import a workflow" centered size="lg"><Stack>{importError && <Alert color="hiveError" title="Could not import workflow">{importError}</Alert>}{importLoading && <Group><Loader size="sm" /><Text size="sm">Loading workflows…</Text></Group>}<Select label="Workflow to import" placeholder="Choose a workflow" data={importWorkflows.map((item) => ({ value: item.id, label: item.name }))} value={importWorkflowId} onChange={(value) => void selectImportWorkflow(value)} searchable disabled={importLoading} />{importDefinition && <Text size="sm">This will import {importDefinition.nodes.length} {importDefinition.nodes.length === 1 ? "node" : "nodes"} and {importDefinition.edges.length} {importDefinition.edges.length === 1 ? "connection" : "connections"}.</Text>}<Text size="sm" c="dimmed">The complete workflow is copied with new node and connection IDs. Its layout and connections are preserved, while it remains independent of the source workflow.</Text>{clearedMediaCount > 0 && <Alert color="hiveWarning">{clearedMediaCount} node {clearedMediaCount === 1 ? "uses" : "use"} workflow-only media from the source. Those file selections will be cleared; choose or upload media for this workflow after importing. Saved Media Library files remain linked.</Alert>}<Group justify="flex-end"><Button variant="default" onClick={() => setImportOpen(false)}>Cancel</Button><Button onClick={importWorkflow} disabled={!importDefinition?.nodes.length || importLoading || graph.nodes.length + (importDefinition?.nodes.length ?? 0) > 100 || graph.connections.length + (importDefinition?.edges.length ?? 0) > 300}>Import workflow</Button></Group></Stack></Modal>
      <ConfirmActionModal opened={removeOpen} onClose={() => setRemoveOpen(false)} title="Remove node" confirmLabel="Remove node" onConfirm={() => { if (!selected) return; setGraph((current) => removeNode(current, selected.id)); setSelectedNodeId(null); setSelectedNodeIds([]); setSelectedConnectionId(null); setDirty(true); setRemoveOpen(false); }}>
      <Text>Remove {selected?.data.label} and its connections?</Text>
    </ConfirmActionModal>
    <Modal opened={exportOpen} onClose={() => { if (!exporting) setExportOpen(false); }} title="Export selected nodes" centered>
      <Stack gap="md">
        {exportedWorkflow ? <>
          <Group justify="flex-end"><Button variant="default" onClick={() => setExportOpen(false)}>Stay here</Button><Button onClick={() => { window.location.hash = `workflows/${exportedWorkflow.id}`; }}>Open workflow</Button></Group>
        </> : <>
          <Text size="sm">Create a separate workflow from {selectedNodeIds.length} selected {selectedNodeIds.length === 1 ? "node" : "nodes"} and the connections between them.</Text>
          <TextInput label="Workflow name" value={exportName} maxLength={100} onChange={(event) => setExportName(event.currentTarget.value)} required />
          <Textarea label="Description" value={exportDescription} maxLength={1000} onChange={(event) => setExportDescription(event.currentTarget.value)} minRows={2} autosize />
          <Text size="xs" c="dimmed">Only connections whose two nodes are selected are included. Media uploaded only for the original workflow must be selected again; saved Media Library files are retained.</Text>
          <Group justify="flex-end"><Button variant="default" onClick={() => setExportOpen(false)} disabled={exporting}>Cancel</Button><Button onClick={() => void exportSelection()} loading={exporting} disabled={!exportName.trim()}>Create workflow</Button></Group>
        </>}
      </Stack>
    </Modal>
    <Modal opened={detailsOpen} onClose={() => setDetailsOpen(false)} title="Workflow details" centered>{workflow && <Stack><TextInput label="Name" value={workflow.name} maxLength={100} onChange={(event) => { setWorkflow({ ...workflow, name: event.currentTarget.value }); setDirty(true); }} /><Textarea label="Description" value={workflow.description} maxLength={1000} onChange={(event) => { setWorkflow({ ...workflow, description: event.currentTarget.value }); setDirty(true); }} /><Button onClick={() => setDetailsOpen(false)}>Done</Button></Stack>}</Modal>
  </div>;
}

function AddNodeIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function DuplicateIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>; }
function RemoveIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 12.2a1 1 0 0 1-1 .8H7.8a1 1 0 0 1-1-.8L6 7m4 4v5m4-5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
