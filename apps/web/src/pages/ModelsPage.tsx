import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Group, Progress, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { API_BASE } from "../auth";

type ModelStatus = "not_downloaded" | "queued" | "downloading" | "cancelling" | "downloaded" | "failed" | "unavailable";
type ModelId = "z-image-turbo" | "qwen-image-edit-2511";
type ModelState = { id: ModelId; status: ModelStatus; downloadedBytes?: number; totalBytes?: number; error?: string };

const modelDetails: Array<{
  id: ModelId;
  name: string;
  summary: string;
  size: string;
  sizeBytes: number;
  requirements: string[];
  source: string;
}> = [
  {
    id: "z-image-turbo",
    name: "Z-Image-Turbo",
    summary: "Creates images from text prompts, with photorealistic results and English or Chinese text rendering.",
    size: "About 32.9 GB",
    sizeBytes: 32_900_000_000,
    requirements: ["GPU: 16 GB VRAM recommended", "System RAM: 32 GB recommended", "Disk: 40 GB free for model files"],
    source: "https://huggingface.co/Tongyi-MAI/Z-Image-Turbo",
  },
  {
    id: "qwen-image-edit-2511",
    name: "Qwen-Image-Edit-2511",
    summary: "Edits one or more reference images from text instructions while aiming to preserve subject identity and visual consistency.",
    size: "About 57.7 GB",
    sizeBytes: 57_700_000_000,
    requirements: ["GPU: 48 GB VRAM recommended; lower-memory offload is unverified", "System RAM: 64 GB recommended", "Disk: 70 GB free for model files"],
    source: "https://huggingface.co/Qwen/Qwen-Image-Edit-2511",
  },
];

const statusLabels: Record<ModelStatus, string> = {
  not_downloaded: "Not downloaded",
  queued: "Queued",
  downloading: "Downloading",
  cancelling: "Cancelling",
  downloaded: "Downloaded",
  failed: "Download failed",
  unavailable: "Status unavailable",
};

export function ModelsPage() {
  const [models, setModels] = useState<ModelState[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<ModelId | null>(null);
  const [cancelling, setCancelling] = useState<ModelId | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/models`, { credentials: "include" });
      const body = await response.json() as { models?: ModelState[]; error?: string };
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in to manage local models." : "The local model runner is unavailable. Start the runner and try again.");
      setModels(body.models ?? []);
      setPageError(null);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not load model status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const downloadActive = models.some((model) => model.status === "queued" || model.status === "downloading" || model.status === "cancelling");
  useEffect(() => {
    if (!downloadActive) return;
    const timer = window.setInterval(() => { void refresh(); }, 2500);
    return () => window.clearInterval(timer);
  }, [downloadActive, refresh]);

  const startDownload = async (id: ModelId) => {
    setRequesting(id);
    setPageError(null);
    try {
      const response = await fetch(`${API_BASE}/api/models/${id}/download`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { detail?: { code?: string } };
        if (body.detail?.code === "download_cancelling") throw new Error("This model download is still cancelling. Try again shortly.");
        throw new Error("Could not start the model download. Try again.");
      }
      await refresh();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not start the model download.");
    } finally {
      setRequesting(null);
    }
  };

  const cancelDownload = async (id: ModelId) => {
    setCancelling(id);
    setPageError(null);
    try {
      const response = await fetch(`${API_BASE}/api/models/${id}/download`, { method: "DELETE", credentials: "include" });
      const body = await response.json().catch(() => ({})) as { detail?: string };
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Could not cancel the model download. Try again.");
      await refresh();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not cancel the model download.");
    } finally {
      setCancelling(null);
    }
  };

  return <Stack className="workspace-page" gap="lg">
    <Group justify="space-between" align="end">
      <Stack gap={3}><Text className="page-eyebrow">Workspace</Text><Title order={1} className="page-title">Models</Title></Stack>
      <Button variant="default" onClick={() => void refresh()} loading={loading}>Refresh status</Button>
    </Group>
    <Alert color="hiveSky" title="Models are downloaded on demand">
      Hive does not bundle model weights. Downloads are fetched from the model publisher and stored in the local Docker runner’s persistent cache. A model can be used after its download completes.
    </Alert>
    {pageError && <Alert color="hiveError" title="Model status unavailable" onClose={() => setPageError(null)} withCloseButton>{pageError}</Alert>}
    <SimpleGrid cols={{ base: 1, lg: 2 }}>
      {modelDetails.map((detail) => {
        const state = models.find((model) => model.id === detail.id);
        const status = state?.status ?? "unavailable";
        const busy = status === "queued" || status === "downloading" || status === "cancelling";
        const downloadedBytes = Math.max(0, state?.downloadedBytes ?? 0);
        const progress = Math.min(100, downloadedBytes / detail.sizeBytes * 100);
        return <Card key={detail.id} withBorder radius="md" padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="start">
              <Stack gap={3}><Title order={2} size="h3">{detail.name}</Title><Text size="sm" c="dimmed">Estimated download: {detail.size}</Text></Stack>
              <Badge color={status === "downloaded" ? "hiveSuccess" : status === "failed" || status === "unavailable" ? "hiveError" : "hiveSky"} variant="light">{loading ? "Checking…" : statusLabels[status]}</Badge>
            </Group>
            <Text size="sm">{detail.summary}</Text>
            <Stack gap={4}>
              <Text size="sm" fw={600}>Recommended system requirements</Text>
              {detail.requirements.map((requirement) => <Text key={requirement} size="sm" c="dimmed">{requirement}</Text>)}
              <Text size="xs" c="dimmed">Disk and RAM figures are Hive estimates; inference needs vary by host and runtime.</Text>
            </Stack>
            {busy && <Stack gap={4}>
              <Text size="sm">Downloaded {(downloadedBytes / 1_000_000_000).toFixed(1)} GB of ~{(detail.sizeBytes / 1_000_000_000).toFixed(1)} GB</Text>
              <Progress value={progress} size="sm" />
            </Stack>}
            {state?.error && <Alert color="hiveError" title="Download did not finish">{state.error}</Alert>}
            <Group justify="space-between" align="center" mt="auto">
              <Text component="a" href={detail.source} target="_blank" rel="noreferrer" size="sm" c="hiveSky">Model card</Text>
              {busy ? <Button variant="light" color="hiveError" disabled={status === "cancelling"} loading={cancelling === detail.id || status === "cancelling"} onClick={() => void cancelDownload(detail.id)}>Cancel download</Button>
                : <Button disabled={loading || !state || status === "downloaded"} loading={requesting === detail.id} onClick={() => void startDownload(detail.id)}>
                  {status === "downloaded" ? "Downloaded" : status === "failed" ? "Retry download" : "Download model"}
                </Button>}
            </Group>
          </Stack>
        </Card>;
      })}
    </SimpleGrid>
    {!loading && models.length === 0 && <Text size="sm" c="dimmed">Model status is not available from the runner right now.</Text>}
  </Stack>;
}
