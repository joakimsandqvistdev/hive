import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Group, Progress, SimpleGrid, Stack, Tabs, Text, Title } from "@mantine/core";
import { API_BASE } from "../auth";
import { modelGroups, type ModelId } from "../modelGroups";

type ModelStatus = "not_downloaded" | "queued" | "downloading" | "cancelling" | "downloaded" | "failed" | "unavailable";
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
  { id: "instruct-pix2pix", name: "InstructPix2Pix", summary: "Applies text instructions to one connected source image.", size: "About 5 GB", sizeBytes: 5_000_000_000, requirements: ["GPU: 8 GB VRAM recommended", "System RAM: 16 GB recommended", "Disk: 8 GB free"], source: "https://huggingface.co/timbrooks/instruct-pix2pix" },
  { id: "sd15-inpainting", name: "Stable Diffusion 1.5 Inpainting", summary: "Replaces masked regions of a connected source image using a black/white mask and prompt.", size: "About 5 GB", sizeBytes: 5_000_000_000, requirements: ["GPU: 8 GB VRAM recommended", "System RAM: 16 GB recommended", "Disk: 8 GB free"], source: "https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-inpainting" },
  { id: "longcat-image-edit-turbo", name: "LongCat-Image-Edit-Turbo", summary: "Instruction-based editing of one source image, distilled for faster inference.", size: "About 24 GB", sizeBytes: 24_000_000_000, requirements: ["GPU: 18 GB VRAM class; CPU offload available", "System RAM: 32 GB or more recommended", "Disk: 30 GB free"], source: "https://huggingface.co/meituan-longcat/LongCat-Image-Edit-Turbo" },
  { id: "flux2-klein-4b", name: "FLUX.2 Klein 4B", summary: "Text-to-image generation and editing with up to four reference images.", size: "About 8 GB", sizeBytes: 8_000_000_000, requirements: ["GPU: about 13 GB VRAM recommended", "System RAM: 32 GB recommended", "Disk: 12 GB free"], source: "https://huggingface.co/black-forest-labs/FLUX.2-klein-4B" },
  { id: "sd15-base", name: "Stable Diffusion 1.5", summary: "Lightweight text-to-image generation at standard resolutions, with broad ecosystem support.", size: "About 5 GB", sizeBytes: 5_000_000_000, requirements: ["GPU: 4 GB VRAM recommended", "System RAM: 8 GB recommended", "Disk: 7 GB free"], source: "https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5" },
  { id: "sdxl-base-1.0", name: "SDXL Base 1.0", summary: "Higher-resolution text-to-image generation with improved image composition and detail.", size: "About 7 GB", sizeBytes: 7_000_000_000, requirements: ["GPU: 8 GB VRAM recommended", "System RAM: 16 GB recommended", "Disk: 9 GB free"], source: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0" },
  { id: "sd35-medium", name: "Stable Diffusion 3.5 Medium", summary: "Text-to-image model tuned for prompt understanding, typography, and image quality; uses three text encoders.", size: "About 16 GB", sizeBytes: 16_000_000_000, requirements: ["GPU: 12 GB VRAM class; quantization or offload may be needed", "System RAM: 32 GB recommended", "Disk: 20 GB free; accept Hugging Face access terms and configure HF_TOKEN in .env"], source: "https://huggingface.co/stabilityai/stable-diffusion-3.5-medium" },
  { id: "sdxl-turbo", name: "SDXL-Turbo", summary: "Fast SDXL-derived text-to-image generation in 1–4 steps. Licensed for research and non-commercial use; commercial use needs separate terms.", size: "About 7 GB", sizeBytes: 7_000_000_000, requirements: ["GPU: 8 GB VRAM recommended", "System RAM: 16 GB recommended", "Disk: 9 GB free"], source: "https://huggingface.co/stabilityai/sdxl-turbo" },
  { id: "sana-sprint-06b", name: "Sana Sprint 0.6B", summary: "Very fast text-to-image generation in 1–4 steps, using the Gemma 2 text encoder.", size: "About 5 GB", sizeBytes: 5_000_000_000, requirements: ["GPU: 9 GB VRAM for the published BF16 path; quantized under 8 GB is not yet enabled", "System RAM: 16 GB recommended", "Disk: 7 GB free; Gemma terms also apply"], source: "https://huggingface.co/Efficient-Large-Model/Sana_Sprint_0.6B_1024px_diffusers" },
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
    <Tabs defaultValue={modelGroups[0].id} keepMounted={false}>
      <Tabs.List aria-label="Model categories">
        {modelGroups.map((group) => <Tabs.Tab key={group.id} value={group.id}>{group.title}</Tabs.Tab>)}
      </Tabs.List>
      {modelGroups.map((group) => <Tabs.Panel key={group.id} value={group.id} pt="md">
        <Stack gap="md">
          <Text size="sm" c="dimmed">{group.description}</Text>
          <SimpleGrid cols={{ base: 1, lg: 2 }}>
      {modelDetails.filter((detail) => group.modelIds.includes(detail.id)).map((detail) => {
        const state = models.find((model) => model.id === detail.id);
        const status = state?.status ?? "unavailable";
        const busy = status === "queued" || status === "downloading" || status === "cancelling";
        const downloadedBytes = Math.max(0, state?.downloadedBytes ?? 0);
        const progress = Math.min(100, downloadedBytes / detail.sizeBytes * 100);
        return <Card key={detail.id} withBorder radius="md" padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="start">
              <Stack gap={3}><Title order={3} size="h3">{detail.name}</Title><Text size="sm" c="dimmed">Estimated download: {detail.size}</Text></Stack>
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
        </Stack>
      </Tabs.Panel>)}
    </Tabs>
    {!loading && models.length === 0 && <Text size="sm" c="dimmed">Model status is not available from the runner right now.</Text>}
  </Stack>;
}
