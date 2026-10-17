import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Checkbox, FileInput, Group, Image, Loader, Paper, Select, Stack, Table, Tabs, Text, TextInput, Title } from "@mantine/core";
import { apiFetch, apiUrl } from "../apiClient";
import { formatFileSize } from "../formatters";
import { useFlashMessages } from "../components/FlashMessages";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import { PaginatedTableFooter } from "../components/PaginatedTableFooter";
import { useVisiblePolling } from "../hooks/useVisiblePolling";

type AvailabilityState = "protected" | "retained" | "eligible";
type Media = { id: string; displayName: string; dataTypeId: string; mediaType: string; byteSize: number; createdAt: string; runId: string | null; savedToLibrary: boolean; workflowNames?: string[]; nodeNames?: string[]; webhookNames?: string[]; protectedBy?: string[]; availabilityState?: AvailabilityState; availabilityReason?: string; evaluatedAt?: string };
type MediaFilter = "all" | "image" | "audio" | "video";
type MediaSaveFilter = "all" | "saved" | "not-saved";
type Summary = { total_bytes: number; total_count: number; saved_bytes: number; saved_count: number; run_output_bytes: number; run_output_count: number; workflow_upload_bytes: number; workflow_upload_count: number; protected_bytes: number; protected_count: number; evaluated_at: string };
type CleanupPreview = { items: Array<Media & { eligible: boolean; availabilityState: AvailabilityState; availabilityReason: string; eligibleAfter: string | null }>; evaluatedAt: string; eligibleCount: number; protectedCount: number; retainedCount: number; estimatedBytes: number };
const PAGE_SIZE = 10;

function Preview({ item }: { item: Media }) {
  const url = apiUrl(`/api/artifacts/${item.id}/preview`);
  return item.mediaType.startsWith("image/") ? <Image className="media-detail-preview" src={url} alt={item.displayName} fit="contain" />
    : item.mediaType.startsWith("video/") ? <video className="media-detail-video" src={url} controls playsInline crossOrigin="use-credentials" preload="metadata" />
      : <audio className="media-detail-audio" src={url} controls />;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function mediaAge(value: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  return days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`;
}

function mediaKind(item: Media) {
  if (item.mediaType.startsWith("image/")) return "Image";
  if (item.mediaType.startsWith("audio/")) return "Audio";
  if (item.mediaType.startsWith("video/")) return "Video";
  return item.dataTypeId;
}

function availabilityLabel(state: AvailabilityState | undefined) {
  return state === "protected" ? "Protected" : state === "eligible" ? "Eligible" : "Retained";
}

function availabilityColor(state: AvailabilityState | undefined) {
  return state === "protected" ? "hiveWarning" : state === "eligible" ? "hiveSuccess" : "gray";
}

function checkedTime(value: string | undefined) {
  return value ? new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(value)) : "—";
}

function inferUploadType(file: File): "image" | "audio" | "video" | null {
  const mime = file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (["image/png", "image/jpeg", "image/webp"].includes(mime) || ["png", "jpg", "jpeg", "webp"].includes(extension ?? "")) return "image";
  if (["audio/wav", "audio/x-wav", "audio/mpeg", "audio/ogg", "audio/flac"].includes(mime) || ["wav", "mp3", "ogg", "flac"].includes(extension ?? "")) return "audio";
  if (mime === "video/mp4" || extension === "mp4") return "video";
  return null;
}

function uploadTypeLabel(type: "image" | "audio" | "video") {
  return type[0]!.toUpperCase() + type.slice(1);
}

export function MediaLibraryPage() {
  const { showFlash } = useFlashMessages();
  const [items, setItems] = useState<Media[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [protectedItems, setProtectedItems] = useState<Media[]>([]);
  const [protectedTotal, setProtectedTotal] = useState(0);
  const [protectedPage, setProtectedPage] = useState(1);
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [saveFilter, setSaveFilter] = useState<MediaSaveFilter>("all");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<string | null>("library");
  const [scopes, setScopes] = useState<string[]>(["old-run-outputs", "orphaned-workflow-uploads"]);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [cleanupJob, setCleanupJob] = useState<{ id: string; status: string; outcomes: Array<{ status: string; count: number; bytes: number }> } | null>(null);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Media | null>(null);
  const lastRefreshError = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), search, type: filter, saveState: saveFilter });
      const [response, summaryResponse, protectedResponse] = await Promise.all([apiFetch(`/api/artifacts?${params}`), apiFetch("/api/artifacts/storage-summary"), apiFetch(`/api/artifacts/storage-protected?page=${protectedPage}&pageSize=10`)]);
      if (!response.ok) throw new Error("Could not load media.");
      if (!summaryResponse.ok) throw new Error("Could not load storage summary.");
      if (!protectedResponse.ok) throw new Error("Could not load protected media.");
      const body = await response.json() as { items: Media[]; total: number };
      setItems(body.items);
      setTotal(body.total);
      setSummary(await summaryResponse.json() as Summary);
      const protectedBody = await protectedResponse.json() as { items: Media[]; total: number };
      setProtectedItems(protectedBody.items);
      setProtectedTotal(protectedBody.total);
      setSelectedId((current) => body.items.some((item) => item.id === current) ? current : body.items[0]?.id ?? null);
      lastRefreshError.current = null;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not load media.";
      if (lastRefreshError.current !== message) showFlash({ tone: "error", title: "Media library unavailable", message });
      lastRefreshError.current = message;
    } finally {
      setLoading(false);
    }
  }, [filter, page, protectedPage, saveFilter, search, showFlash]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (tab === "storage") void refresh(); }, [tab, refresh]);
  useVisiblePolling(refresh, tab === "storage" ? 5000 : 15_000);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageItems = items;
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const selectedItem = pageItems.find((item) => item.id === selectedId) ?? pageItems[0] ?? null;
  const mediaReferenceGroups = selectedItem ? [
    { label: "Workflow", names: selectedItem.workflowNames ?? [] },
    { label: "Node", names: selectedItem.nodeNames ?? [] },
    { label: "Webhook", names: selectedItem.webhookNames ?? [] },
  ].filter((group) => group.names.length > 0) : [];

  async function loadCleanupPreview(): Promise<CleanupPreview> {
    const params = new URLSearchParams({ scopes: scopes.join(",") });
    const response = await apiFetch(`/api/artifacts/cleanup/preview?${params}`);
    if (!response.ok) throw new Error("Could not preview cleanup.");
    const body = await response.json() as CleanupPreview;
    setPreview(body);
    return body;
  }
  async function reviewCleanup() {
    setPreviewLoading(true);
    try {
      await loadCleanupPreview();
      setConfirmCleanup(true);
    } catch (cause) {
      showFlash({ tone: "error", title: "Could not refresh cleanup eligibility", message: cause instanceof Error ? cause.message : "Could not refresh cleanup eligibility." });
    } finally { setPreviewLoading(false); }
  }
  async function previewCleanup() {
    setPreviewLoading(true);
    try { await loadCleanupPreview(); }
    catch (cause) { showFlash({ tone: "error", title: "Could not preview cleanup", message: cause instanceof Error ? cause.message : "Could not preview cleanup." }); }
    finally { setPreviewLoading(false); }
  }
  async function queueCleanup() {
    if (!preview) return;
    const response = await apiFetch("/api/artifacts/cleanup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scopes, artifactIds: preview.items.filter((item) => item.eligible).map((item) => item.id) }) });
    const body = await response.json() as { jobId?: string; error?: string };
    if (response.status === 409 && body.error === "cleanup_selection_stale") {
      setConfirmCleanup(false);
      await loadCleanupPreview();
      throw new Error("Storage references changed. Review the refreshed status before confirming cleanup.");
    }
    if (!response.ok || !body.jobId) throw new Error(body.error ?? "Could not start cleanup.");
    setConfirmCleanup(false);
    setPreview(null);
    setCleanupJob({ id: body.jobId, status: "queued", outcomes: [] });
    await refresh();
  }
  useEffect(() => {
    if (!cleanupJob || !["queued", "running"].includes(cleanupJob.status)) return;
    const timer = setInterval(async () => {
      const response = await apiFetch(`/api/artifacts/cleanup/${cleanupJob.id}`);
      if (response.ok) {
        const body = await response.json() as { job: { id: string; status: string }; outcomes: Array<{ status: string; count: number; bytes: number }> };
        setCleanupJob({ ...body.job, outcomes: body.outcomes });
        if (!["queued", "running"].includes(body.job.status)) void refresh();
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [cleanupJob?.id, cleanupJob?.status]);

  async function upload() {
    if (!file) return;
    const type = inferUploadType(file);
    if (!type) return;
    setBusyId("upload");
    const uploadedName = file.name;
    try {
      const response = await apiFetch(`/api/artifacts/upload?scope=library&dataTypeId=${type}&name=${encodeURIComponent(file.name)}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file });
      const body = await response.json() as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Could not upload media.");
      setFile(null);
      await refresh();
      showFlash({ tone: "success", title: "Media uploaded", message: `“${uploadedName}” was added to your library.` });
    } catch (cause) {
      showFlash({ tone: "error", title: "Could not upload media", message: cause instanceof Error ? cause.message : "Could not upload media." });
    } finally {
      setBusyId(null);
    }
  }

  async function perform(id: string, action: "save-to-library" | "delete"): Promise<boolean> {
    setBusyId(id);
    const itemName = items.find((item) => item.id === id)?.displayName ?? "Media";
    try {
      const response = await apiFetch(`/api/artifacts/${id}${action === "save-to-library" ? "/save-to-library" : ""}`, { method: action === "delete" ? "DELETE" : "POST" });
      if (!response.ok) throw new Error(response.status === 409 ? "This media is referenced by a workflow, run input, profile image, or Instagram publication. Remove those references first." : "Could not update this media.");
      await refresh();
      showFlash({ tone: "success", title: action === "delete" ? "Media deleted" : "Saved to library", message: action === "delete" ? `“${itemName}” and its stored file were deleted.` : `“${itemName}” will be kept when its run is deleted.` });
      return true;
    } catch (cause) {
      showFlash({ tone: "error", title: action === "delete" ? "Could not delete media" : "Could not save media", message: cause instanceof Error ? cause.message : "Could not update media." });
      return false;
    } finally {
      setBusyId(null);
    }
  }

  const filterOptions: { value: MediaFilter; label: string }[] = [
    { value: "all", label: "All media" },
    { value: "image", label: "Images" },
    { value: "audio", label: "Audio" },
    { value: "video", label: "Video" },
  ];
  const saveFilterOptions: { value: MediaSaveFilter; label: string }[] = [
    { value: "all", label: "All save states" },
    { value: "saved", label: "Saved" },
    { value: "not-saved", label: "Not saved" },
  ];

  return <Stack className="workspace-page" gap="lg">
    <Paper className="inventory-list" withBorder radius="md">
      <Tabs value={tab} onChange={setTab}>
      <Tabs.List><Tabs.Tab value="library">Library</Tabs.Tab><Tabs.Tab value="storage">Storage</Tabs.Tab></Tabs.List>
      <Tabs.Panel value="library">
      <Paper className="media-upload-panel" p="sm">
        <Group className="media-upload-heading" justify="space-between" align="flex-start" wrap="wrap">
          <Stack gap={2}><Text fw={600} size="sm">Add media to your library</Text><Text size="xs" c="dimmed">Saved files stay available after their source run is deleted.</Text></Stack>
          <Text className="media-upload-limits" size="xs" c="dimmed">Images 10 MB · Audio 25 MB · MP4 50 MB</Text>
        </Group>
        <div
          className={`media-upload-dropzone${file ? " media-upload-dropzone-selected" : ""}`}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
          onDrop={(event) => { event.preventDefault(); const droppedFile = event.dataTransfer.files[0]; if (droppedFile) setFile(droppedFile); }}
        >
          <span className="media-upload-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14.5v3A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          <div className="media-upload-file-copy">
            <Text className="media-upload-file-name" fw={600} size="sm" lineClamp={1}>{file?.name ?? "Drop a file here or choose a file"}</Text>
            <Text size="xs" c={file && !inferUploadType(file) ? "hiveError" : "dimmed"}>{file ? inferUploadType(file) ? `${formatFileSize(file.size)} · ${uploadTypeLabel(inferUploadType(file)!)} file ready` : "Use PNG, JPEG, WebP, WAV, MP3, Ogg, FLAC, or MP4." : "PNG, JPEG, WebP · WAV, MP3, Ogg, FLAC · MP4"}</Text>
          </div>
          <Group className="media-upload-actions" gap="xs" wrap="nowrap">
            <FileInput className="media-upload-file" aria-label={file ? "Replace selected file" : "Choose file"} placeholder={file ? "Replace" : "Choose file"} value={file} onChange={setFile} accept="image/png,image/jpeg,image/webp,audio/wav,audio/mpeg,audio/ogg,audio/flac,video/mp4" />
            <Button onClick={() => void upload()} loading={busyId === "upload"} disabled={!file || !inferUploadType(file)}>Upload media</Button>
          </Group>
        </div>
      </Paper>
      <Group className="inventory-toolbar media-toolbar" justify="space-between" wrap="wrap">
        <Group className="media-filters" gap="xs" wrap="wrap">
          <TextInput aria-label="Search media" className="media-search" placeholder="Search files, formats, workflows, nodes, webhooks" value={search} onChange={(event) => { setSearch(event.currentTarget.value); setPage(1); }} />
          <Select aria-label="Filter media type" className="media-filter" data={filterOptions} value={filter} onChange={(value) => { setFilter((value as MediaFilter | null) ?? "all"); setPage(1); }} allowDeselect={false} />
          <Select aria-label="Filter save status" className="media-save-filter" data={saveFilterOptions} value={saveFilter} onChange={(value) => { setSaveFilter((value as MediaSaveFilter | null) ?? "all"); setPage(1); }} allowDeselect={false} />
        </Group>
      </Group>
      {loading ? <Group justify="center" p="xl"><Loader size="sm" /></Group>
        : total === 0 ? <Stack className="media-empty" align="center" gap="xs" p="xl"><Text fw={600}>{search || filter !== "all" || saveFilter !== "all" ? "No media matches these filters" : "Your library is empty"}</Text><Text size="sm" c="dimmed">Try another search or change the media filters.</Text></Stack>
            : <div className="media-library-layout">
              <div className="media-table-wrap">
                <Table className="inventory-table media-inventory-table" highlightOnHover withRowBorders>
                  <Table.Thead><Table.Tr><Table.Th>File</Table.Th><Table.Th>Type</Table.Th><Table.Th>Size</Table.Th><Table.Th>Added</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {pageItems.map((item) => <Table.Tr
                      key={item.id}
                      className={selectedItem?.id === item.id ? "inventory-row-selected" : undefined}
                      tabIndex={0}
                      aria-selected={selectedItem?.id === item.id}
                      onClick={() => setSelectedId(item.id)}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(item.id); } }}
                    >
                      <Table.Td><Text className="inventory-row-title" fw={600} size="sm" lineClamp={1}>{item.displayName}</Text><Text size="xs" c="dimmed">{item.savedToLibrary ? "Saved to library" : item.runId ? "Run output" : "Workflow input"} · {availabilityLabel(item.availabilityState)}</Text></Table.Td>
                      <Table.Td><Badge variant="light" color="gray" size="sm">{mediaKind(item)}</Badge></Table.Td>
                      <Table.Td className="inventory-nowrap">{formatFileSize(item.byteSize)}</Table.Td>
                      <Table.Td className="media-date-cell">{formatDate(item.createdAt)}</Table.Td>
                    </Table.Tr>)}
                  </Table.Tbody>
                </Table>
                <PaginatedTableFooter total={total} itemName="item" page={page} pageSize={PAGE_SIZE} totalPages={totalPages} onPageChange={(nextPage) => { setPage(nextPage); setSelectedId(null); }} />
              </div>
              {selectedItem && <Paper className="media-detail-panel" radius="md" p="sm">
                <Group className="media-detail-heading" justify="space-between" wrap="nowrap" mb="xs">
                  <Stack gap={2} style={{ minWidth: 0 }}><Text fw={600} size="sm" lineClamp={1}>{selectedItem.displayName}</Text><Text size="xs" c="dimmed">{mediaKind(selectedItem)} · {formatFileSize(selectedItem.byteSize)}</Text></Stack>
                  <Badge color={selectedItem.savedToLibrary ? "hiveSuccess" : "hiveSky"} variant="light">{selectedItem.savedToLibrary ? "Saved" : selectedItem.runId ? "Run output" : "Workflow input"}</Badge>
                </Group>
                <div className={`media-preview-frame${selectedItem.mediaType.startsWith("audio/") ? " media-preview-frame-audio" : ""}`}><Preview item={selectedItem} /></div>
                <div className="media-detail-metadata">
                  <div><Text className="media-detail-meta-label">Added</Text><Text size="xs">{formatDate(selectedItem.createdAt)}</Text></div>
                  <div><Text className="media-detail-meta-label">Storage status</Text><Group gap={6} wrap="nowrap"><Badge size="xs" variant="light" color={availabilityColor(selectedItem.availabilityState)}>{availabilityLabel(selectedItem.availabilityState)}</Badge><Text size="xs" c="dimmed">{selectedItem.availabilityReason ?? "Status unavailable"}</Text></Group><Text size="xs" c="dimmed" mt={2}>Checked {checkedTime(selectedItem.evaluatedAt)}</Text></div>
                </div>
                {mediaReferenceGroups.length > 0 && <Stack className="media-detail-references" gap={"xs"}>
                  <Text className="media-detail-section-title">Used by</Text>
                  {mediaReferenceGroups.flatMap((group) => group.names.map((name, index) => <div className="media-detail-reference" key={`${group.label}-${name}-${index}`}><Text className="media-detail-reference-type">{group.label}</Text><Text size="xs" lineClamp={2}>{name}</Text></div>))}
                </Stack>}
                <Group justify="space-between" gap="xs" mt="sm" className="media-detail-actions">
                  <Button size="xs" variant="light" color="hiveError" loading={busyId === selectedItem.id} onClick={() => setDeleteTarget(selectedItem)}>Delete</Button>
                  {!selectedItem.savedToLibrary && <Button size="xs" variant="light" loading={busyId === selectedItem.id} onClick={() => void perform(selectedItem.id, "save-to-library")}>Save to library</Button>}
                </Group>
              </Paper>}
            </div>}
      </Tabs.Panel>
      <Tabs.Panel value="storage" p="md">
        <div className="media-storage-workspace">
          <Group className="media-storage-heading" justify="space-between" align="flex-start">
            <Stack gap={3}><Title order={1} size="h3">Storage</Title><Text size="sm" c="dimmed">Protected files have active references; retained files are kept by policy; eligible files can be reviewed for cleanup.</Text><Text size="xs" c="dimmed">Status checked {checkedTime(summary?.evaluated_at)}</Text></Stack>
            <Button variant="default" onClick={() => setTab("library")}>← Back to library</Button>
          </Group>
          <div className="media-storage-grid">
            <Paper className="media-storage-card" withBorder radius="md" p="md">
              <Title order={2} size="h6" mb="xs">Tracked storage</Title>
              {summary ? <>
                <Text className="media-storage-total" fw={700}>{formatFileSize(summary.total_bytes)}</Text>
                <Text size="xs" c="dimmed">Total across {summary.total_count} artifact files</Text>
                <div className="media-storage-bar" role="img" aria-label={`Storage breakdown: ${formatFileSize(summary.saved_bytes)} saved, ${formatFileSize(summary.run_output_bytes)} unsaved run outputs, ${formatFileSize(summary.workflow_upload_bytes)} workflow uploads`}>
                  <span style={{ width: `${summary.total_bytes ? summary.saved_bytes / summary.total_bytes * 100 : 0}%` }} />
                  <span style={{ width: `${summary.total_bytes ? summary.run_output_bytes / summary.total_bytes * 100 : 0}%` }} />
                  <span style={{ width: `${summary.total_bytes ? summary.workflow_upload_bytes / summary.total_bytes * 100 : 0}%` }} />
                </div>
                <div className="media-storage-breakdown">
                  <Text size="xs" c="dimmed">Saved to library · {summary.saved_count} files</Text><Text size="xs" fw={600}>{formatFileSize(summary.saved_bytes)}</Text>
                  <Text size="xs" c="dimmed">Unsaved run outputs · {summary.run_output_count} files</Text><Text size="xs" fw={600}>{formatFileSize(summary.run_output_bytes)}</Text>
                  <Text size="xs" c="dimmed">Workflow uploads · {summary.workflow_upload_count} files</Text><Text size="xs" fw={600}>{formatFileSize(summary.workflow_upload_bytes)}</Text>
                </div>
                <Text className="media-storage-protected-total" size="xs">Protected by active references · {summary.protected_count} files · {formatFileSize(summary.protected_bytes)} <Text component="span" size="xs" c="dimmed">(overlaps categories above; recent run outputs are retained separately)</Text></Text>
              </> : <Group justify="center" p="md"><Loader size="sm" /></Group>}
            </Paper>
            <Paper className="media-storage-card" withBorder radius="md" p="md">
              <Title order={2} size="h6" mb="sm">Plan cleanup</Title>
              <Checkbox.Group value={scopes} onChange={(value) => { setScopes(value); setPreview(null); }} label={<Text size="xs" fw={700} c="dimmed">CHOOSE WHAT TO REVIEW</Text>}>
                <Stack gap={0} mt="xs">
                  <Checkbox className="media-cleanup-scope" value="old-run-outputs" label={<Stack gap={2}><Text size="sm" fw={600}>Unsaved run outputs</Text><Text size="xs" c="dimmed">Older than 30 days · completed runs only. Active runs and publications stay protected.</Text></Stack>} />
                  <Checkbox className="media-cleanup-scope" value="orphaned-workflow-uploads" label={<Stack gap={2}><Text size="sm" fw={600}>Unused workflow uploads</Text><Text size="xs" c="dimmed">No current workflow or run references · any age. Saved library files are excluded.</Text></Stack>} />
                </Stack>
              </Checkbox.Group>
              <Alert className="media-protected-callout" color="hiveWarning" variant="light" mt="sm">Protected files appear in the review with the reason they’re retained; they are not selected for deletion.</Alert>
              <div className="media-cleanup-footer">
                <Stack gap={2}><Text size="xs" c="dimmed">Review items and estimate before deleting</Text>{preview && <Text size="xs" fw={600}>{preview.eligibleCount} eligible · {formatFileSize(preview.estimatedBytes)} estimated</Text>}</Stack>
                <Button disabled={!scopes.length} loading={previewLoading} onClick={() => void previewCleanup()}>Preview cleanup →</Button>
              </div>
            </Paper>
          </div>
          {preview && <Paper className="media-storage-card media-cleanup-preview" withBorder radius="md" p="md">
            <Group justify="space-between" mb="sm"><Stack gap={2}><Title order={2} size="h6">Cleanup review</Title><Text size="xs" c="dimmed">{preview.eligibleCount} eligible · {preview.protectedCount} protected · {preview.retainedCount} retained · {formatFileSize(preview.estimatedBytes)} estimated</Text><Text size="xs" c="dimmed">Eligibility checked {checkedTime(preview.evaluatedAt)}; it will be checked again before deletion.</Text></Stack><Button color="hiveError" disabled={!preview.eligibleCount} loading={previewLoading} onClick={() => void reviewCleanup()}>Delete {preview.eligibleCount} eligible files</Button></Group>
            {preview.items.length === 0 ? <Text size="sm" c="dimmed">No files match these cleanup scopes.</Text> : <Table><Table.Thead><Table.Tr><Table.Th>File</Table.Th><Table.Th>Type</Table.Th><Table.Th>Size</Table.Th><Table.Th>Added</Table.Th><Table.Th>Context / status</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{preview.items.map((item) => <Table.Tr key={item.id}><Table.Td>{item.displayName}</Table.Td><Table.Td>{mediaKind(item)}</Table.Td><Table.Td>{formatFileSize(item.byteSize)}</Table.Td><Table.Td>{formatDate(item.createdAt)}</Table.Td><Table.Td><Badge color={availabilityColor(item.availabilityState)}>{availabilityLabel(item.availabilityState)}</Badge><Text size="xs" c="dimmed">{item.availabilityReason}{item.availabilityState === "retained" && item.eligibleAfter ? ` · Eligible after ${formatDate(item.eligibleAfter)}` : ""}</Text><Text size="xs" c="dimmed">{[...(item.workflowNames ?? []), ...(item.nodeNames ?? []), ...(item.webhookNames ?? [])].join(" · ") || "No linked context"}</Text></Table.Td></Table.Tr>)}</Table.Tbody></Table>}
          </Paper>}
          {cleanupJob && <Paper className="media-storage-card media-cleanup-preview" withBorder radius="md" p="sm"><Group justify="space-between"><Stack gap={2}><Text fw={600} size="sm">Cleanup {cleanupJob.status.replaceAll("_", " ")}</Text><Text size="xs" c="dimmed">{cleanupJob.outcomes.map((entry) => `${entry.count} ${entry.status}`).join(" · ") || "Waiting for cleanup worker"}</Text></Stack>{cleanupJob.status === "completed_with_skips" && cleanupJob.outcomes.some((entry) => entry.status === "failed") && <Button size="xs" variant="light" onClick={() => void apiFetch(`/api/artifacts/cleanup/${cleanupJob.id}/retry`, { method: "POST" }).then(() => setCleanupJob({ ...cleanupJob, status: "queued" }))}>Retry failed</Button>}</Group></Paper>}
          <Paper className="media-storage-card media-protected-list" withBorder radius="md" p="md">
            <Group justify="space-between" mb="sm"><Title order={2} size="h6">Protected media</Title><Badge variant="light" color="gray">{protectedTotal} files</Badge></Group>
            {protectedItems.length === 0 ? <Text size="sm" c="dimmed">No media is currently protected by an active reference.</Text> : <>
              <Table className="inventory-table" withRowBorders><Table.Thead><Table.Tr><Table.Th>File</Table.Th><Table.Th>Protected by</Table.Th><Table.Th>Size</Table.Th><Table.Th>Age</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{protectedItems.map((item) => <Table.Tr key={item.id}><Table.Td><Text fw={600} size="sm">{item.displayName}</Text><Text size="xs" c="dimmed">{item.savedToLibrary ? "Saved to library" : item.runId ? "Run output" : "Workflow input"}</Text></Table.Td><Table.Td>{item.protectedBy?.join(" · ") || "Active reference"}</Table.Td><Table.Td>{formatFileSize(item.byteSize)}</Table.Td><Table.Td>{mediaAge(item.createdAt)}</Table.Td></Table.Tr>)}</Table.Tbody></Table>
              <PaginatedTableFooter total={protectedTotal} itemName="protected file" page={protectedPage} pageSize={10} totalPages={Math.max(1, Math.ceil(protectedTotal / 10))} onPageChange={setProtectedPage} />
            </>}
          </Paper>
        </div>
      </Tabs.Panel>
      </Tabs>
    </Paper>
    <ConfirmActionModal opened={deleteTarget !== null} onClose={() => { if (busyId !== deleteTarget?.id) setDeleteTarget(null); }} title="Delete media permanently?" confirmLabel="Delete media" loading={busyId === deleteTarget?.id} onConfirm={() => { if (!deleteTarget) return; void perform(deleteTarget.id, "delete").then((deleted) => { if (deleted) setDeleteTarget(null); }); }}>
      <Text size="sm">Delete “{deleteTarget?.displayName}” and its stored file? This action cannot be undone. Media referenced by workflows or publications cannot be deleted until those references are removed.</Text>
    </ConfirmActionModal>
    <ConfirmActionModal opened={confirmCleanup} onClose={() => setConfirmCleanup(false)} title="Delete eligible media permanently?" confirmLabel="Delete media" onConfirm={() => void queueCleanup().catch((cause) => showFlash({ tone: "error", title: "Could not start cleanup", message: cause instanceof Error ? cause.message : "Could not start cleanup." }))}>
      <Text size="sm">Delete {preview?.eligibleCount ?? 0} files and free an estimated {formatFileSize(preview?.estimatedBytes ?? 0)}. This is permanent. Eligibility and references will be checked again before each file is deleted.</Text>
    </ConfirmActionModal>
  </Stack>;
}
