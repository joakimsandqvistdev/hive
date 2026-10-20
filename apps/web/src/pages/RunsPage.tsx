import { useCallback, useEffect, useRef, useState } from "react";
import { ActionIcon, Alert, Badge, Button, Group, Loader, Modal, MultiSelect, Paper, Popover, Stack, Table, Text, Title, Tooltip } from "@mantine/core";
import { apiFetch, apiUrl } from "../apiClient";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import { PaginatedTableFooter } from "../components/PaginatedTableFooter";
import { formatFileSize } from "../formatters";
import { RunDetailsInspector } from "../components/RunDetailsInspector";
import { RunComparisonPage } from "./RunComparisonPage";
import { active, date, statusColor, timingLabel } from "../runFormatting";
import type { Artifact, Detail, PageResult, Run, RunnerStatus } from "../runTypes";
import { useFlashMessages } from "../components/FlashMessages";
import { useAppBreadcrumb } from "../components/AppBreadcrumbs";
import { useVisiblePolling } from "../hooks/useVisiblePolling";
import { notifyNavigationSummaryChanged } from "../navigation/navigationSummary";

import type { AppView } from "../navigation/navigationState";

const PAGE_SIZE = 10;

function runIdFromHash() {
  return window.location.hash.match(/^#runs\/([0-9a-f-]+)$/i)?.[1] ?? null;
}
function isRunComparisonRoute() { return /^#runs\/compare(?:\?|$)/i.test(window.location.hash); }
function comparisonBaselineFromHash() { return new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("baseline") ?? ""; }

export function RunsPage({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const { showFlash } = useFlashMessages();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(runIdFromHash);
  const [detail, setDetail] = useState<Detail | null>(null);
  const navigateToRuns = useCallback(() => { setSelectedId(null); if (runIdFromHash()) window.location.hash = "runs"; }, []);
  useAppBreadcrumb(selectedId && detail ? { parentView: "runs", currentLabel: "Run details", onParentNavigate: navigateToRuns } : null);
  const [inspectorSelection, setInspectorSelection] = useState("publication");
  const captionDirty = useRef(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Run | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryingDeletionId, setRetryingDeletionId] = useState<string | null>(null);
  const [bulkSelectorOpen, setBulkSelectorOpen] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkStatuses, setBulkStatuses] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [runnerStatus, setRunnerStatus] = useState<RunnerStatus>("active");
  const [runnerHasActiveRuns, setRunnerHasActiveRuns] = useState(false);
  const [runnerBusy, setRunnerBusy] = useState(false);
  const [comparisonRoute, setComparisonRoute] = useState(isRunComparisonRoute);

  const loadRunnerControl = useCallback(async () => {
    try {
      const response = await apiFetch("/api/runs/runner-control");
      if (!response.ok) return;
      const body = await response.json() as { runnerStatus: RunnerStatus; queuedRuns: number; runningRuns: number };
      setRunnerStatus(body.runnerStatus);
      setRunnerHasActiveRuns(body.queuedRuns + body.runningRuns > 0);
    } catch { /* Keep the last known runner state if the API is temporarily unavailable. */ }
  }, []);
  useEffect(() => { void loadRunnerControl(); }, [loadRunnerControl]);
  useVisiblePolling(loadRunnerControl, 15_000);

  const toggleRunner = async () => {
    setRunnerBusy(true);
    try {
      const status = runnerStatus === "active" ? "paused" : "active";
      const response = await apiFetch("/api/runs/runner-control", {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }),
      });
      const body = await response.json().catch(() => ({})) as { runnerStatus?: RunnerStatus };
      if (!response.ok || !body.runnerStatus) throw new Error("Could not update your runner state.");
      setRunnerStatus(body.runnerStatus);
      notifyNavigationSummaryChanged();
      showFlash(body.runnerStatus === "pausing"
        ? { tone: "neutral", title: "Pausing after the current run", message: "Your queued runs will wait until you resume the runner." }
        : body.runnerStatus === "paused"
          ? { tone: "success", title: "Your runner is paused", message: "Your queued runs will wait until you resume the runner." }
          : { tone: "success", title: "Your runner is active", message: "Queued runs can start again." });
    } catch (cause) {
      showFlash({ tone: "error", title: "Runner state unchanged", message: cause instanceof Error ? cause.message : "Could not update your runner state." });
    } finally { setRunnerBusy(false); }
  };

  const loadRuns = useCallback(async (requestedPage = page) => {
    setError(null);
    try {
      const response = await apiFetch(`/api/runs?page=${requestedPage}&pageSize=${PAGE_SIZE}`);
      const body = await response.json() as PageResult;
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in to view runs." : "Could not load runs. Please try again.");
      setResult(body);
      if (body.totalPages > 0 && requestedPage > body.totalPages) setPage(body.totalPages);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load runs."); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { setLoading(true); void loadRuns(page); }, [loadRuns, page]);
  useEffect(() => {
    const syncSelectedRun = () => setSelectedId(runIdFromHash());
    const syncComparisonRoute = () => setComparisonRoute(isRunComparisonRoute());
    window.addEventListener("hashchange", syncSelectedRun);
    window.addEventListener("hashchange", syncComparisonRoute);
    return () => { window.removeEventListener("hashchange", syncSelectedRun); window.removeEventListener("hashchange", syncComparisonRoute); };
  }, []);
  const needsRunPolling = runnerHasActiveRuns || Boolean(result?.items.some((run) => active(run.status) || run.deletion));
  useVisiblePolling(() => loadRuns(page), needsRunPolling ? 3000 : 15_000);

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
      const response = await apiFetch(`/api/runs/${id}`);
      const body = await response.json() as Detail;
      if (!response.ok) throw new Error("Could not load run details.");
      setDetail((current) => {
        const previous = current?.publication;
        const incoming = body.publication;
        if (captionDirty.current && previous && incoming && previous.id === incoming.id &&
            previous.status === "awaiting_review" && incoming.status === "awaiting_review") {
          if (previous.caption === incoming.caption) captionDirty.current = false;
          else return { ...body, publication: { ...incoming, caption: previous.caption } };
        } else if (!incoming || !previous || previous.id !== incoming.id || incoming.status !== "awaiting_review") {
          captionDirty.current = false;
        }
        return body;
      });
      return active(body.run.status) || body.run.status === "awaiting_publish" || body.nodes.some((node) => node.status === "queued" || node.status === "running");
    } catch (cause) { setDetailError(cause instanceof Error ? cause.message : "Could not load run details."); return false; }
  }, []);

  const downloadArtifact = async (artifact: Artifact) => {
    setDownloadingId(artifact.id); setDownloadError(null);
    try {
      const response = await apiFetch(`/api/artifacts/${artifact.id}`);
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
    try {
      const response = await apiFetch(`/api/runs/${id}/cancel`, { method: "POST" });
      if (!response.ok) throw new Error(response.status === 404 ? "This run could not be found." : "Could not stop this run. Please try again.");
      notifyNavigationSummaryChanged();
      await loadRuns(page);
      if (selectedId === id) await loadDetail(id);
      showFlash({ tone: "neutral", title: "Cancellation requested", message: "The run will stop when its worker processes the request." });
    } catch (cause) { showFlash({ tone: "error", title: "Could not stop run", message: cause instanceof Error ? cause.message : "Could not stop this run." }); }
    finally { setCancellingId(null); }
  };

  const deleteRun = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeletingId(target.id);
    try {
      const response = await apiFetch("/api/runs/" + target.id, { method: "DELETE" });
        const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        if (response.status === 409 && body.error === "publication_in_progress") throw new Error("Instagram is currently publishing this run. Wait until publishing finishes or the publication needs review, then delete the run.");
        if (response.status === 409 && body.error === "profile_asset_in_use") throw new Error("This run's generated image is selected as an Instagram profile photo. Change the profile photo before deleting the run.");
        throw new Error(response.status === 409 ? "This run is still active. Stop it before deleting." : response.status === 404 ? "This run could not be found." : "Could not delete this run. Please try again.");
      }
      setDeleteTarget(null);
      if (selectedId === target.id) setSelectedId(null);
      await loadRuns(page);
      showFlash({ tone: "success", title: "Run deletion queued", message: `Cleanup for “${target.workflowSnapshotJson?.name ?? "Workflow"}” has been queued.` });
    } catch (cause) { showFlash({ tone: "error", title: "Could not delete run", message: cause instanceof Error ? cause.message : "Could not delete this run." }); }
    finally { setDeletingId(null); }
  };

  const retryDeletion = async (id: string) => {
    setRetryingDeletionId(id);
    try {
      const response = await apiFetch("/api/runs/" + id + "/delete/retry", { method: "POST" });
      if (!response.ok) throw new Error(response.status === 409 ? "Cleanup is already running. Please wait." : "Could not retry cleanup. Please try again.");
      notifyNavigationSummaryChanged();
      await loadRuns(page);
      showFlash({ tone: "neutral", title: "Cleanup retry queued", message: "Hive will retry removing the run and its unsaved generated media." });
    } catch (cause) { showFlash({ tone: "error", title: "Could not retry cleanup", message: cause instanceof Error ? cause.message : "Could not retry cleanup." }); }
    finally { setRetryingDeletionId(null); }
  };

  const deleteRunsByStatus = async () => {
    if (!bulkStatuses.length) return;
    setBulkDeleting(true);
    try {
      const response = await apiFetch("/api/runs/bulk-delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ statuses: bulkStatuses }) });
      const body = await response.json().catch(() => ({})) as { queued_count?: number; skipped_profile_count?: number; skipped_publication_count?: number; already_deleting_count?: number };
      if (!response.ok) throw new Error("Could not queue the selected runs for deletion.");
      const parts = [`${body.queued_count ?? 0} ${body.queued_count === 1 ? "run" : "runs"} queued for deletion`];
      if (body.already_deleting_count) parts.push(`${body.already_deleting_count} already being removed`);
      if (body.skipped_profile_count) parts.push(`${body.skipped_profile_count} skipped because a run image is in use as an Instagram profile photo`);
      if (body.skipped_publication_count) parts.push(`${body.skipped_publication_count} skipped because Instagram is currently publishing`);
      showFlash({ tone: body.skipped_profile_count || body.skipped_publication_count ? "warning" : "success", title: "Bulk deletion", message: `${parts.join(" · ")}.` });
      setBulkConfirmOpen(false); setBulkSelectorOpen(false); setBulkStatuses([]);
      await loadRuns(page);
    } catch (cause) { showFlash({ tone: "error", title: "Could not delete runs", message: cause instanceof Error ? cause.message : "Could not delete the selected runs." }); }
    finally { setBulkDeleting(false); }
  };

  const updatePublication = async (action: "save" | "publish" | "discard") => {
    const publication = detail?.publication;
    if (!publication) return;
    try {
      if (action === "save") {
        const response = await apiFetch(`/api/instagram/publications/${publication.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ caption: publication.caption }) });
        if (!response.ok) throw new Error("Could not save the caption.");
      } else {
          if (action === "publish") {
            const captionResponse = await apiFetch(`/api/instagram/publications/${publication.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ caption: publication.caption }) });
            if (!captionResponse.ok) throw new Error("Could not save the edited caption.");
          }
        const response = await apiFetch(`/api/instagram/publications/${publication.id}/${action}`, { method: "POST" });
        if (!response.ok) throw new Error(action === "publish" ? "Could not queue this publication." : "Could not discard this publication.");
      }
      await loadDetail(detail.run.id); await loadRuns(page);
    } catch (cause) { setDetailError(cause instanceof Error ? cause.message : "Could not update publication."); }
  };

  const openComparison = (baselineId: string) => { window.location.hash = `runs/compare?baseline=${encodeURIComponent(baselineId)}`; };

  useEffect(() => {
    setDetail(null);
    setInspectorSelection("publication");
    captionDirty.current = false;
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

  useEffect(() => {
    if (!detail) return;
    setInspectorSelection(detail.publication ? "publication" : detail.nodes[0]?.nodeId ?? "outputs");
  }, [detail?.run.id]);

  const rows = result?.items.map((run) => <Table.Tr key={run.id} role="button" tabIndex={0} aria-label={`View run for ${run.workflowSnapshotJson?.name ?? "workflow"}`} onClick={() => setSelectedId(run.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(run.id); } }} style={{ cursor: "pointer" }}>
    <Table.Td><Group gap="xs" wrap="nowrap"><Text className="inventory-row-title" fw={600} size="sm">{run.workflowSnapshotJson?.name ?? "Workflow"}</Text>{run.jobId && <Badge size="xs" color="hiveSky" variant="light">Job</Badge>}{run.triggerName && <Badge size="xs" color="hiveSky" variant="light">{run.triggerName}</Badge>}</Group><Text size="xs" c="dimmed" ff="monospace">{run.id.slice(0, 8)}{run.scheduledFor ? " · Scheduled " + date(run.scheduledFor) : ""}</Text></Table.Td>
    <Table.Td><Badge variant="light" color={statusColor(run.status)}>{run.status.replaceAll("_", " ")}</Badge></Table.Td>
    <Table.Td><Text size="sm" c="dimmed">{timingLabel(run.startedAt, run.finishedAt, now, run.status === "awaiting_publish")}</Text></Table.Td>
    <Table.Td><Text size="sm" c={run.errorSummary ? "hiveError.7" : "dimmed"} lineClamp={2}>{run.errorSummary ?? (active(run.status) ? "Waiting for worker…" : "—")}</Text></Table.Td>
    <Table.Td><Group gap={4} justify="flex-end" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <Button variant="subtle" size="compact-sm" aria-label={`Compare ${run.workflowSnapshotJson?.name ?? "run"} with another run`} disabled={Boolean(run.deletion)} onClick={() => openComparison(run.id)}>Compare</Button>
      {run.status === "running" && <Tooltip label="Stop"><ActionIcon color="hiveError" variant="subtle" aria-label="Stop" loading={cancellingId === run.id} onClick={() => void stopRun(run.id)}><StopIcon /></ActionIcon></Tooltip>}
      {run.deletion ? run.deletion.lastError
        ? <Tooltip label="Retry cleanup"><ActionIcon color="hiveError" variant="subtle" aria-label="Retry cleanup" loading={retryingDeletionId === run.id} onClick={() => void retryDeletion(run.id)}><RetryIcon /></ActionIcon></Tooltip>
        : <Badge color="hiveSky" variant="light">Removing…</Badge>
        : <Tooltip label={run.status === "queued" ? "Cancel and delete queued run" : run.status === "awaiting_publish" ? "Delete run and discard its pending publication" : active(run.status) ? "Stop the run before deleting it" : "Delete run and generated media"}><ActionIcon color="hiveError" variant="subtle" aria-label="Delete" disabled={active(run.status) && run.status !== "queued"} loading={deletingId === run.id} onClick={() => setDeleteTarget(run)}><TrashIcon /></ActionIcon></Tooltip>}
    </Group></Table.Td>
  </Table.Tr>);

  if (comparisonRoute) return <RunComparisonPage initialBaseline={comparisonBaselineFromHash()} onBack={() => { window.location.hash = "runs"; }} />;

  return <Stack className="workspace-page" gap="lg">
    <Group justify="space-between" className="page-header-actions"><Group gap="xs"><Badge color={runnerStatus === "active" ? "hiveSuccess" : runnerStatus === "pausing" ? "hiveWarning" : "gray"} variant="light">{runnerStatus === "active" ? "Runner active" : runnerStatus === "pausing" ? "Pausing after current run" : "Runner paused"}</Badge><Text size="xs" c="dimmed">Only affects your queued runs</Text></Group><Group><Button className="page-header-button" data-header-tone={runnerStatus === "active" ? "neutral" : "primary"} variant="default" loading={runnerBusy} onClick={() => void toggleRunner()}>{runnerStatus === "active" ? "Pause my runs" : "Resume my runs"}</Button><Popover opened={bulkSelectorOpen} onChange={setBulkSelectorOpen} position="bottom-end" withArrow shadow="md"><Popover.Target><Button className="page-header-button" data-header-tone="danger" variant="default" aria-expanded={bulkSelectorOpen} rightSection={<svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" style={{ transition: "transform 150ms ease", transform: bulkSelectorOpen ? "rotate(180deg)" : undefined }}><path d="m3 6 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>} onClick={() => setBulkSelectorOpen((opened) => !opened)}>Delete runs</Button></Popover.Target><Popover.Dropdown w={520} style={{ maxWidth: "calc(100vw - 2rem)" }}><Stack gap="sm"><Group align="flex-end" wrap="nowrap"><MultiSelect classNames={{ pillsList: "run-status-pills-list" }} style={{ flex: 1, minWidth: 0 }} label="Run statuses" placeholder="Choose statuses" data={[{ value: "queued", label: "Queued" }, { value: "failed", label: "Failed" }, { value: "succeeded", label: "Succeeded" }, { value: "cancelled", label: "Cancelled" }, { value: "awaiting_publish", label: "Awaiting publish" }]} value={bulkStatuses} onChange={setBulkStatuses} searchable={false} clearable comboboxProps={{ withinPortal: false }} /><Button color="hiveError" variant="light" disabled={!bulkStatuses.length} onClick={() => { setBulkSelectorOpen(false); setBulkConfirmOpen(true); }}>Review deletion</Button></Group><Text size="xs" c="dimmed">Queued runs are cancelled before cleanup. Pending publications are discarded; runs currently publishing to Instagram are skipped. Running and profile-photo runs remain excluded.</Text></Stack></Popover.Dropdown></Popover><Button className="page-header-button" data-header-tone="neutral" variant="default" onClick={() => onNavigate("workflows")}>Browse workflows</Button></Group></Group>
    {error && <Alert color="hiveError" title="Run history unavailable">{error}</Alert>}
    <Paper className="inventory-list workspace-table-panel" withBorder radius="md">
      {loading ? <Group justify="center" p="xl"><Loader size="sm" /><Text size="sm" c="dimmed">Loading runs…</Text></Group>
        : result?.total === 0 ? <Stack className="workspace-empty" align="center" gap="sm"><Badge color="hiveSky" variant="light">Run history</Badge><Title order={2} size="h3">No runs yet</Title><Text c="dimmed" ta="center" maw={480}>Open a saved workflow and choose Run workflow to queue its current definition for execution.</Text><Button variant="light" onClick={() => onNavigate("workflows")}>Browse workflows</Button></Stack>
          : <><Table.ScrollContainer minWidth={900}><Table className="inventory-table run-inventory-table" highlightOnHover withRowBorders><Table.Thead><Table.Tr><Table.Th>Workflow</Table.Th><Table.Th>Status</Table.Th><Table.Th>Duration</Table.Th><Table.Th>Result</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{rows}</Table.Tbody></Table></Table.ScrollContainer><PaginatedTableFooter total={result?.total ?? 0} itemName="run" page={page} totalPages={result?.totalPages ?? 0} onPageChange={setPage} /></>}
    </Paper>
    <ConfirmActionModal opened={deleteTarget !== null} onClose={() => { if (!deletingId) setDeleteTarget(null); }} title="Delete run?" confirmLabel="Delete run" loading={deletingId !== null} onConfirm={() => void deleteRun()}>
      <Text>{deleteTarget?.status === "queued" ? <>Cancel and delete the queued run for <strong>{deleteTarget.workflowSnapshotJson?.name ?? "Workflow"}</strong>?</> : <>Delete the run for <strong>{deleteTarget?.workflowSnapshotJson?.name ?? "Workflow"}</strong>?</>}{deleteTarget?.status === "awaiting_publish" && <> Any pending Instagram publication will be discarded.</>} Its run history and generated media that has not been saved to the Media Library will be removed. Media saved to the library is kept. Uploaded input files are removed only when no workflow or other run still uses them.</Text>
    </ConfirmActionModal>
    <ConfirmActionModal opened={bulkConfirmOpen} onClose={() => { if (!bulkDeleting) setBulkConfirmOpen(false); }} title="Delete matching runs?" confirmLabel="Delete matching runs" loading={bulkDeleting} onConfirm={() => void deleteRunsByStatus()}>
      <Text>This will queue matching <strong>{bulkStatuses.map((status) => status === "awaiting_publish" ? "Awaiting publish" : status[0]?.toUpperCase() + status.slice(1)).join(", ")}</strong> runs across all Runs pages for deletion, including generated media not saved to the Media Library. Saved library media is kept. Queued runs are cancelled atomically before cleanup. Any pending Instagram publication for an awaiting-publication run will be discarded. Running, currently publishing, and profile-photo runs will be skipped.</Text>
    </ConfirmActionModal>
    <Modal
      opened={selectedId !== null}
      onClose={() => {
        setSelectedId(null);
        if (runIdFromHash()) window.location.hash = "runs";
      }}
      title="Run details"
      size={1100}
      centered
      classNames={{ content: "run-details-modal", body: "run-details-modal-body" }}
    >
      {!detail && !detailError ? <Group justify="center" p="xl"><Loader size="sm" /></Group>
        : detailError ? <Alert color="hiveError" title="Could not load run">{detailError}</Alert>
          : detail && <RunDetailsInspector
            detail={detail}
            onCompare={openComparison}
            inspectorSelection={inspectorSelection}
            now={now}
            cancellingId={cancellingId}
            stopRun={stopRun}
            setInspectorSelection={setInspectorSelection}
            captionDirty={captionDirty}
            setDetail={setDetail}
            updatePublication={updatePublication}
            downloadError={downloadError}
            setDownloadError={setDownloadError}
            downloadingId={downloadingId}
            downloadArtifact={downloadArtifact}
          />}
    </Modal>
  </Stack>;
}


function TrashIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>; }
function RetryIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.5-2L20 12"/><path d="M18.4 15a7 7 0 0 1-11.5 2L4 12"/></svg>; }
function StopIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>; }
