import { useCallback, useEffect, useState } from "react";
import { ActionIcon, Alert, Badge, Button, Group, Image, Loader, Modal, Pagination, Paper, SimpleGrid, Stack, Table, Text, Title, Tooltip } from "@mantine/core";
import { API_BASE } from "../auth";

import type { AppView } from "../navigation/navigationState";

function nodeTypeLabel(modality?: string, modelId?: unknown) { return typeof modelId === "string" ? modelId : modality ?? "Input"; }
const PAGE_SIZE = 10;
type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancel_requested" | "cancelled";
type Run = { id: string; workflowId: string | null; status: RunStatus; workflowSnapshotJson: { name?: string }; errorSummary: string | null; createdAt: string; startedAt: string | null; finishedAt: string | null };
type RunNode = { nodeId: string; status: string; startedAt: string | null; finishedAt: string | null; nodeSnapshotJson: { name?: string; modality?: string; kind?: string; dataTypeId?: string; parameters?: { modelId?: string } }; parameters?: { modelId?: string }; outputJson?: { dataTypeId?: string; text?: string; artifactId?: string }; errorSummary: string | null };
type Artifact = { id: string; runNodeId: string; displayName: string; mediaType: string; byteSize: number; createdAt: string };
type PageResult = { items: Run[]; page: number; pageSize: number; total: number; totalPages: number };
type Detail = { run: Run; nodes: RunNode[]; artifacts: Artifact[] };

function date(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value)) : "—"; }
function statusColor(status: RunStatus | string) { return status === "succeeded" ? "hiveSuccess" : status === "failed" ? "hiveError" : status === "running" ? "hiveSky" : status === "queued" ? "hiveWarning" : "gray"; }
function active(status: RunStatus) { return status === "queued" || status === "running" || status === "cancel_requested"; }
function timingLabel(startedAt: string | null, finishedAt: string | null, now: number) {
  if (!startedAt) return finishedAt ? `Not started · Finished ${date(finishedAt)}` : "Waiting to start";
  const end = finishedAt ? new Date(finishedAt).getTime() : now;
  const totalSeconds = Math.floor(Math.max(0, end - new Date(startedAt).getTime()) / 1000);
  const duration = `${Math.floor(totalSeconds / 60)}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
  return finishedAt ? `${duration} · Finished ${date(finishedAt)}` : `${duration} elapsed`;
}

function ArtifactPreview({ artifactId, label, mediaType }: { artifactId: string; label: string; mediaType: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false;
    let objectUrl: string | null = null;
    setSrc(null);
    setFailed(false);
    void fetch(`${API_BASE}/api/artifacts/${artifactId}/preview`, { credentials: "include" })
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
  }, [artifactId]);

  return <Paper withBorder p="xs" aria-label={`${label} preview`}>
    {src ? mediaType.startsWith("video/")
      ? <video src={src} controls preload="metadata" aria-label={`${label} generated video`} style={{ width: "100%", maxHeight: 240 }} />
      : mediaType.startsWith("audio/") ? <audio src={src} controls aria-label={label} style={{ width: "100%" }} />
      : <Image src={src} alt={`${label} output`} h={240} fit="contain" radius="sm" />
      : <Group h={240} justify="center">{failed ? <Text size="sm" c="dimmed">Preview unavailable</Text> : <Loader size="sm" />}</Group>}
  </Paper>;
}

export function RunsPage({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const loadRuns = useCallback(async (requestedPage = page) => {
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/runs?page=${requestedPage}&pageSize=${PAGE_SIZE}`, { credentials: "include" });
      const body = await response.json() as PageResult;
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in to view runs." : "Could not load runs. Please try again.");
      setResult(body);
      if (body.totalPages > 0 && requestedPage > body.totalPages) setPage(body.totalPages);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load runs."); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { setLoading(true); void loadRuns(page); }, [loadRuns, page]);
  useEffect(() => {
    if (!result?.items.some((run) => active(run.status))) return;
    const timer = window.setInterval(() => void loadRuns(page), 3000);
    return () => window.clearInterval(timer);
  }, [loadRuns, page, result?.items]);

  useEffect(() => {
    const hasRunningWork = result?.items.some((run) => run.status === "running" || run.status === "cancel_requested")
      || detail?.run.status === "running" || detail?.run.status === "cancel_requested"
      || detail?.nodes.some((node) => node.status === "running");
    if (!hasRunningWork) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [result?.items.some((run) => run.status === "running"), detail?.run.status, detail?.nodes.some((node) => node.status === "running")]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailError(null);
    try {
      const response = await fetch(`${API_BASE}/api/runs/${id}`, { credentials: "include" });
      const body = await response.json() as Detail;
      if (!response.ok) throw new Error("Could not load run details.");
      setDetail(body);
      return active(body.run.status) || body.nodes.some((node) => node.status === "queued" || node.status === "running");
    } catch (cause) { setDetailError(cause instanceof Error ? cause.message : "Could not load run details."); return false; }
  }, []);

  const downloadArtifact = async (artifact: Artifact) => {
    setDownloadingId(artifact.id); setDownloadError(null);
    try {
      const response = await fetch(`${API_BASE}/api/artifacts/${artifact.id}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not download this output.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = artifact.displayName; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setDownloadError(cause instanceof Error ? cause.message : "Could not download this output."); }
    finally { setDownloadingId(null); }
  };

  const stopRun = async (id: string) => {
    setCancellingId(id);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/runs/${id}/cancel`, { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error(response.status === 404 ? "This run could not be found." : "Could not stop this run. Please try again.");
      await loadRuns(page);
      if (selectedId === id) await loadDetail(id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not stop this run."); }
    finally { setCancellingId(null); }
  };

  useEffect(() => {
    setDetail(null);
    if (!selectedId) return;
    let disposed = false;
    let timer: number | undefined;
    const poll = async () => {
      const shouldPoll = await loadDetail(selectedId);
      if (!disposed && shouldPoll) timer = window.setTimeout(poll, 2500);
    };
    void poll();
    return () => { disposed = true; if (timer !== undefined) window.clearTimeout(timer); };
  }, [loadDetail, selectedId]);

  const rows = result?.items.map((run) => <Table.Tr key={run.id} role="button" tabIndex={0} aria-label={`View run for ${run.workflowSnapshotJson?.name ?? "workflow"}`} onClick={() => setSelectedId(run.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(run.id); } }} style={{ cursor: "pointer" }}>
    <Table.Td><Text fw={600}>{run.workflowSnapshotJson?.name ?? "Workflow"}</Text><Text size="xs" c="dimmed" ff="monospace">{run.id.slice(0, 8)}</Text></Table.Td>
    <Table.Td><Badge variant="light" color={statusColor(run.status)}>{run.status.replaceAll("_", " ")}</Badge></Table.Td>
    <Table.Td><Text size="sm" c="dimmed">{timingLabel(run.startedAt, run.finishedAt, now)}</Text></Table.Td>
    <Table.Td><Text size="sm" c={run.errorSummary ? "hiveError.7" : "dimmed"} lineClamp={2}>{run.errorSummary ?? (active(run.status) ? "Waiting for worker…" : "—")}</Text></Table.Td>
    <Table.Td>{run.status === "running" && <Tooltip label="Stop run"><ActionIcon color="hiveError" variant="subtle" aria-label={`Stop run for ${run.workflowSnapshotJson?.name ?? "workflow"}`} loading={cancellingId === run.id} onClick={(event) => { event.stopPropagation(); void stopRun(run.id); }} onKeyDown={(event) => event.stopPropagation()}><StopIcon /></ActionIcon></Tooltip>}</Table.Td>
  </Table.Tr>);

  return <Stack className="workspace-page" gap="lg">
    <Group justify="space-between" align="end"><Stack gap={3}><Text className="page-eyebrow">Workspace</Text><Title order={1} className="page-title">Runs</Title></Stack><Group><Button variant="light" onClick={() => void loadRuns(page)}>Refresh</Button><Button onClick={() => onNavigate("workflows")}>Browse workflows</Button></Group></Group>
    {error && <Alert color="hiveError" title="Run history unavailable">{error}</Alert>}
    <Paper className="workspace-table-panel" withBorder>
      {loading ? <Group justify="center" p="xl"><Loader size="sm" /><Text size="sm" c="dimmed">Loading runs…</Text></Group>
        : result?.total === 0 ? <Stack className="workspace-empty" align="center" gap="sm"><Badge color="hiveSky" variant="light">Run history</Badge><Title order={2} size="h3">No runs yet</Title><Text c="dimmed" ta="center" maw={480}>Open a saved workflow and choose Run workflow to queue its current definition for execution.</Text><Button variant="light" onClick={() => onNavigate("workflows")}>Browse workflows</Button></Stack>
          : <><Table.ScrollContainer minWidth={900}><Table verticalSpacing="sm" highlightOnHover><Table.Thead><Table.Tr><Table.Th>Workflow</Table.Th><Table.Th>Status</Table.Th><Table.Th>Duration</Table.Th><Table.Th>Result</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{rows}</Table.Tbody></Table></Table.ScrollContainer><Group justify="space-between" px="md" py="sm" className="workspace-table-footer"><Text size="sm" c="dimmed">{result?.total ?? 0} {result?.total === 1 ? "run" : "runs"}</Text><Pagination value={page} onChange={setPage} total={result?.totalPages ?? 0} size="sm" withEdges /></Group></>}
    </Paper>
    <Modal opened={selectedId !== null} onClose={() => setSelectedId(null)} title="Run details" size="xl" centered>
      {!detail && !detailError ? <Group justify="center" p="xl"><Loader size="sm" /></Group> : detailError ? <Alert color="hiveError" title="Could not load run">{detailError}</Alert> : detail && <Stack gap="md">
        <Group justify="space-between"><div><Text fw={650}>{detail.run.workflowSnapshotJson?.name ?? "Workflow"}</Text><Text size="xs" c="dimmed">Created {date(detail.run.createdAt)}</Text><Text size="xs" c="dimmed" mt={3}>{timingLabel(detail.run.startedAt, detail.run.finishedAt, now)}</Text></div><Group><Badge variant="light" color={statusColor(detail.run.status)}>{detail.run.status.replaceAll("_", " ")}</Badge>{active(detail.run.status) && <Button color="hiveError" variant="light" loading={cancellingId === detail.run.id} disabled={detail.run.status === "cancel_requested"} onClick={() => void stopRun(detail.run.id)}>Stop run</Button>}</Group></Group>
        {detail.run.errorSummary && <Alert color={detail.run.status === "cancelled" ? "gray" : "hiveError"} title={detail.run.status === "cancelled" ? "Run stopped" : "Run failed"}>{detail.run.errorSummary}</Alert>}
        <div><Text fw={600} mb="xs">Node steps</Text>{detail.nodes.length ? <Stack gap="xs">{detail.nodes.map((node) => <Paper key={node.nodeId} withBorder p="sm"><Group justify="space-between"><div><Text size="sm" fw={600}>{node.nodeSnapshotJson?.name ?? node.nodeId}</Text><Text size="xs" c="dimmed">{nodeTypeLabel(node.nodeSnapshotJson?.modality ?? "input", node.parameters?.modelId ?? node.nodeSnapshotJson?.parameters?.modelId)}</Text><Text size="xs" c="dimmed" mt={3}>{timingLabel(node.startedAt, node.finishedAt, now)}</Text></div><Badge variant="light" color={statusColor(node.status)}>{node.status}</Badge></Group>{node.nodeSnapshotJson?.kind === "input" && node.outputJson?.text && <Text size="sm" mt="xs" style={{ whiteSpace: "pre-wrap" }}>{node.outputJson.text}</Text>}{node.nodeSnapshotJson?.kind === "input" && node.outputJson?.artifactId && <ArtifactPreview artifactId={node.outputJson.artifactId} label={node.nodeSnapshotJson.name ?? node.nodeId} mediaType={`${node.outputJson.dataTypeId}/unknown`} />}{node.errorSummary && <Text size="xs" c="hiveError.7" mt="xs">{node.errorSummary}</Text>}</Paper>)}</Stack> : <Text size="sm" c="dimmed">No node steps recorded.</Text>}</div>
        <div><Text fw={600} mb="xs">Generated outputs</Text>{downloadError && <Alert color="hiveError" mb="xs">{downloadError}</Alert>}{detail.artifacts.length ? <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">{detail.artifacts.map((artifact) => {
          const node = detail.nodes.find((item) => item.nodeId === artifact.runNodeId);
          const label = node?.nodeSnapshotJson?.name ?? artifact.displayName;
          return <Paper key={artifact.id} withBorder p="sm"><Stack gap="xs"><Group justify="space-between" align="start"><div><Text size="sm" fw={600}>{label}</Text><Text size="xs" c="dimmed">{Math.ceil(artifact.byteSize / 1024)} KB · {date(artifact.createdAt)}</Text></div><Button variant="subtle" size="compact-sm" loading={downloadingId === artifact.id} onClick={() => void downloadArtifact(artifact)}>Download</Button></Group><ArtifactPreview artifactId={artifact.id} label={label} mediaType={artifact.mediaType} /></Stack></Paper>;
        })}</SimpleGrid> : <Text size="sm" c="dimmed">Outputs will appear here when available.</Text>}</div>
      </Stack>}
    </Modal>
  </Stack>;
}

function StopIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>; }
