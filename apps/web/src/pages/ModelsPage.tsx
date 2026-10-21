import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Drawer, Group, Paper, Progress, ScrollArea, SimpleGrid, Stack, Table, Tabs, Text, Title } from "@mantine/core";
import { apiFetch } from "../apiClient";
import { PaginatedTableFooter } from "../components/PaginatedTableFooter";
import { PaginatedTableBody } from "../components/PaginatedPageSlots";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import { useFlashMessages } from "../components/FlashMessages";
import { PauseIcon, PlayIcon, TrashIcon, WorkspaceTableAction, WorkspaceTableActions } from "../components/WorkspaceTableActions";
import { formatModelSize, modelDetails, type ModelId } from "../modelCatalog";
import { useVisiblePolling } from "../hooks/useVisiblePolling";

type ModelStatus = "not_downloaded" | "downloading" | "pausing" | "paused" | "cancelling" | "removing" | "downloaded" | "failed" | "unavailable";
type ModelState = { id: ModelId; status: ModelStatus; downloadedBytes?: number; totalBytes?: number; cacheBytes?: number; error?: string; usage?: { workflowCount: number; customNodeCount: number } };
type StorageState = { knownModelBytes: number; unknownCacheBytes: number; freeBytes: number; totalBytes: number };
const PAGE_SIZE = 10;

function DownloadIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const statusLabels: Record<ModelStatus, string> = {
  not_downloaded: "Available", downloading: "Downloading", pausing: "Pausing", paused: "Paused", cancelling: "Cancelling",
  removing: "Removing cache", downloaded: "Downloaded", failed: "Download failed", unavailable: "Unavailable",
};

function statusColor(status: ModelStatus) {
  if (status === "downloaded") return "hiveSuccess";
  if (status === "failed" || status === "unavailable") return "hiveError";
  if (status === "not_downloaded") return "gray";
  if (status === "paused") return "hiveWarning";
  return "hiveSky";
}

function isDownloadActive(status: ModelStatus) {
  return status === "downloading" || status === "pausing" || status === "cancelling";
}

function errorMessage(code: string | undefined, fallback: string) {
  const messages: Record<string, string> = {
    runner_busy: "Model cache cannot be removed while the runner is generating. Try again when it is idle.",
    model_in_use: "This model is loaded for inference. Try again after the runner releases it.",
    model_download_active: "Wait for this model's download to stop before removing its cache.",
    cache_removal_failed: "Hive could not remove all of this model's cache files. Its status has been refreshed.",
    download_pausing: "The download is still pausing. Try again in a moment.",
    download_not_active: "This download is no longer active. Refreshing its status.",
  };
  return messages[code ?? ""] ?? fallback;
}

export function ModelsPage() {
  const { showFlash } = useFlashMessages();
  const [models, setModels] = useState<ModelState[]>([]);
  const [storage, setStorage] = useState<StorageState | null>(null);
  const [runnerStatus, setRunnerStatus] = useState<"ready" | "busy" | "unavailable">("unavailable");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<ModelId | null>(null);
  const [pausing, setPausing] = useState<ModelId | null>(null);
  const [resuming, setResuming] = useState<ModelId | null>(null);
  const [cancelling, setCancelling] = useState<ModelId | null>(null);
  const [removingCache, setRemovingCache] = useState(false);
  const [cacheReviewOpen, setCacheReviewOpen] = useState(false);
  const [pendingDownloadId, setPendingDownloadId] = useState<ModelId | null>(null);
  const [tab, setTab] = useState<string | null>("library");
  const [category, setCategory] = useState<"all" | "text" | "image" | "video" | "audio">("all");
  const [selectedId, setSelectedId] = useState<ModelId | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [page, setPage] = useState(1);

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch("/api/models");
      const body = await response.json() as { models?: ModelState[]; storage?: StorageState; runner?: { status?: "ready" | "busy" } };
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in to manage local models." : "The local model runner is unavailable. Start the runner and try again.");
      setModels(body.models ?? []);
      setStorage(body.storage ?? null);
      setRunnerStatus(body.runner?.status ?? "ready");
      setPageError(null);
    } catch (error) {
      setRunnerStatus("unavailable");
      setPageError(error instanceof Error ? error.message : "Could not load model status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const activeDownloads = models.filter((model) => isDownloadActive(model.status) || model.status === "paused");
  useVisiblePolling(refresh, activeDownloads.length > 0 ? 2500 : 15_000);

  const runDownload = async (id: ModelId) => {
    setRequesting(id);
    try {
      const response = await apiFetch(`/api/models/${id}/download`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = await response.json().catch(() => ({})) as { detail?: { code?: string } };
      if (!response.ok) throw new Error(errorMessage(body.detail?.code, "Could not start the model download. Try again."));
      await refresh();
    } catch (error) {
      showFlash({ tone: "error", title: "Could not start model download", message: error instanceof Error ? error.message : "Could not start the model download." });
    } finally { setRequesting(null); }
  };

  const startDownload = async (id: ModelId) => {
    const detail = modelDetails.find((item) => item.id === id);
    const safetyMarginBytes = detail ? detail.sizeBytes * 0.1 : 0;
    if (storage && detail && storage.freeBytes < detail.sizeBytes + safetyMarginBytes) {
      setPendingDownloadId(id);
      return;
    }
    await runDownload(id);
  };

  const pauseDownload = async (id: ModelId) => {
    setPausing(id);
    try {
      const response = await apiFetch(`/api/models/${id}/download/pause`, { method: "POST" });
      const body = await response.json().catch(() => ({})) as { detail?: { code?: string } };
      if (!response.ok) throw new Error(errorMessage(body.detail?.code, "Could not pause the download."));
      await refresh();
    } catch (error) {
      showFlash({ tone: "error", title: "Could not pause download", message: error instanceof Error ? error.message : "Could not pause the download." });
    } finally { setPausing(null); }
  };

  const resumeDownload = async (id: ModelId) => {
    setResuming(id);
    try {
      const response = await apiFetch(`/api/models/${id}/download/resume`, { method: "POST" });
      const body = await response.json().catch(() => ({})) as { detail?: { code?: string } };
      if (!response.ok) throw new Error(errorMessage(body.detail?.code, "Could not resume the download."));
      await refresh();
    } catch (error) {
      showFlash({ tone: "error", title: "Could not resume download", message: error instanceof Error ? error.message : "Could not resume the download." });
    } finally { setResuming(null); }
  };

  const cancelDownload = async (id: ModelId) => {
    setCancelling(id);
    try {
      const response = await apiFetch(`/api/models/${id}/download`, { method: "DELETE" });
      const body = await response.json().catch(() => ({})) as { detail?: { code?: string } };
      if (!response.ok) throw new Error(errorMessage(body.detail?.code, "Could not cancel the model download."));
      await refresh();
      showFlash({ tone: "success", title: "Download cancelled", message: "The partial model download was removed." });
    } catch (error) {
      showFlash({ tone: "error", title: "Could not cancel download", message: error instanceof Error ? error.message : "Could not cancel the model download." });
    } finally { setCancelling(null); }
  };

  const removeCache = async () => {
    if (!selectedDetail) return;
    setRemovingCache(true);
    try {
      const response = await apiFetch(`/api/models/${selectedDetail.id}/cache`, { method: "DELETE" });
      const body = await response.json().catch(() => ({})) as { detail?: { code?: string } };
      if (!response.ok) throw new Error(errorMessage(body.detail?.code, "Could not remove this model's cache."));
      setCacheReviewOpen(false);
      await refresh();
      showFlash({ tone: "success", title: "Model cache removed", message: `${selectedDetail.name} was removed from the runner cache. Workflow and Custom Node definitions remain.` });
    } catch (error) {
      showFlash({ tone: "error", title: "Could not remove model cache", message: error instanceof Error ? error.message : "Could not remove this model's cache." });
      await refresh();
    } finally { setRemovingCache(false); }
  };

  const modelCategory = (groupId: string): "text" | "image" | "video" | "audio" => {
    if (groupId === "text-to-text") return "text";
    if (groupId === "text-to-video") return "video";
    if (groupId === "text-to-audio") return "audio";
    return "image";
  };
  const filteredDetails = modelDetails.filter((detail) => {
    const status = models.find((model) => model.id === detail.id)?.status ?? "unavailable";
    const isTrackedDownload = isDownloadActive(status) || status === "paused";
    return !isTrackedDownload && (category === "all" || modelCategory(detail.groupId) === category);
  });
  const totalPages = Math.max(1, Math.ceil(filteredDetails.length / PAGE_SIZE));
  const modelPageItems = filteredDetails.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const selectedDetail = modelDetails.find((detail) => detail.id === selectedId);
  const selectedState = selectedDetail ? models.find((model) => model.id === selectedDetail.id) : undefined;
  const selectedStatus = selectedState?.status ?? "unavailable";
  const downloadInProgress = selectedStatus === "downloading" || selectedStatus === "pausing" || selectedStatus === "cancelling";
  const downloadedBytes = Math.max(0, selectedState?.downloadedBytes ?? 0);
  const progress = selectedState?.totalBytes ? Math.min(100, downloadedBytes / selectedState.totalBytes * 100) : 0;
  const downloadedCount = models.filter((model) => model.status === "downloaded").length;
  const canRemoveSelected = selectedStatus === "downloaded" && runnerStatus === "ready" && !removingCache;

  return <Stack className="workspace-page" gap="lg">
    <Group justify="space-between" align="flex-end">
      <Stack gap={3}><Title order={1}>Models</Title><Text size="sm" c="dimmed">Browse runner models and manage what is stored.</Text></Stack>
      <Group gap="sm"><Badge color={runnerStatus === "ready" ? "hiveSuccess" : runnerStatus === "busy" ? "hiveWarning" : "hiveError"} variant="light">Runner {runnerStatus === "ready" ? "ready" : runnerStatus === "busy" ? "busy" : "unavailable"}</Badge><Button variant="subtle" size="xs" onClick={() => void refresh()}>Refresh</Button></Group>
    </Group>
    {pageError && <Alert color="hiveError" title="Model status unavailable" onClose={() => setPageError(null)} withCloseButton>{pageError}</Alert>}

    <Paper className="inventory-list" withBorder radius="md">
      <Tabs value={tab} onChange={(value) => { setTab(value); setDetailOpen(false); }}>
        <Tabs.List>
          <Tabs.Tab value="library">Library</Tabs.Tab>
          <Tabs.Tab value="storage">Storage</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="library" p="md">
          <Group justify="space-between" align="flex-start"><div><Text size="sm" fw={600}>Downloads <Text span size="xs" c="dimmed">{activeDownloads.length} tracked</Text></Text><Text size="xs" c="dimmed">Downloads resume after runner restarts. Each one can be paused or cancelled.</Text></div></Group>
          {activeDownloads.length === 0 ? <Text size="sm" c="dimmed" py="md">No downloads in progress.</Text> : <Stack gap={0} mt="xs" mb="lg">
            {activeDownloads.map((model) => {
              const detail = modelDetails.find((item) => item.id === model.id);
              const modelProgress = model.totalBytes ? Math.min(100, (model.downloadedBytes ?? 0) / model.totalBytes * 100) : 0;
              return <Group key={model.id} className="model-download-row" justify="space-between" align="center" wrap="wrap" py="sm" style={{ borderBottom: "1px solid var(--mantine-color-gray-2)" }}>
                <Stack gap={2} miw={190} style={{ flex: "1 1 190px" }}><Text size="sm" fw={600}>{detail?.name ?? model.id}</Text><Text size="xs" c="dimmed">{model.status === "downloading" ? "Downloading" : statusLabels[model.status]} · {formatModelSize(model.downloadedBytes ?? 0)}{model.totalBytes ? ` / ${formatModelSize(model.totalBytes)}` : " downloaded"}</Text></Stack>
                <Progress value={modelProgress} size="sm" aria-label={`${detail?.name ?? model.id} download progress`} style={{ flex: "1 1 140px" }} />
                <Group gap="xs" wrap="nowrap" ml="auto" justify="flex-end">
                  {model.status === "downloading" && <WorkspaceTableAction label="Pause download" loading={pausing === model.id} onClick={() => void pauseDownload(model.id)}><PauseIcon /></WorkspaceTableAction>}
                  {model.status === "paused" && <WorkspaceTableAction label="Resume download" loading={resuming === model.id} onClick={() => void resumeDownload(model.id)}><PlayIcon /></WorkspaceTableAction>}
                  {model.status === "pausing" && <WorkspaceTableAction label="Pausing download" loading disabled onClick={() => {}}><PauseIcon /></WorkspaceTableAction>}
                  {model.status !== "pausing" && model.status !== "cancelling" && <WorkspaceTableAction label="Cancel download" color="hiveError" loading={cancelling === model.id} onClick={() => void cancelDownload(model.id)}><TrashIcon /></WorkspaceTableAction>}
                </Group>
              </Group>;
            })}
          </Stack>}

          <Group justify="space-between" align="center" mt={activeDownloads.length === 0 ? "lg" : 0} mb="sm"><Text fw={600}>Model library</Text><Text size="xs" c="dimmed">{downloadedCount} downloaded of {modelDetails.length}</Text></Group>
          <Tabs value={category} onChange={(value) => {
            if (value !== "all" && value !== "text" && value !== "image" && value !== "video" && value !== "audio") return;
            setCategory(value); setPage(1); setSelectedId(null); setDetailOpen(false);
          }}>
            <Tabs.List aria-label="Filter model library by type">
              <Tabs.Tab value="all">All</Tabs.Tab><Tabs.Tab value="image">Image</Tabs.Tab><Tabs.Tab value="video">Video</Tabs.Tab><Tabs.Tab value="audio">Audio</Tabs.Tab><Tabs.Tab value="text">Text</Tabs.Tab>
            </Tabs.List>
          </Tabs>
          <Paper className="inventory-list" withBorder radius="md" mt="sm">
            <Group className="inventory-toolbar" justify="space-between"><Text size="xs" c="dimmed">{filteredDetails.length} models</Text><Text size="xs" c="dimmed">Select a model to review requirements and cache details</Text></Group>
            <ScrollArea type="auto"><Table className="inventory-table model-inventory-table" highlightOnHover withRowBorders>
              <Table.Thead><Table.Tr><Table.Th>Model</Table.Th><Table.Th>Size / cache</Table.Th><Table.Th>Status</Table.Th><Table.Th><span className="sr-only">Action</span></Table.Th></Table.Tr></Table.Thead>
              <PaginatedTableBody pageSize={PAGE_SIZE} columnCount={4}>{modelPageItems.map((detail) => {
                const state = models.find((model) => model.id === detail.id);
                const status = state?.status ?? "unavailable";
                return <Table.Tr key={detail.id} className={selectedId === detail.id ? "inventory-row-selected" : undefined} tabIndex={0} aria-selected={selectedId === detail.id} onClick={() => { setSelectedId(detail.id); setDetailOpen(true); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(detail.id); setDetailOpen(true); } }}>
                  <Table.Td><Text className="inventory-row-title" fw={600} size="sm">{detail.name}</Text><Text size="xs" c="dimmed" lineClamp={1}>{detail.summary}</Text></Table.Td>
                  <Table.Td className="inventory-nowrap">{status === "downloaded" ? (state?.cacheBytes ? formatModelSize(state.cacheBytes) : "<1 MB") : `${formatModelSize(detail.sizeBytes)} est.`}</Table.Td>
                  <Table.Td><Badge color={statusColor(status)} variant="light" size="sm">{loading ? "Checking…" : statusLabels[status]}</Badge></Table.Td>
                  <Table.Td className="model-actions-cell" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><WorkspaceTableActions>
                    {status === "downloaded"
                      ? <WorkspaceTableAction label="Manage model cache" tooltip="Manage cache" color="hiveError" disabled={loading || runnerStatus !== "ready" || removingCache} loading={removingCache && selectedId === detail.id} onClick={() => { setSelectedId(detail.id); setCacheReviewOpen(true); }}><TrashIcon /></WorkspaceTableAction>
                      : status === "downloading"
                        ? <WorkspaceTableAction label="Pause download" disabled={loading || runnerStatus === "unavailable"} loading={pausing === detail.id} onClick={() => { setSelectedId(detail.id); void pauseDownload(detail.id); }}><PauseIcon /></WorkspaceTableAction>
                        : status === "removing"
                          ? <WorkspaceTableAction label="Removing model cache" loading disabled onClick={() => {}}><TrashIcon /></WorkspaceTableAction>
                        : <WorkspaceTableAction label={status === "failed" ? "Retry model download" : "Download model"} tooltip={status === "failed" ? "Retry download" : "Download"} disabled={loading || status === "unavailable" || runnerStatus === "unavailable"} loading={requesting === detail.id} onClick={() => { setSelectedId(detail.id); void startDownload(detail.id); }}><DownloadIcon /></WorkspaceTableAction>}
                  </WorkspaceTableActions></Table.Td>
                </Table.Tr>;
              })}</PaginatedTableBody>
            </Table></ScrollArea>
            <PaginatedTableFooter total={filteredDetails.length} itemName="model" page={page} pageSize={PAGE_SIZE} totalPages={totalPages} onPageChange={(nextPage) => { setPage(nextPage); setSelectedId(null); setDetailOpen(false); }} />
          </Paper>
        </Tabs.Panel>
        <Tabs.Panel value="storage" p="md">
          <Group justify="space-between" align="flex-start" mb="sm"><div><Text fw={600}>Runner storage</Text><Text size="xs" c="dimmed">Container-visible cache and filesystem usage.</Text></div><Button variant="subtle" size="xs" onClick={() => void refresh()}>Refresh</Button></Group>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            <Paper withBorder radius="sm" p="sm"><Text size="xs" c="dimmed">Known model cache</Text><Text fw={600} mt={4}>{formatModelSize(storage?.knownModelBytes ?? 0)}</Text></Paper>
            <Paper withBorder radius="sm" p="sm"><Text size="xs" c="dimmed">Free space</Text><Text fw={600} mt={4}>{storage?.freeBytes ? formatModelSize(storage.freeBytes) : "Unavailable"}</Text></Paper>
            <Paper withBorder radius="sm" p="sm"><Text size="xs" c="dimmed">Filesystem size</Text><Text fw={600} mt={4}>{storage?.totalBytes ? formatModelSize(storage.totalBytes) : "Unavailable"}</Text></Paper>
          </SimpleGrid>
          {(storage?.unknownCacheBytes ?? 0) > 0 && <Text size="xs" c="dimmed" mt="sm">{formatModelSize(storage?.unknownCacheBytes ?? 0)} of unrecognized cache files are left untouched.</Text>}
          <Group justify="space-between" align="center" mt="xl" mb="sm"><Text fw={600}>Downloaded model caches</Text><Text size="xs" c="dimmed">Review each model before removing its cache</Text></Group>
          {downloadedCount === 0 ? <Text size="sm" c="dimmed">No models are currently downloaded.</Text> : <Stack gap={0}>
            {modelDetails.filter((detail) => models.find((model) => model.id === detail.id)?.status === "downloaded").map((detail) => {
              const state = models.find((model) => model.id === detail.id);
              return <Group key={detail.id} justify="space-between" py="sm" style={{ borderBottom: "1px solid var(--mantine-color-gray-2)" }}>
                <div><Text size="sm" fw={600}>{detail.name}</Text><Text size="xs" c="dimmed">{state?.usage?.workflowCount ?? 0} workflows · {state?.usage?.customNodeCount ?? 0} Custom Nodes</Text></div>
                <Group gap="sm" wrap="nowrap"><Text size="sm">{formatModelSize(state?.cacheBytes ?? 0)}</Text><WorkspaceTableAction label="Delete model cache" tooltip="Delete model cache" color="hiveError" disabled={runnerStatus !== "ready" || removingCache} loading={removingCache && selectedId === detail.id} onClick={() => { setSelectedId(detail.id); setCacheReviewOpen(true); }}><TrashIcon /></WorkspaceTableAction></Group>
              </Group>;
            })}
          </Stack>}
        </Tabs.Panel>
      </Tabs>
    </Paper>
    {!loading && models.length === 0 && <Text size="sm" c="dimmed">Model status is not available from the runner right now.</Text>}

    <Drawer opened={detailOpen && Boolean(selectedDetail)} onClose={() => setDetailOpen(false)} position="right" title={selectedDetail?.name ?? "Model details"} size="md" transitionProps={{ transition: "slide-left", duration: 180 }}>
      {selectedDetail && <Stack gap="md">
        <div><Text size="sm">{selectedDetail.summary}</Text><Badge mt="xs" color={statusColor(selectedStatus)} variant="light">{loading ? "Checking…" : statusLabels[selectedStatus]}</Badge></div>
        <div><Text size="sm" fw={600}>Recommended system requirements</Text><Stack gap={4} mt="xs">{selectedDetail.requirements.map((requirement) => <Text key={requirement} size="sm" c="dimmed">{requirement}</Text>)}</Stack><Text size="xs" c="dimmed" mt="xs">Disk and RAM figures are Hive estimates; inference needs vary by host and runtime.</Text></div>
        {selectedStatus !== "downloaded" && <Group justify="space-between"><Text size="xs" c="dimmed">Estimated download size</Text><Text size="xs" fw={600}>{formatModelSize(selectedDetail.sizeBytes)}</Text></Group>}
        {selectedState?.status === "downloaded" && <Stack gap={0}><Group justify="space-between" className="model-usage-row"><Text size="xs" c="dimmed">Cached model files</Text><Text size="xs" fw={600}>{formatModelSize(selectedState.cacheBytes ?? 0)}</Text></Group><Group justify="space-between" className="model-usage-row"><Text size="xs" c="dimmed">Workflow references</Text><Text size="xs" fw={600}>{selectedState.usage?.workflowCount ?? 0}</Text></Group><Group justify="space-between" className="model-usage-row"><Text size="xs" c="dimmed">Custom Node references</Text><Text size="xs" fw={600}>{selectedState.usage?.customNodeCount ?? 0}</Text></Group></Stack>}
        {downloadInProgress && <Stack gap={4}><Group justify="space-between"><Text size="xs">Download progress</Text><Text size="xs" c="dimmed">{formatModelSize(downloadedBytes)}{selectedState?.totalBytes ? ` / ${formatModelSize(selectedState.totalBytes)}` : " downloaded"}</Text></Group><Progress value={progress} size="sm" /></Stack>}
        {selectedState?.error && <Alert color="hiveError" title="Download did not finish">{selectedState.error}</Alert>}
        <Group justify="space-between" className="inventory-preview-actions"><Button component="a" href={selectedDetail.source} target="_blank" rel="noreferrer" variant="subtle" px={0}>View model card</Button>
          <Group gap="xs" wrap="nowrap" justify="flex-end">
            {selectedState?.status === "downloaded" ? <WorkspaceTableAction label="Manage model cache" tooltip="Manage cache" color="hiveError" disabled={!canRemoveSelected} loading={removingCache} onClick={() => setCacheReviewOpen(true)}><TrashIcon /></WorkspaceTableAction>
              : selectedState?.status === "downloading" ? <WorkspaceTableAction label="Pause download" color="hiveWarning" loading={pausing === selectedDetail.id} onClick={() => void pauseDownload(selectedDetail.id)}><PauseIcon /></WorkspaceTableAction>
                : selectedState?.status === "paused" ? <><WorkspaceTableAction label="Cancel download" color="hiveError" loading={cancelling === selectedDetail.id} onClick={() => void cancelDownload(selectedDetail.id)}><TrashIcon /></WorkspaceTableAction><WorkspaceTableAction label="Resume download" loading={resuming === selectedDetail.id} onClick={() => void resumeDownload(selectedDetail.id)}><PlayIcon /></WorkspaceTableAction></>
                  : selectedState?.status === "pausing" || selectedState?.status === "cancelling" || selectedState?.status === "removing" ? <WorkspaceTableAction label={`${statusLabels[selectedState.status]}…`} loading disabled onClick={() => {}}><DownloadIcon /></WorkspaceTableAction>
                    : <WorkspaceTableAction label={selectedStatus === "failed" ? "Retry model download" : "Download model"} tooltip={selectedStatus === "failed" ? "Retry download" : "Download"} disabled={loading || !selectedState || selectedStatus === "unavailable" || runnerStatus === "unavailable"} loading={requesting === selectedDetail.id} onClick={() => void startDownload(selectedDetail.id)}><DownloadIcon /></WorkspaceTableAction>}
          </Group>
        </Group>
      </Stack>}
    </Drawer>

    <ConfirmActionModal opened={pendingDownloadId !== null} onClose={() => setPendingDownloadId(null)} title="Download may exceed available space" confirmLabel="Download anyway" color="hiveWarning" loading={Boolean(requesting)} onConfirm={() => { if (pendingDownloadId) void runDownload(pendingDownloadId).then(() => setPendingDownloadId(null)); }}>
      <Alert color="hiveWarning" title="The runner may run out of disk space">{pendingDownloadId && (() => { const detail = modelDetails.find((item) => item.id === pendingDownloadId); return <>This model is estimated at {formatModelSize(detail?.sizeBytes ?? 0)} and the runner filesystem has {formatModelSize(storage?.freeBytes ?? 0)} free. Hive will try the download if you continue; it may fail if the filesystem fills.</>; })()}</Alert>
      <Text size="sm" c="dimmed">Downloaded files and workflow definitions are not removed automatically when space is low.</Text>
    </ConfirmActionModal>
    <ConfirmActionModal opened={cacheReviewOpen} onClose={() => { if (!removingCache) setCacheReviewOpen(false); }} title={`Remove ${selectedDetail?.name ?? "model"} cache?`} confirmLabel="Remove model cache" loading={removingCache} disabled={!canRemoveSelected} onConfirm={() => void removeCache()}>
      <Text size="sm">This removes about {formatModelSize(selectedState?.cacheBytes ?? 0)} of downloaded model files from the runner cache.</Text>
      <Text size="sm" c="dimmed">{selectedState?.usage?.workflowCount ?? 0} workflows and {selectedState?.usage?.customNodeCount ?? 0} Custom Nodes that reference this model will remain. Their next run will require the model to be downloaded again.</Text>
      {runnerStatus === "busy" && <Alert color="hiveWarning" title="Runner is busy">Wait for inference to finish before removing model files.</Alert>}
    </ConfirmActionModal>
  </Stack>;
}
