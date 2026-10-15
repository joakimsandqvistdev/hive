import { Alert, ColorInput, FileInput, Image, Loader, NumberInput, Select, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { apiUrl } from "../apiClient";
import { ImageModelParametersFields, type ImageModelParameters } from "../components/ImageModelParametersFields";
import { VideoModelParametersFields, type VideoModelParameters } from "../components/VideoModelParametersFields";
import { AudioModelParametersFields, type AudioModelParameters } from "../components/AudioModelParametersFields";
import { formatModelPortCardinality } from "../modelIoTypes";
import type { DataType, WorkflowNode, WorkflowNodeData } from "./workflowTypes";
import { textOverlayDefaults } from "./processingNodeTypes";

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
    <Title order={2} size="h4">{selected.data.kind === "input" ? "Input node" : selected.data.kind === "processing" ? "Processing node" : "Model node"}</Title>
    <TextInput label="Node name" value={selected.data.label} maxLength={100} onChange={(event) => onUpdate({ label: event.currentTarget.value })} />
    {selected.data.kind === "input" ? <>
      <Text size="sm">Datatype: {types.find((type) => type.id === selected.data.dataTypeId)?.label}</Text>
      {selected.data.dataTypeId === "text" ? <Textarea label="Text" value={selected.data.inputText} onChange={(event) => onUpdate({ inputText: event.currentTarget.value })} maxLength={8000} minRows={6} autosize /> : <>
        <FileInput key={selected.id} label={selected.data.artifactId ? "Replace file" : "Upload file"} accept={selected.data.dataTypeId === "image" ? "image/png,image/jpeg,image/webp" : "audio/wav,audio/mpeg,audio/ogg,audio/flac"} onChange={onUpload} disabled={uploading} />
        <Text size="xs" c="dimmed">{selected.data.dataTypeId === "image" ? "PNG, JPEG, WebP · up to 10 MB" : "WAV, MP3, Ogg, FLAC · up to 25 MB"}</Text>
        {uploading && <Loader size="sm" />}
        {selected.data.artifactId && (selected.data.dataTypeId === "image" ? <Image src={apiUrl(`/api/artifacts/${selected.data.artifactId}/preview`)} alt={selected.data.label} fit="contain" mah={240} /> : <audio key={selected.data.artifactId} controls src={apiUrl(`/api/artifacts/${selected.data.artifactId}/preview`)} />)}
      </>}
    </> : selected.data.kind === "processing" ? <>
      <Text fw={600}>Text Overlay</Text>
      <Text size="sm" c="dimmed">Connect one image and one text input. Text is rendered directly; no model is used.</Text>
      <Select label="Font" data={[
        { value: "Liberation Sans", label: "Sans serif" },
        { value: "Liberation Serif", label: "Serif" },
        { value: "Liberation Mono", label: "Monospace" },
      ]} value={String(selected.data.parameters.fontFamily ?? textOverlayDefaults.fontFamily)} onChange={(fontFamily) => fontFamily && onUpdate({ parameters: { ...selected.data.parameters, fontFamily } })} />
      <NumberInput label="Font size" min={8} max={256} value={Number(selected.data.parameters.fontSize ?? textOverlayDefaults.fontSize)} onChange={(fontSize) => typeof fontSize === "number" && onUpdate({ parameters: { ...selected.data.parameters, fontSize } })} />
      <Select label="Weight" data={[{ value: "400", label: "Regular" }, { value: "700", label: "Bold" }]} value={String(selected.data.parameters.fontWeight ?? textOverlayDefaults.fontWeight)} onChange={(fontWeight) => fontWeight && onUpdate({ parameters: { ...selected.data.parameters, fontWeight: Number(fontWeight) } })} />
      <ColorInput label="Text color" format="hex" value={String(selected.data.parameters.color ?? textOverlayDefaults.color)} onChange={(color) => onUpdate({ parameters: { ...selected.data.parameters, color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : textOverlayDefaults.color } })} />
      <Select label="Placement" data={["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"].map((value) => ({ value, label: value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) }))} value={String(selected.data.parameters.placement ?? textOverlayDefaults.placement)} onChange={(placement) => placement && onUpdate({ parameters: { ...selected.data.parameters, placement } })} />
      <Select label="Text alignment" data={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} value={String(selected.data.parameters.alignment ?? textOverlayDefaults.alignment)} onChange={(alignment) => alignment && onUpdate({ parameters: { ...selected.data.parameters, alignment } })} />
      <NumberInput label="Margin" description="Percent of the shorter image dimension" min={0} max={30} value={Number(selected.data.parameters.margin ?? textOverlayDefaults.margin)} onChange={(margin) => typeof margin === "number" && onUpdate({ parameters: { ...selected.data.parameters, margin } })} />
      <NumberInput label="Line spacing" min={1} max={2} step={0.1} decimalScale={1} value={Number(selected.data.parameters.lineSpacing ?? textOverlayDefaults.lineSpacing)} onChange={(lineSpacing) => typeof lineSpacing === "number" && onUpdate({ parameters: { ...selected.data.parameters, lineSpacing } })} />
      {selected.data.inputPorts.map((port) => <Text key={port.portKey} size="sm">{port.label}: {port.dataTypeLabel}</Text>)}
    </> : <>
      <Text fw={600}>{selected.data.contract?.name ?? selected.data.modelId}</Text>
      {!downloadedModelIds.has(selected.data.modelId ?? "") && <Alert color="hiveWarning">This model is not downloaded. Download it from Models before running.</Alert>}
      <Text size="sm" c="dimmed">Connect input nodes or model outputs to each required port. Prompts are supplied through text connections.</Text>
      {selected.data.inputPorts.map((port) => <Text key={port.portKey} size="sm">{port.label}: {port.dataTypeLabel} · {formatModelPortCardinality(port.minCount, port.maxCount)}</Text>)}
      {selected.data.contract?.modality === "video" ? <VideoModelParametersFields value={selected.data.parameters as VideoModelParameters} onChange={(parameters) => onUpdate({ parameters: { ...parameters } })} /> : selected.data.contract?.modality === "audio" ? <AudioModelParametersFields value={selected.data.parameters as AudioModelParameters} onChange={(parameters) => onUpdate({ parameters: { ...parameters } })} /> : <ImageModelParametersFields showModelSelect={false} value={selected.data.parameters as ImageModelParameters} onChange={(parameters) => onUpdate({ parameters: { ...parameters } })} />}
    </>}
  </Stack>;
}
