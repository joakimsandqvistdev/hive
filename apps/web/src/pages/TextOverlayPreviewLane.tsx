import { useEffect, useState } from "react";
import { Button, Group, Image, Loader, Paper, Stack, Text, ThemeIcon } from "@mantine/core";
import { apiFetch } from "../apiClient";

export function TextOverlayPreviewLane({ artifactId, text, settings, nodeId, onSaveDefaults }: { artifactId?: string; text?: string; settings: Record<string, unknown>; nodeId: string; onSaveDefaults: (settings: Record<string, unknown>) => Promise<void> }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaultsSaved, setDefaultsSaved] = useState(false);
  const settingsKey = JSON.stringify(settings);

  useEffect(() => setDefaultsSaved(false), [nodeId, settingsKey]);

  useEffect(() => {
    if (!artifactId || !text?.trim()) {
      setPreviewUrl(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    setPreviewUrl(null);
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void apiFetch("/api/processing/text-overlay/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ artifactId, text, settings }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Preview is unavailable for these settings.");
          return response.blob();
        })
        .then((blob) => {
          if (!cancelled) {
            objectUrl = URL.createObjectURL(blob);
            setPreviewUrl(objectUrl);
          }
        })
        .catch((cause: unknown) => {
          if (!cancelled && !(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "Could not render preview.");
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 220);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [artifactId, text, settingsKey]);

  const hasInputs = Boolean(artifactId && text?.trim());
  return <aside className="text-overlay-preview-lane" aria-label="Text Overlay live preview">
    <Group className="text-overlay-preview-heading" justify="space-between" align="flex-start" wrap="nowrap">
      <Stack gap={2}><Text size="xs" c="dimmed" tt="uppercase" fw={600}>Text Overlay</Text><Text fw={600}>Live preview</Text></Stack>
      {loading ? <Loader size={15} aria-label="Updating preview" /> : previewUrl ? <span className="text-overlay-preview-status"><i /> Updated</span> : null}
    </Group>
    <div className="text-overlay-preview-stage">
      {previewUrl ? <Image src={previewUrl} alt="Preview of the image with the current text overlay settings" fit="contain" w="100%" h="100%" /> : <Stack className="text-overlay-preview-empty" align="center" justify="center" gap="xs">
        {loading ? <Loader size="sm" /> : null}
        <Text size="sm" ta="center" c={error ? "hiveError" : "dimmed"}>{error ?? (hasInputs ? "Rendering preview…" : "Connect a direct image input and enter text to preview the overlay.")}</Text>
        {!hasInputs && <Text size="xs" ta="center" c="dimmed">Model-generated inputs appear after a run.</Text>}
      </Stack>}
    </div>
    <Stack className="text-overlay-preview-context" gap={3}>
      <Text size="sm" fw={500}>{artifactId ? "Connected image" : "Waiting for image input"}</Text>
      <Text size="xs" c="dimmed">{text?.trim() ? `${text.length} characters · updates as settings change` : "Connect a text input to complete the preview."}</Text>
    </Stack>
    <Paper className="text-overlay-preview-defaults" withBorder radius="md" p="xs">
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group wrap="nowrap" gap="sm" miw={0}>
          <ThemeIcon className="text-overlay-preview-defaults-icon" variant="light" color="hiveSky" radius="md" size={34} aria-hidden="true">
            {defaultsSaved ? <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg> : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h12l3 3v13H4V4h1Z" /><path d="M8 4v6h8V4M8 20v-6h8v6" /></svg>}
          </ThemeIcon>
          <Stack gap={1} miw={0}>
            <Text size="sm" fw={600}>{defaultsSaved ? "Defaults saved" : "New node defaults"}</Text>
            <Text size="xs" c="dimmed">{defaultsSaved ? "New Text Overlay nodes will use these settings." : "Save the current style for future Text Overlay nodes."}</Text>
          </Stack>
        </Group>
        {!defaultsSaved && <Button size="xs" variant="light" className="text-overlay-preview-defaults-button" onClick={() => { void onSaveDefaults(settings).then(() => setDefaultsSaved(true)).catch(() => {}); }}>Save</Button>}
      </Group>
    </Paper>
  </aside>;
}
