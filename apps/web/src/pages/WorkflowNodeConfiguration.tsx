import { Alert, FileInput, Image, Loader, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { apiUrl } from "../apiClient";
import { ImageModelParametersFields, type ImageModelParameters } from "../components/ImageModelParametersFields";
import { VideoModelParametersFields, type VideoModelParameters } from "../components/VideoModelParametersFields";
import { AudioModelParametersFields, type AudioModelParameters } from "../components/AudioModelParametersFields";
import { formatModelPortCardinality } from "../modelIoTypes";
import type { DataType, WorkflowNode, WorkflowNodeData } from "./workflowTypes";

export function WorkflowNodeConfiguration({ selected, types, downloadedModelIds, uploading, onUpdate, onUpload }: {
  selected?: WorkflowNode;
  types: DataType[];
  downloadedModelIds: Set<string>;
  uploading: boolean;
  onUpdate: (patch: Partial<WorkflowNodeData>) => void;
  onUpload: (file: File | null) => void;
}) {
  if (!selected) return <Text size="sm" c="dimmed">Select a node to edit its data or model settings. Connect outputs to matching model input datatypes.</Text>;
  return <Stack>
    <Title order={2} size="h4">{selected.data.kind === "input" ? "Input node" : "Model node"}</Title>
    <TextInput label="Node name" value={selected.data.label} maxLength={100} onChange={(event) => onUpdate({ label: event.currentTarget.value })} />
    {selected.data.kind === "input" ? <>
      <Text size="sm">Datatype: {types.find((type) => type.id === selected.data.dataTypeId)?.label}</Text>
      {selected.data.dataTypeId === "text" ? <Textarea label="Text" value={selected.data.inputText} onChange={(event) => onUpdate({ inputText: event.currentTarget.value })} maxLength={8000} minRows={6} autosize /> : <>
        <FileInput key={selected.id} label={selected.data.artifactId ? "Replace file" : "Upload file"} accept={selected.data.dataTypeId === "image" ? "image/png,image/jpeg,image/webp" : "audio/wav,audio/mpeg,audio/ogg,audio/flac"} onChange={onUpload} disabled={uploading} />
        <Text size="xs" c="dimmed">{selected.data.dataTypeId === "image" ? "PNG, JPEG, WebP · up to 10 MB" : "WAV, MP3, Ogg, FLAC · up to 25 MB"}</Text>
        {uploading && <Loader size="sm" />}
        {selected.data.artifactId && (selected.data.dataTypeId === "image" ? <Image src={apiUrl(`/api/artifacts/${selected.data.artifactId}/preview`)} alt={selected.data.label} fit="contain" mah={240} /> : <audio key={selected.data.artifactId} controls src={apiUrl(`/api/artifacts/${selected.data.artifactId}/preview`)} />)}
      </>}
    </> : <>
      <Text fw={600}>{selected.data.contract?.name ?? selected.data.modelId}</Text>
      {!downloadedModelIds.has(selected.data.modelId ?? "") && <Alert color="hiveWarning">This model is not downloaded. Download it from Models before running.</Alert>}
      <Text size="sm" c="dimmed">Connect input nodes or model outputs to each required port. Prompts are supplied through text connections.</Text>
      {selected.data.inputPorts.map((port) => <Text key={port.portKey} size="sm">{port.label}: {port.dataTypeLabel} · {formatModelPortCardinality(port.minCount, port.maxCount)}</Text>)}
      {selected.data.contract?.modality === "video" ? <VideoModelParametersFields value={selected.data.parameters as VideoModelParameters} onChange={(parameters) => onUpdate({ parameters: { ...parameters } })} /> : selected.data.contract?.modality === "audio" ? <AudioModelParametersFields value={selected.data.parameters as AudioModelParameters} onChange={(parameters) => onUpdate({ parameters: { ...parameters } })} /> : <ImageModelParametersFields showModelSelect={false} value={selected.data.parameters as ImageModelParameters} onChange={(parameters) => onUpdate({ parameters: { ...parameters } })} />}
    </>}
  </Stack>;
}
