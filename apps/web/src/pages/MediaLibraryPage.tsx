import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, FileInput, Group, Image, Loader, Paper, Select, Stack, Table, Text, Title } from "@mantine/core";
import { apiFetch, apiUrl } from "../apiClient";
import { formatFileSize } from "../formatters";
import { useFlashMessages } from "../components/FlashMessages";

type Media = { id: string; displayName: string; dataTypeId: string; mediaType: string; byteSize: number; createdAt: string; runId: string | null; savedToLibrary: boolean };
type MediaFilter = "all" | "image" | "audio" | "video";
type MediaSaveFilter = "all" | "saved" | "not-saved";

function Preview({ item }: { item: Media }) {
  const url = apiUrl(`/api/artifacts/${item.id}/preview`);
  return item.mediaType.startsWith("image/") ? <Image className="media-detail-preview" src={url} alt={item.displayName} fit="contain" />
    : item.mediaType.startsWith("video/") ? <video className="media-detail-video" src={url} controls playsInline crossOrigin="use-credentials" preload="metadata" />
      : <audio className="media-detail-audio" src={url} controls />;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function mediaKind(item: Media) {
  if (item.mediaType.startsWith("image/")) return "Image";
  if (item.mediaType.startsWith("audio/")) return "Audio";
  if (item.mediaType.startsWith("video/")) return "Video";
  return item.dataTypeId;
}

export function MediaLibraryPage() {
  const { showFlash } = useFlashMessages();
  const [items, setItems] = useState<Media[]>([]);
  const [type, setType] = useState<string | null>("image");
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [saveFilter, setSaveFilter] = useState<MediaSaveFilter>("all");
  const [file, setFile] = useState<File | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setError(null);
    try {
      const response = await apiFetch("/api/artifacts");
      if (!response.ok) throw new Error("Could not load media.");
      const body = await response.json() as { items: Media[] };
      setItems(body.items);
      setSelectedId((current) => body.items.some((item) => item.id === current) ? current : body.items[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load media.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const filteredItems = useMemo(() => items.filter((item) => {
    const matchesType = filter === "all" || item.mediaType.startsWith(`${filter}/`);
    const matchesSaveStatus = saveFilter === "all" || (saveFilter === "saved" ? item.savedToLibrary : !item.savedToLibrary);
    return matchesType && matchesSaveStatus;
  }), [filter, items, saveFilter]);
  const selectedItem = filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? null;

  async function upload() {
    if (!file || !type) return;
    setBusyId("upload"); setError(null);
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

  async function perform(id: string, action: "save-to-library" | "delete") {
    setBusyId(id); setError(null);
    const itemName = items.find((item) => item.id === id)?.displayName ?? "Media";
    try {
      const response = await apiFetch(`/api/artifacts/${id}${action === "save-to-library" ? "/save-to-library" : ""}`, { method: action === "delete" ? "DELETE" : "POST" });
      if (!response.ok) throw new Error(response.status === 409 ? "This media is referenced by a workflow, run input, profile image, or Instagram publication. Remove those references first." : "Could not update this media.");
      await refresh();
      showFlash({ tone: "success", title: action === "delete" ? "Media deleted" : "Saved to library", message: action === "delete" ? `“${itemName}” and its stored file were deleted.` : `“${itemName}” will be kept when its run is deleted.` });
    } catch (cause) {
      showFlash({ tone: "error", title: action === "delete" ? "Could not delete media" : "Could not save media", message: cause instanceof Error ? cause.message : "Could not update media." });
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
    <Group justify="flex-end" className="page-header-actions">
      <Button className="page-header-button" data-header-tone="neutral" variant="default" onClick={() => void refresh()} loading={loading}>Refresh</Button>
    </Group>

    <Paper className="media-upload-panel" withBorder radius="md" p="sm">
      <Group className="media-upload-row" align="end" wrap="wrap">
        <Stack className="media-upload-copy" gap={2}><Text fw={600} size="sm">Upload to library</Text><Text size="xs" c="dimmed">Saved independently from workflow runs · Images 10 MB · Audio 25 MB · MP4 50 MB</Text></Stack>
        <Select className="media-upload-type" aria-label="Media type" data={[{ value: "image", label: "Image" }, { value: "audio", label: "Audio" }, { value: "video", label: "Video" }]} value={type} onChange={setType} />
        <FileInput className="media-upload-file" aria-label="Choose file" placeholder="Choose a file" value={file} onChange={setFile} accept={type === "image" ? "image/png,image/jpeg,image/webp" : type === "audio" ? "audio/wav,audio/mpeg,audio/ogg,audio/flac" : "video/mp4"} />
        <Button onClick={() => void upload()} loading={busyId === "upload"} disabled={!file || !type}>Upload</Button>
      </Group>
    </Paper>

    {error && <Alert color="hiveError" title="Media library unavailable" onClose={() => setError(null)} withCloseButton>{error}</Alert>}

    <Paper className="inventory-list" withBorder radius="md">
      <Group className="inventory-toolbar media-toolbar" justify="space-between" wrap="wrap">
        <Group gap="xs"><Title order={2} size="h5">Library assets</Title><Badge variant="light" color="gray">{filteredItems.length} items</Badge></Group>
        <Group className="media-filters" gap="xs" wrap="wrap">
          <Select aria-label="Filter media type" className="media-filter" data={filterOptions} value={filter} onChange={(value) => setFilter((value as MediaFilter | null) ?? "all")} allowDeselect={false} />
          <Select aria-label="Filter save status" className="media-save-filter" data={saveFilterOptions} value={saveFilter} onChange={(value) => setSaveFilter((value as MediaSaveFilter | null) ?? "all")} allowDeselect={false} />
        </Group>
      </Group>
      {loading ? <Group justify="center" p="xl"><Loader size="sm" /></Group>
        : items.length === 0 ? <Stack className="media-empty" align="center" gap="xs" p="xl"><Text fw={600}>Your library is empty</Text><Text size="sm" c="dimmed">Generated and uploaded media will appear here.</Text></Stack>
          : filteredItems.length === 0 ? <Stack className="media-empty" align="center" gap="xs" p="xl"><Text fw={600}>No media matches these filters</Text><Text size="sm" c="dimmed">Change the media type or save status to see more items.</Text></Stack>
            : <div className="media-library-layout">
              <div className="media-table-wrap">
                <Table className="inventory-table media-inventory-table" highlightOnHover withRowBorders>
                  <Table.Thead><Table.Tr><Table.Th>File</Table.Th><Table.Th>Type</Table.Th><Table.Th>Size</Table.Th><Table.Th>Added</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {filteredItems.map((item) => <Table.Tr
                      key={item.id}
                      className={selectedItem?.id === item.id ? "inventory-row-selected" : undefined}
                      tabIndex={0}
                      aria-selected={selectedItem?.id === item.id}
                      onClick={() => setSelectedId(item.id)}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(item.id); } }}
                    >
                      <Table.Td><Text fw={600} size="sm" lineClamp={1}>{item.displayName}</Text><Text size="xs" c="dimmed">{item.savedToLibrary ? "Saved to library" : item.runId ? "Run output" : "Workflow input"}</Text></Table.Td>
                      <Table.Td><Badge variant="light" color="gray" size="sm">{mediaKind(item)}</Badge></Table.Td>
                      <Table.Td className="inventory-nowrap">{formatFileSize(item.byteSize)}</Table.Td>
                      <Table.Td className="media-date-cell">{formatDate(item.createdAt)}</Table.Td>
                    </Table.Tr>)}
                  </Table.Tbody>
                </Table>
              </div>
              {selectedItem && <Paper className="media-detail-panel" radius="md" p="sm">
                <Group justify="space-between" wrap="nowrap" mb="xs">
                  <Stack gap={2} style={{ minWidth: 0 }}><Text fw={600} size="sm" lineClamp={1}>{selectedItem.displayName}</Text><Text size="xs" c="dimmed">{mediaKind(selectedItem)} · {formatFileSize(selectedItem.byteSize)}</Text></Stack>
                  <Badge color={selectedItem.savedToLibrary ? "hiveSuccess" : "hiveSky"} variant="light">{selectedItem.savedToLibrary ? "Saved" : selectedItem.runId ? "Run output" : "Workflow input"}</Badge>
                </Group>
                <div className={`media-preview-frame${selectedItem.mediaType.startsWith("audio/") ? " media-preview-frame-audio" : ""}`}><Preview item={selectedItem} /></div>
                <Text size="xs" c="dimmed" mt="xs">Added {formatDate(selectedItem.createdAt)}</Text>
                <Group justify="flex-end" gap="xs" mt="sm" className="media-detail-actions">
                  {!selectedItem.savedToLibrary && <Button size="xs" variant="light" loading={busyId === selectedItem.id} onClick={() => void perform(selectedItem.id, "save-to-library")}>Save to library</Button>}
                  <Button size="xs" variant="light" color="hiveError" loading={busyId === selectedItem.id} onClick={() => { if (window.confirm(`Permanently delete ${selectedItem.displayName}?`)) void perform(selectedItem.id, "delete"); }}>Delete</Button>
                </Group>
              </Paper>}
            </div>}
    </Paper>
  </Stack>;
}
