import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Group, Loader, Modal, Pagination, Paper, Stack, Table, Text, Title } from "@mantine/core";
import { API_BASE } from "../auth";
import { agentModalityLabel } from "../agentModality";
import type { AppView } from "../navigation/navigationState";

const PAGE_SIZE = 10;
type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancel_requested" | "cancelled";
type Run = { id: string; workflowId: string | null; status: RunStatus; workflowSnapshotJson: { name?: string }; errorSummary: string | null; createdAt: string; startedAt: string | null; finishedAt: string | null };
type RunNode = { nodeId: string; status: string; agentSnapshotJson: { name?: string; modality?: string }; errorSummary: string | null };
type Artifact = { id: string; displayName: string; mediaType: string; byteSize: number; createdAt: string };
type PageResult = { items: Run[]; page: number; pageSize: number; total: number; totalPages: number };
type Detail = { run: Run; nodes: RunNode[]; artifacts: Artifact[] };

function date(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"; }
function statusColor(status: RunStatus | string) { return status === "succeeded" ? "hiveSuccess" : status === "failed" ? "hiveError" : status === "running" ? "hiveSky" : status === "queued" ? "hiveWarning" : "gray"; }
function active(status: RunStatus) { return status === "queued" || status === "running"; }

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

  const loadDetail = useCallback(async (id: string) => {
    setDetailError(null);
    try {
      const response = await fetch(`${API_BASE}/api/runs/${id}`, { credentials: "include" });
      const body = await response.json() as Detail;
      if (!response.ok) throw new Error("Could not load run details.");
      setDetail(body);
      return active(body.run.status);
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
    <Table.Td><Text size="sm" c="dimmed">{date(run.createdAt)}</Text></Table.Td>
    <Table.Td><Text size="sm" c={run.errorSummary ? "hiveError.3" : "dimmed"} lineClamp={2}>{run.errorSummary ?? (active(run.status) ? "Waiting for worker…" : "—")}</Text></Table.Td>
  </Table.Tr>);

  return <Stack className="workspace-page" gap="lg">
    <Group justify="space-between" align="end"><Stack gap={3}><Text className="page-eyebrow">Workspace</Text><Title order={1} className="page-title">Runs</Title></Stack><Group><Button variant="light" onClick={() => void loadRuns(page)}>Refresh</Button><Button onClick={() => onNavigate("workflows")}>Browse workflows</Button></Group></Group>
    {error && <Alert color="hiveError" title="Run history unavailable">{error}</Alert>}
    <Paper className="agents-table-panel" withBorder>
      {loading ? <Group justify="center" p="xl"><Loader size="sm" /><Text size="sm" c="dimmed">Loading runs…</Text></Group>
        : result?.total === 0 ? <Stack className="agents-empty" align="center" gap="sm"><Badge color="hiveSky" variant="light">Run history</Badge><Title order={2} size="h3">No runs yet</Title><Text c="dimmed" ta="center" maw={480}>Open a saved workflow and choose Run workflow to queue its current definition for execution.</Text><Button variant="light" onClick={() => onNavigate("workflows")}>Browse workflows</Button></Stack>
          : <><Table.ScrollContainer minWidth={700}><Table verticalSpacing="sm" highlightOnHover><Table.Thead><Table.Tr><Table.Th>Workflow</Table.Th><Table.Th>Status</Table.Th><Table.Th>Started</Table.Th><Table.Th>Result</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{rows}</Table.Tbody></Table></Table.ScrollContainer><Group justify="space-between" px="md" py="sm" className="agents-table-footer"><Text size="sm" c="dimmed">{result?.total ?? 0} {result?.total === 1 ? "run" : "runs"}</Text><Pagination value={page} onChange={setPage} total={result?.totalPages ?? 0} size="sm" withEdges /></Group></>}
    </Paper>
    <Modal opened={selectedId !== null} onClose={() => setSelectedId(null)} title="Run details" size="lg" centered>
      {!detail && !detailError ? <Group justify="center" p="xl"><Loader size="sm" /></Group> : detailError ? <Alert color="hiveError" title="Could not load run">{detailError}</Alert> : detail && <Stack gap="md">
        <Group justify="space-between"><div><Text fw={650}>{detail.run.workflowSnapshotJson?.name ?? "Workflow"}</Text><Text size="xs" c="dimmed">Created {date(detail.run.createdAt)}</Text></div><Badge variant="light" color={statusColor(detail.run.status)}>{detail.run.status.replaceAll("_", " ")}</Badge></Group>
        {detail.run.errorSummary && <Alert color="hiveError" title="Run failed">{detail.run.errorSummary}</Alert>}
        <div><Text fw={600} mb="xs">Agent steps</Text>{detail.nodes.length ? <Stack gap="xs">{detail.nodes.map((node) => <Paper key={node.nodeId} withBorder p="sm"><Group justify="space-between"><div><Text size="sm" fw={600}>{node.agentSnapshotJson?.name ?? node.nodeId}</Text><Text size="xs" c="dimmed">{agentModalityLabel(node.agentSnapshotJson?.modality ?? "agent")}</Text></div><Badge variant="light" color={statusColor(node.status)}>{node.status}</Badge></Group>{node.errorSummary && <Text size="xs" c="hiveError.3" mt="xs">{node.errorSummary}</Text>}</Paper>)}</Stack> : <Text size="sm" c="dimmed">No agent steps recorded.</Text>}</div>
        <div><Text fw={600} mb="xs">Generated outputs</Text>{downloadError && <Alert color="hiveError" mb="xs">{downloadError}</Alert>}{detail.artifacts.length ? <Stack gap="xs">{detail.artifacts.map((artifact) => <Group key={artifact.id} justify="space-between"><div><Text size="sm">{artifact.displayName}</Text><Text size="xs" c="dimmed">{Math.ceil(artifact.byteSize / 1024)} KB · {date(artifact.createdAt)}</Text></div><Button variant="subtle" size="compact-sm" loading={downloadingId === artifact.id} onClick={() => void downloadArtifact(artifact)}>Download</Button></Group>)}</Stack> : <Text size="sm" c="dimmed">Outputs will appear here when available.</Text>}</div>
      </Stack>}
    </Modal>
  </Stack>;
}
