import { useEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { Alert, Badge, Button, Group, Image, Loader, Paper, Stack, Table, Text, Textarea } from "@mantine/core";
import { apiFetch, apiUrl } from "../apiClient";
import { formatFileSize } from "../formatters";
import { active, date, nodeTypeLabel, statusColor, timingLabel } from "../runFormatting";
import type { Artifact, Detail } from "../runTypes";

export function ArtifactPreview({ artifactId, label, mediaType, className }: { artifactId: string; label: string; mediaType: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false;
    let objectUrl: string | null = null;
    setSrc(null);
    setFailed(false);
    if (mediaType === "video/mp4") {
      setSrc(apiUrl(`/api/artifacts/${artifactId}/preview`));
      return () => { disposed = true; };
    }
    void apiFetch(`/api/artifacts/${artifactId}/preview`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Preview unavailable");
        return response.blob();
      })
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [artifactId, mediaType]);

  return <Paper className={className} withBorder p="xs" aria-label={`${label} preview`}>
    {failed ? <Group h={240} justify="center"><Text size="sm" c="dimmed">Preview unavailable</Text></Group>
      : src ? mediaType.startsWith("video/")
      ? <video src={src} controls crossOrigin="use-credentials" playsInline preload="metadata" onError={() => setFailed(true)} aria-label={`${label} generated video`} style={{ width: "100%", maxHeight: 320 }} />
      : mediaType.startsWith("audio/") ? <audio src={src} controls aria-label={label} style={{ width: "100%" }} />
      : <Image src={src} alt={`${label} output`} h={240} fit="contain" radius="sm" />
      : <Group h={240} justify="center"><Loader size="sm" /></Group>}
  </Paper>;
}

type RunDetailsInspectorProps = {
  detail: Detail;
  inspectorSelection: string;
  now: number;
  cancellingId: string | null;
  stopRun: (id: string) => Promise<void>;
  setInspectorSelection: (selection: string) => void;
  captionDirty: MutableRefObject<boolean>;
  setDetail: Dispatch<SetStateAction<Detail | null>>;
  updatePublication: (action: "save" | "publish" | "discard") => Promise<void>;
  downloadError: string | null;
  setDownloadError: (error: string | null) => void;
  downloadingId: string | null;
  downloadArtifact: (artifact: Artifact) => Promise<void>;
};

export function RunDetailsInspector({
  detail,
  inspectorSelection,
  now,
  cancellingId,
  stopRun,
  setInspectorSelection,
  captionDirty,
  setDetail,
  updatePublication,
  downloadError,
  setDownloadError,
  downloadingId,
  downloadArtifact,
}: RunDetailsInspectorProps) {
  return <Stack gap="sm" className="run-inspector">
    <Group className="run-inspector-summary" justify="space-between" align="center" wrap="wrap">
      <div><Text fw={600} size="sm">{detail.run.workflowSnapshotJson?.name ?? "Workflow"}</Text><Text size="xs" c="dimmed">Created {date(detail.run.createdAt)} <span aria-hidden="true">·</span> {timingLabel(detail.run.startedAt, detail.run.finishedAt, now, detail.run.status === "awaiting_publish")}</Text></div>
      <Group gap="xs"><Badge variant="light" color={statusColor(detail.run.status)}>{detail.run.status.replaceAll("_", " ")}</Badge>{active(detail.run.status) && <Button size="xs" color="hiveError" variant="light" loading={cancellingId === detail.run.id} disabled={detail.run.status === "cancel_requested"} onClick={() => void stopRun(detail.run.id)}>Stop run</Button>}</Group>
    </Group>
    {detail.run.errorSummary && <Alert color={detail.run.status === "cancelled" ? "gray" : "hiveError"} title={detail.run.status === "cancelled" ? "Run stopped" : "Run failed"}>{detail.run.errorSummary}</Alert>}
    {detail.publication && <Paper className="run-publication-strip" radius="sm" p="xs">
      <div className="run-publication-mark" aria-hidden="true">◎</div>
      <div className="run-publication-copy"><Text fw={600} size="sm">{detail.publication.mediaKind === "video" ? "Instagram Reel" : "Instagram Post"}</Text><Text size="xs" c="dimmed">{detail.publication.status === "awaiting_review" ? "Review the generated media and caption" : detail.publication.status.replaceAll("_", " ")}</Text></div>
      <Badge color={statusColor(detail.publication.status)} variant="light">{detail.publication.status.replaceAll("_", " ")}</Badge>
      <Button size="xs" variant="light" onClick={() => setInspectorSelection("publication")}>Review publication</Button>
    </Paper>}

    <div className="run-inspector-layout">
      <Paper className="run-inspector-nav" withBorder radius="sm" p="xs">
        <Group className="run-inspector-nav-heading" justify="space-between"><div><Text fw={600} size="sm">Run steps</Text><Text size="xs" c="dimmed">{detail.nodes.length} {detail.nodes.length === 1 ? "step" : "steps"}</Text></div></Group>
        <div className="run-inspector-timeline" role="list" aria-label="Run steps">
          {detail.nodes.map((node) => {
            const selected = inspectorSelection === node.nodeId;
            const label = node.nodeSnapshotJson?.name ?? node.nodeId;
            const modality = node.nodeSnapshotJson?.kind === "processing" ? "Text Overlay" : nodeTypeLabel(node.nodeSnapshotJson?.modality ?? node.nodeSnapshotJson?.kind ?? "input", node.parameters?.modelId ?? node.nodeSnapshotJson?.parameters?.modelId);
            return <button key={node.nodeId} type="button" className={`run-inspector-step${selected ? " is-selected" : ""}`} aria-current={selected ? "step" : undefined} onClick={() => setInspectorSelection(node.nodeId)}>
              <span className={`run-step-dot status-${node.status}`} aria-hidden="true" />
              <span className="run-step-copy"><strong>{label}</strong><small>{modality} · {timingLabel(node.startedAt, node.finishedAt, now)}</small></span>
              <Badge size="xs" variant="light" color={statusColor(node.status)}>{node.status.replaceAll("_", " ")}</Badge>
            </button>;
          })}
          <button type="button" className={`run-inspector-step run-inspector-output-link${inspectorSelection === "outputs" ? " is-selected" : ""}`} aria-current={inspectorSelection === "outputs" ? "step" : undefined} onClick={() => setInspectorSelection("outputs")}>
            <span className="run-step-dot output-dot" aria-hidden="true" />
            <span className="run-step-copy"><strong>Generated outputs</strong><small>{detail.artifacts.length} {detail.artifacts.length === 1 ? "file" : "files"}</small></span>
            <span className="run-step-chevron" aria-hidden="true">›</span>
          </button>
        </div>
      </Paper>

      <Paper className="run-inspector-detail" withBorder radius="sm" p="md">
        {inspectorSelection === "publication" && detail.publication ? <Stack gap="sm">
          <Group justify="space-between" align="start"><div><Text fw={600} size="sm">{detail.publication.mediaKind === "video" ? "Instagram Reel" : "Instagram Post"}</Text><Text size="xs" c="dimmed">{detail.publication.status === "awaiting_review" ? "Review before publishing" : "Publication details"}</Text></div><Badge color={statusColor(detail.publication.status)} variant="light">{detail.publication.status.replaceAll("_", " ")}</Badge></Group>
          <div className="run-inspector-publication-content">
            <ArtifactPreview className="run-inspector-preview" artifactId={detail.publication.artifactId} label="Instagram media" mediaType={detail.publication.mediaKind === "video" ? "video/mp4" : "image/jpeg"} />
            <div className="run-inspector-caption">
              {detail.publication.status === "awaiting_review" ? <>
                {detail.publication.errorSummary && <Alert color="hiveError" title="Publication needs review">{detail.publication.errorSummary} Check Instagram before retrying in case the post was accepted but the response was lost.</Alert>}
                <Textarea label="Caption" maxLength={2200} autosize minRows={3} value={detail.publication.caption} onChange={(event) => { captionDirty.current = true; const caption = event.currentTarget.value; setDetail((current) => current?.publication ? { ...current, publication: { ...current.publication, caption } } : current); }} />
                <Group justify="flex-end" gap="xs" className="run-inspector-publish-actions"><Button size="xs" color="hiveError" variant="light" onClick={() => void updatePublication("discard")}>Discard</Button><span className="run-inspector-action-spacer" /><Button size="xs" variant="default" onClick={() => void updatePublication("save")}>Save caption</Button><Button size="xs" onClick={() => void updatePublication("publish")}>Publish now</Button></Group>
                <Text size="xs" c="dimmed">Workflow generation is complete. Scheduled Jobs continue while this publication needs review.</Text>
              </> : detail.publication.status === "published" ? <Text size="sm" c="dimmed">Published successfully.</Text> : detail.publication.status === "discarded" ? <Text size="sm" c="dimmed">Publication discarded.</Text> : <Text size="sm" c="dimmed">Publication processing continues independently. Repeating Jobs can queue their next run after workflow generation finishes.</Text>}
            </div>
          </div>
        </Stack> : inspectorSelection === "outputs" ? <Stack gap="sm">
          <div><Text fw={600} size="sm">Generated outputs</Text><Text size="xs" c="dimmed">Files created by this run</Text></div>
          {downloadError && <Alert color="hiveError" onClose={() => setDownloadError(null)} withCloseButton>{downloadError}</Alert>}
          {detail.artifacts.length ? <Table className="run-inspector-output-table" withRowBorders><Table.Thead><Table.Tr><Table.Th>Output</Table.Th><Table.Th>Type</Table.Th><Table.Th>Size</Table.Th><Table.Th><span className="sr-only">Actions</span></Table.Th></Table.Tr></Table.Thead><Table.Tbody>{detail.artifacts.map((artifact) => {
            const node = detail.nodes.find((item) => item.nodeId === artifact.runNodeId);
            const label = node?.nodeSnapshotJson?.name ?? artifact.displayName;
            return <Table.Tr key={artifact.id}><Table.Td><Text size="sm" fw={600}>{label}</Text><Text size="xs" c="dimmed" lineClamp={1}>{artifact.displayName}</Text></Table.Td><Table.Td><Badge variant="light" color="gray" size="sm">{artifact.mediaType.split("/")[0]}</Badge></Table.Td><Table.Td className="inventory-nowrap">{formatFileSize(artifact.byteSize)}</Table.Td><Table.Td><Button variant="subtle" size="compact-sm" loading={downloadingId === artifact.id} onClick={() => void downloadArtifact(artifact)}>Download</Button></Table.Td></Table.Tr>;
          })}</Table.Tbody></Table> : <Text size="sm" c="dimmed">Outputs will appear here when available.</Text>}
        </Stack> : (() => {
          const node = detail.nodes.find((item) => item.nodeId === inspectorSelection);
          if (!node) return <Text size="sm" c="dimmed">Select a run step or output to inspect its details.</Text>;
          const label = node.nodeSnapshotJson?.name ?? node.nodeId;
          const artifact = node.outputJson?.artifactId ? detail.artifacts.find((item) => item.id === node.outputJson?.artifactId) : undefined;
          const mediaType = artifact?.mediaType ?? `${node.outputJson?.dataTypeId ?? "application"}/unknown`;
          return <Stack gap="sm">
            <Group justify="space-between" align="start"><div><Text fw={600} size="sm">{label}</Text><Text size="xs" c="dimmed">{node.nodeSnapshotJson?.kind === "processing" ? "Text Overlay" : nodeTypeLabel(node.nodeSnapshotJson?.modality ?? node.nodeSnapshotJson?.kind ?? "input", node.parameters?.modelId ?? node.nodeSnapshotJson?.parameters?.modelId)}</Text><Text size="xs" c="dimmed" mt={3}>{timingLabel(node.startedAt, node.finishedAt, now)}</Text></div><Badge variant="light" color={statusColor(node.status)}>{node.status.replaceAll("_", " ")}</Badge></Group>
            {node.errorSummary && <Alert color="hiveError" title="Step failed">{node.errorSummary}</Alert>}
            {node.outputJson?.text && <Paper className="run-inspector-text-output" withBorder radius="sm" p="sm"><Text size="xs" c="dimmed" mb={4}>Text output</Text><Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{node.outputJson.text}</Text></Paper>}
            {artifact && <ArtifactPreview className="run-inspector-preview" artifactId={artifact.id} label={label} mediaType={mediaType} />}
            {!artifact && !node.outputJson?.text && !node.errorSummary && <Text size="sm" c="dimmed">No output was recorded for this step.</Text>}
          </Stack>;
        })()}
      </Paper>
    </div>
  </Stack>;
}
