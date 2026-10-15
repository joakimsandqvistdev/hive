import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, FileInput, Group, Image, Loader, Paper, Select, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { apiFetch, apiUrl } from "../apiClient";

type Media = { id: string; displayName: string; dataTypeId: string; mediaType: string; byteSize: number; createdAt: string; runId: string | null; savedToLibrary: boolean };

function Preview({ item }: { item: Media }) {
  const url = apiUrl(`/api/artifacts/${item.id}/preview`);
  return item.mediaType.startsWith("image/") ? <Image src={url} alt={item.displayName} h={220} fit="contain" />
    : item.mediaType.startsWith("video/") ? <video src={url} controls playsInline crossOrigin="use-credentials" preload="metadata" style={{ width: "100%", maxHeight: 220 }} />
      : <audio src={url} controls style={{ width: "100%" }} />;
}

export function MediaLibraryPage() {
  const [items, setItems] = useState<Media[]>([]);
  const [type, setType] = useState<string | null>("image");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setError(null);
    try { const response = await apiFetch("/api/artifacts"); if (!response.ok) throw new Error("Could not load media."); const body = await response.json() as { items: Media[] }; setItems(body.items); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load media."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  async function upload() {
    if (!file || !type) return;
    setBusyId("upload"); setError(null);
    try {
      const response = await apiFetch(`/api/artifacts/upload?scope=library&dataTypeId=${type}&name=${encodeURIComponent(file.name)}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file });
      const body = await response.json() as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Could not upload media.");
      setFile(null); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not upload media."); }
    finally { setBusyId(null); }
  }
  async function perform(id: string, action: "save-to-library" | "delete") {
    setBusyId(id); setError(null);
    try {
      const response = await apiFetch(`/api/artifacts/${id}${action === "save-to-library" ? "/save-to-library" : ""}`, { method: action === "delete" ? "DELETE" : "POST" });
      if (!response.ok) throw new Error(response.status === 409 ? "This media is referenced by a workflow, run input, profile image, or Instagram publication. Remove those references first." : "Could not update this media.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update media."); }
    finally { setBusyId(null); }
  }
  return <Stack className="workspace-page" gap="lg">
    <Group justify="space-between" align="end"><Stack gap={3}><Text className="page-eyebrow">Workspace</Text><Title order={1} className="page-title">Media Library</Title></Stack><Button variant="light" onClick={() => void refresh()}>Refresh</Button></Group>
    <Paper withBorder p="md"><Stack><Text fw={600}>Upload media to your library</Text><Text size="sm" c="dimmed">Library uploads are saved independently of workflow runs. Images: PNG/JPEG/WebP (10 MB). Audio: WAV/MP3/Ogg/FLAC (25 MB). Video: MP4 (50 MB).</Text><Group align="end"><Select label="Media type" data={[{ value: "image", label: "Image" }, { value: "audio", label: "Audio" }, { value: "video", label: "Video" }]} value={type} onChange={setType} /><FileInput label="Choose file" value={file} onChange={setFile} accept={type === "image" ? "image/png,image/jpeg,image/webp" : type === "audio" ? "audio/wav,audio/mpeg,audio/ogg,audio/flac" : "video/mp4"} /><Button onClick={() => void upload()} loading={busyId === "upload"} disabled={!file || !type}>Upload</Button></Group></Stack></Paper>
    {error && <Alert color="hiveError" title="Media update">{error}</Alert>}
    {loading ? <Group justify="center" p="xl"><Loader size="sm" /></Group> : items.length === 0 ? <Paper withBorder p="xl"><Text c="dimmed" ta="center">Generated and uploaded media will appear here.</Text></Paper> : <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
      {items.map((item) => <Paper key={item.id} withBorder p="sm"><Stack gap="xs"><Group justify="space-between" wrap="nowrap"><Text fw={600} size="sm" lineClamp={1}>{item.displayName}</Text><Badge color={item.savedToLibrary ? "hiveSuccess" : "hiveSky"} variant="light">{item.savedToLibrary ? "In library" : item.runId ? "Run output" : "Workflow input"}</Badge></Group><Preview item={item} /><Text size="xs" c="dimmed">{Math.ceil(item.byteSize / 1024)} KB · {new Date(item.createdAt).toLocaleString()}</Text><Group justify="flex-end">{!item.savedToLibrary && <Button size="xs" variant="light" loading={busyId === item.id} onClick={() => void perform(item.id, "save-to-library")}>Save to library</Button>}<Button size="xs" variant="light" color="hiveError" loading={busyId === item.id} onClick={() => { if (window.confirm(`Permanently delete ${item.displayName}?`)) void perform(item.id, "delete"); }}>Delete</Button></Group></Stack></Paper>)}
    </SimpleGrid>}
  </Stack>;
}
