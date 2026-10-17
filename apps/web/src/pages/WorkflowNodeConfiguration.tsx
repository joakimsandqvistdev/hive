import { useEffect, useState } from "react";
import { Alert, Button, ColorInput, FileInput, Group, Image, Loader, NumberInput, Select, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { apiFetch, apiUrl } from "../apiClient";
import { ImageModelParametersFields, type ImageModelParameters } from "../components/ImageModelParametersFields";
import { VideoModelParametersFields, type VideoModelParameters } from "../components/VideoModelParametersFields";
import { AudioModelParametersFields, type AudioModelParameters } from "../components/AudioModelParametersFields";
import { TextModelParametersFields, type TextModelParameters } from "../components/TextModelParametersFields";
import { formatModelPortCardinality, type ModelIoPort } from "../modelIoTypes";
import type { DataType, WorkflowNode, WorkflowNodeData } from "./workflowTypes";
import { stillImageVideoDefaults, textOverlayDefaults } from "./processingNodeTypes";
import { defaultWebhookIdentifier } from "./webhookInputMappings";

export function WorkflowNodeConfiguration({ selected, types, instagramAccounts, downloadedModelIds, mediaItems, customNodeOptions, uploading, onUpdate, onUpload, onImportUrl, onReplaceCustomNode }: {
  selected?: WorkflowNode;
  types: DataType[];
  instagramAccounts: Array<{ id: string; username: string }>;
  downloadedModelIds: Set<string>;
  mediaItems: Array<{ id: string; dataTypeId: string; displayName: string; savedToLibrary: boolean }>;
  customNodeOptions: Array<{ id: string; name: string; description: string; needsAttention?: boolean; interface: { inputs: ModelIoPort[]; outputs: ModelIoPort[]; signature: string } }>;
  uploading: boolean;
  onUpdate: (patch: Partial<WorkflowNodeData>) => void;
  onUpload: (file: File | null) => void;
  onImportUrl: (url: string) => void;
  onReplaceCustomNode: (id: string) => void;
}) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [mediaSearch, setMediaSearch] = useState("");
  const [libraryOptions, setLibraryOptions] = useState<Array<{ id: string; dataTypeId: string; displayName: string; savedToLibrary: boolean }>>([]);
  const selectedMediaType = selected?.data.kind === "input" && typeof selected.data.dataTypeId === "string" && ["image", "audio", "video"].includes(selected.data.dataTypeId) ? selected.data.dataTypeId : null;
  const selectedArtifactId = selected?.data.kind === "input" ? selected.data.artifactId ?? null : null;
  useEffect(() => {
    if (!selectedMediaType) { setLibraryOptions([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ dataTypeId: selectedMediaType, search: mediaSearch });
      if (selectedArtifactId) params.set("artifactId", selectedArtifactId);
      void apiFetch(`/api/artifacts/library-options?${params}`).then(async (response) => {
        if (!response.ok) throw new Error("Could not search saved media.");
        const body = await response.json() as { items: Array<{ id: string; dataTypeId: string; displayName: string; savedToLibrary: boolean }> };
        if (!cancelled) setLibraryOptions(body.items);
      }).catch(() => { if (!cancelled) setLibraryOptions([]); });
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [mediaSearch, selectedArtifactId, selectedMediaType]);
  useEffect(() => { setMediaSearch(""); }, [selected?.id, selectedMediaType]);
  if (!selected) return <Text size="sm" c="dimmed">Select a node to edit its data or model settings. Connect outputs to matching model input datatypes.</Text>;
  return <Stack>
    <Title order={2} size="h4">{selected.data.kind === "input" ? "Input node" : selected.data.kind === "processing" ? "Processing node" : selected.data.kind === "publishing" ? "Publishing node" : selected.data.kind === "custom" ? "Custom node" : "Model node"}</Title>
    <TextInput label="Node name" value={selected.data.label} maxLength={100} onChange={(event) => onUpdate({ label: event.currentTarget.value })} />
    {selected.data.kind === "custom" ? (() => {
      const customNodeId = String(selected.data.parameters.customNodeId ?? "");
      const current = customNodeOptions.find((item) => item.id === customNodeId);
      const snapshot = selected.data.parameters.customInterfaceSnapshot as { signature?: string } | undefined;
      const stale = Boolean(current && snapshot?.signature !== current.interface.signature);
      return <>
        {!current && <Alert color="hiveError" title="Custom node missing">This node refers to a custom node that was deleted. Restore that custom node or remove this placeholder to clear the workflow’s attention status.</Alert>}
        {stale && <Alert color="hiveWarning" title="Interface changed">This custom node’s inputs or outputs have changed. Update its interface; Hive will reconnect exact name-and-datatype matches automatically.</Alert>}
        {current?.needsAttention && !stale && <Alert color="hiveWarning" title="Nested custom node needs attention">Open Custom Nodes and repair the dependencies inside “{current.name}” before running this workflow.</Alert>}
        {current && <Text size="sm" fw={500}>Using {current.name}</Text>}
        {stale && <Button variant="light" onClick={() => onReplaceCustomNode(customNodeId)}>Update to latest interface</Button>}
        {current?.description && <Text size="sm" c="dimmed">{current.description}</Text>}
        {selected.data.inputPorts.map((port) => <Text key={port.portKey} size="sm">Input · {port.label}: {port.dataTypeLabel} {port.minCount > 0 ? "· required" : "· optional"}</Text>)}
        {selected.data.outputPorts.map((port) => <Text key={port.portKey} size="sm">Output · {port.label}: {port.dataTypeLabel}</Text>)}
      </>;
    })() : selected.data.kind === "input" ? <>
      <Text size="sm">Datatype: {types.find((type) => type.id === selected.data.dataTypeId)?.label}</Text>
      {selected.data.dataTypeId === "text" ? <>
        <Textarea label="Text" value={selected.data.inputText} onChange={(event) => onUpdate({ inputText: event.currentTarget.value })} maxLength={8000} minRows={6} autosize />
        <TextInput label="Webhook identifier" description="Use this JSON path for webhook text, or clear it to keep this input private from webhooks. Dotted paths such as brief.captionPrompt are supported." value={typeof selected.data.parameters.webhookIdentifier === "string" ? selected.data.parameters.webhookIdentifier : defaultWebhookIdentifier(selected.data.label)} onChange={(event) => onUpdate({ parameters: { ...selected.data.parameters, webhookIdentifier: event.currentTarget.value } })} maxLength={200} />
      </> : <>
        <Select label="Choose from Media Library" placeholder="Search saved media by file name" clearable searchable searchValue={mediaSearch} onSearchChange={setMediaSearch} nothingFoundMessage={mediaSearch ? "No file names match" : "No saved media"} value={selected.data.artifactId ?? null} data={(() => {
          const options = new Map<string, { value: string; label: string }>();
          for (const item of mediaItems) if (item.id === selected.data.artifactId && item.dataTypeId === selected.data.dataTypeId) options.set(item.id, { value: item.id, label: item.displayName });
          for (const item of libraryOptions) if ((item.savedToLibrary || item.id === selected.data.artifactId) && item.dataTypeId === selected.data.dataTypeId) options.set(item.id, { value: item.id, label: item.displayName });
          return [...options.values()];
        })()} onChange={(artifactId) => { onUpdate({ artifactId, inputText: "" }); setMediaSearch(""); }} />
        <FileInput key={selected.id} label={selected.data.artifactId ? "Replace with uploaded file" : "Upload file to this workflow"} accept={selected.data.dataTypeId === "image" ? "image/png,image/jpeg,image/webp" : selected.data.dataTypeId === "audio" ? "audio/wav,audio/mpeg,audio/ogg,audio/flac" : "video/mp4"} onChange={onUpload} disabled={uploading} />
        <Text size="xs" c="dimmed">{selected.data.dataTypeId === "image" ? "PNG, JPEG, WebP · up to 10 MB" : selected.data.dataTypeId === "audio" ? "WAV, MP3, Ogg, FLAC · up to 25 MB" : "MP4 only · up to 50 MB"} Uploads stay with this workflow unless you save them to the Media Library.</Text>
        <Group align="end"><TextInput label="Import from URL" placeholder="https://example.com/media" value={sourceUrl} onChange={(event) => setSourceUrl(event.currentTarget.value)} style={{ flex: 1 }} /><Button variant="light" loading={uploading} disabled={!sourceUrl.trim()} onClick={() => { onImportUrl(sourceUrl.trim()); setSourceUrl(""); }}>Import</Button></Group>
        {uploading && <Loader size="sm" />}
        {selected.data.artifactId && (selected.data.dataTypeId === "image" ? <Image src={apiUrl(`/api/artifacts/${selected.data.artifactId}/preview`)} alt={selected.data.label} fit="contain" w="100%" style={{ height: "auto" }} /> : selected.data.dataTypeId === "audio" ? <audio key={selected.data.artifactId} controls src={apiUrl(`/api/artifacts/${selected.data.artifactId}/preview`)} /> : <video key={selected.data.artifactId} controls playsInline src={apiUrl(`/api/artifacts/${selected.data.artifactId}/preview`)} style={{ display: "block", width: "100%" }} />)}
      </>}
    </> : selected.data.kind === "processing" ? <>
      {selected.data.parameters.operationId === "still-image-video" ? <>
        <Text fw={600}>Still Image Video</Text>
        <Text size="sm" c="dimmed">Creates a 1080×1920 H.264 MP4 at 24 fps. The full image is fitted with black padding and is not cropped. Optional audio is mixed as a soundtrack and only attenuated.</Text>
        <NumberInput label="Duration (seconds)" min={3} max={900} step={1} value={Number(selected.data.parameters.durationSeconds ?? stillImageVideoDefaults.durationSeconds)} onChange={(value) => typeof value === "number" && onUpdate({ parameters: { ...selected.data.parameters, durationSeconds: value } })} />
        <NumberInput label="Soundtrack volume (%)" description="0–100%; the original audio is never amplified." min={0} max={100} step={1} value={Number(selected.data.parameters.audioVolume ?? 100)} onChange={(value) => typeof value === "number" && onUpdate({ parameters: { ...selected.data.parameters, audioVolume: value } })} />
      </> : <>
      <Text fw={600}>Text Overlay</Text>
      <Text size="sm" c="dimmed">Connect one image and one text input. Text is rendered directly; no model is used.</Text>
      <Select label="Font" data={[
        { value: "Liberation Sans", label: "Liberation Sans" },
        { value: "Liberation Sans Narrow", label: "Liberation Sans Narrow" },
        { value: "Liberation Serif", label: "Liberation Serif" },
        { value: "Liberation Mono", label: "Liberation Mono" },
        { value: "DejaVu Sans", label: "DejaVu Sans" },
        { value: "DejaVu Serif", label: "DejaVu Serif" },
        { value: "DejaVu Sans Mono", label: "DejaVu Sans Mono" },
        { value: "Lato", label: "Lato" },
      ]} renderOption={({ option }) => <Stack gap={0} py={2}>
        <Text size="sm" fw={500}>{option.label}</Text>
        <Text size="xs" c="dimmed" style={{ fontFamily: `"${option.value}", sans-serif` }}>Aa Bb 123 — The quick brown fox</Text>
      </Stack>} value={String(selected.data.parameters.fontFamily ?? textOverlayDefaults.fontFamily)} onChange={(fontFamily) => fontFamily && onUpdate({ parameters: { ...selected.data.parameters, fontFamily } })} />
      <NumberInput label="Font size" min={8} max={256} value={Number(selected.data.parameters.fontSize ?? textOverlayDefaults.fontSize)} onChange={(fontSize) => typeof fontSize === "number" && onUpdate({ parameters: { ...selected.data.parameters, fontSize } })} />
      <Select label="Weight" data={[{ value: "400", label: "Regular" }, { value: "700", label: "Bold" }]} value={String(selected.data.parameters.fontWeight ?? textOverlayDefaults.fontWeight)} onChange={(fontWeight) => fontWeight && onUpdate({ parameters: { ...selected.data.parameters, fontWeight: Number(fontWeight) } })} />
      <ColorInput label="Text color" format="hex" value={String(selected.data.parameters.color ?? textOverlayDefaults.color)} onChange={(color) => onUpdate({ parameters: { ...selected.data.parameters, color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : textOverlayDefaults.color } })} />
      <Select label="Placement" data={["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"].map((value) => ({ value, label: value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) }))} value={String(selected.data.parameters.placement ?? textOverlayDefaults.placement)} onChange={(placement) => placement && onUpdate({ parameters: { ...selected.data.parameters, placement } })} />
      <Select label="Text alignment" data={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} value={String(selected.data.parameters.alignment ?? textOverlayDefaults.alignment)} onChange={(alignment) => alignment && onUpdate({ parameters: { ...selected.data.parameters, alignment } })} />
      <NumberInput label="Margin" description="Percent of the shorter image dimension" min={0} max={30} value={Number(selected.data.parameters.margin ?? textOverlayDefaults.margin)} onChange={(margin) => typeof margin === "number" && onUpdate({ parameters: { ...selected.data.parameters, margin } })} />
      <NumberInput label="Line spacing" min={1} max={2} step={0.1} decimalScale={1} value={Number(selected.data.parameters.lineSpacing ?? textOverlayDefaults.lineSpacing)} onChange={(lineSpacing) => typeof lineSpacing === "number" && onUpdate({ parameters: { ...selected.data.parameters, lineSpacing } })} />
      </>}
      {selected.data.inputPorts.map((port) => <Text key={port.portKey} size="sm">{port.label}: {port.dataTypeLabel}</Text>)}
    </> : selected.data.kind === "publishing" ? <>
      <Text fw={600}>{selected.data.parameters.operationId === "instagram-reel" ? "Instagram Reel" : "Instagram Post"}</Text>
      <Text size="sm" c="dimmed">Connect generated media and a caption. Publishing runs after generation.</Text>
      <Select label="Instagram account" placeholder="Connect an account in Accounts" data={instagramAccounts.map((account) => ({ value: account.id, label: `@${account.username}` }))} value={String(selected.data.parameters.accountId ?? "")} onChange={(accountId) => accountId && onUpdate({ parameters: { ...selected.data.parameters, accountId } })} />
      <Select label="After generation" data={[{ value: "manual", label: "Review and publish manually" }, { value: "automatic", label: "Publish automatically" }]} value={String(selected.data.parameters.mode ?? "manual")} onChange={(mode) => mode && onUpdate({ parameters: { ...selected.data.parameters, mode } })} />
      {selected.data.parameters.operationId === "instagram-reel" && <Select label="Also share to feed" data={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} value={String(selected.data.parameters.shareToFeed !== false)} onChange={(value) => value && onUpdate({ parameters: { ...selected.data.parameters, shareToFeed: value === "true" } })} />}
      {instagramAccounts.length === 0 && <Alert color="hiveWarning">Connect a professional Instagram account from Accounts before saving this node.</Alert>}
      {selected.data.inputPorts.map((port) => <Text key={port.portKey} size="sm">{port.label}: {port.dataTypeLabel} · required</Text>)}
    </> : <>
      <Text fw={600}>{selected.data.contract?.name ?? selected.data.modelId}</Text>
      {!downloadedModelIds.has(selected.data.modelId ?? "") && <Alert color="hiveWarning">This model is not downloaded. Download it from Models before running.</Alert>}
      <Text size="sm" c="dimmed">Connect input nodes or model outputs to each required port. Prompts are supplied through text connections.</Text>
      {selected.data.inputPorts.map((port) => <Text key={port.portKey} size="sm">{port.label}: {port.dataTypeLabel} · {formatModelPortCardinality(port.minCount, port.maxCount)}</Text>)}
      {selected.data.contract?.modality === "text" ? <TextModelParametersFields value={selected.data.parameters as TextModelParameters} onChange={(parameters) => onUpdate({ parameters: { ...parameters } })} /> : selected.data.contract?.modality === "video" ? <VideoModelParametersFields value={selected.data.parameters as VideoModelParameters} onChange={(parameters) => onUpdate({ parameters: { ...parameters } })} /> : selected.data.contract?.modality === "audio" ? <AudioModelParametersFields value={selected.data.parameters as AudioModelParameters} onChange={(parameters) => onUpdate({ parameters: { ...parameters } })} /> : <ImageModelParametersFields showModelSelect={false} value={selected.data.parameters as ImageModelParameters} onChange={(parameters) => onUpdate({ parameters: { ...parameters } })} />}
    </>}
  </Stack>;
}
