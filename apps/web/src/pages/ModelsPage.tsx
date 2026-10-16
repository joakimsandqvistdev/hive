import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Group, Loader, Paper, Progress, ScrollArea, Stack, Table, Tabs, Text, Title } from "@mantine/core";
import { apiFetch } from "../apiClient";
import { formatModelSize, modelDetails, modelGroups, type ModelId } from "../modelCatalog";

type ModelStatus = "not_downloaded" | "queued" | "downloading" | "cancelling" | "downloaded" | "failed" | "unavailable";
type ModelState = { id: ModelId; status: ModelStatus; downloadedBytes?: number; totalBytes?: number; error?: string };

const statusLabels: Record<ModelStatus, string> = {
  not_downloaded: "Available",
  queued: "Queued",
  downloading: "Downloading",
  cancelling: "Cancelling",
  downloaded: "Downloaded",
  failed: "Download failed",
  unavailable: "Unavailable",
};

function statusColor(status: ModelStatus) {
  if (status === "downloaded") return "hiveSuccess";
  if (status === "failed" || status === "unavailable") return "hiveError";
  if (status === "not_downloaded") return "gray";
  return "hiveSky";
}

export function ModelsPage() {
  const [models, setModels] = useState<ModelState[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<ModelId | null>(null);
  const [cancelling, setCancelling] = useState<ModelId | null>(null);
  const [category, setCategory] = useState<string>(modelGroups[0].id);
  const [selectedId, setSelectedId] = useState<ModelId | null>(modelGroups[0].modelIds[0] ?? null);

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch("/api/models");
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
      const response = await apiFetch(`/api/models/${id}/download`, {
        method: "POST",
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
      const response = await apiFetch(`/api/models/${id}/download`, { method: "DELETE" });
      const body = await response.json().catch(() => ({})) as { detail?: string };
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Could not cancel the model download. Try again.");
      await refresh();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not cancel the model download.");
    } finally {
      setCancelling(null);
    }
  };

  const activeGroup = modelGroups.find((group) => group.id === category) ?? modelGroups[0];
  const visibleDetails = modelDetails.filter((detail) => activeGroup.modelIds.includes(detail.id));
  const selectedDetail = visibleDetails.find((detail) => detail.id === selectedId) ?? visibleDetails[0];
  const selectedState = selectedDetail ? models.find((model) => model.id === selectedDetail.id) : undefined;
  const selectedStatus = selectedState?.status ?? "unavailable";
  const busy = selectedStatus === "queued" || selectedStatus === "downloading" || selectedStatus === "cancelling";
  const downloadedBytes = Math.max(0, selectedState?.downloadedBytes ?? 0);
  const progress = selectedDetail ? Math.min(100, downloadedBytes / selectedDetail.sizeBytes * 100) : 0;

  return <Stack className="workspace-page" gap="lg">
    <Group justify="flex-end" className="page-header-actions">
      <Button className="page-header-button" data-header-tone="neutral" variant="default" onClick={() => void refresh()} loading={loading}>Refresh status</Button>
    </Group>
    <Alert color="hiveSky" title="Models are downloaded on demand">
      Hive does not bundle model weights. Downloads are fetched from the model publisher and stored in the local Docker runner’s persistent cache. A model can be used after its download completes.
    </Alert>
    {pageError && <Alert color="hiveError" title="Model status unavailable" onClose={() => setPageError(null)} withCloseButton>{pageError}</Alert>}

    <Tabs value={category} onChange={(value) => {
      if (!value) return;
      const nextGroup = modelGroups.find((group) => group.id === value);
      setCategory(value);
      setSelectedId(nextGroup?.modelIds[0] ?? null);
    }} keepMounted={false}>
      <Tabs.List aria-label="Model categories">
        {modelGroups.map((group) => <Tabs.Tab key={group.id} value={group.id}>{group.title}</Tabs.Tab>)}
      </Tabs.List>
      {modelGroups.map((group) => <Tabs.Panel key={group.id} value={group.id} pt="md">
        <Stack gap="sm">
          <Text size="sm" c="dimmed">{group.description}</Text>
          <div className="inventory-layout">
            <Paper className="inventory-list" withBorder radius="md">
              <Group className="inventory-toolbar" justify="space-between">
                <Text size="xs" c="dimmed">{group.modelIds.length} models</Text>
                <Text size="xs" c="dimmed">Select a model to inspect its requirements</Text>
              </Group>
              <ScrollArea type="auto">
                <Table className="inventory-table model-inventory-table" highlightOnHover withRowBorders>
                  <Table.Thead><Table.Tr><Table.Th>Model</Table.Th><Table.Th>Download</Table.Th><Table.Th>Status</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {modelDetails.filter((detail) => group.modelIds.includes(detail.id)).map((detail) => {
                      const state = models.find((model) => model.id === detail.id);
                      const status = state?.status ?? "unavailable";
                      return <Table.Tr
                        key={detail.id}
                        className={selectedDetail?.id === detail.id ? "inventory-row-selected" : undefined}
                        tabIndex={0}
                        aria-selected={selectedDetail?.id === detail.id}
                        onClick={() => setSelectedId(detail.id)}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(detail.id); } }}
                      >
                        <Table.Td><Text fw={600} size="sm">{detail.name}</Text><Text size="xs" c="dimmed" lineClamp={1}>{detail.summary}</Text></Table.Td>
                        <Table.Td className="inventory-nowrap">{formatModelSize(detail.sizeBytes)}</Table.Td>
                        <Table.Td><Badge color={statusColor(status)} variant="light" size="sm">{loading ? "Checking…" : statusLabels[status]}</Badge></Table.Td>
                      </Table.Tr>;
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Paper>

            {selectedDetail && <Paper className="inventory-preview" withBorder radius="md" p="md">
              <Group justify="space-between" align="start" wrap="nowrap">
                <Stack gap={4}>
                  <Title order={3} size="h4">{selectedDetail.name}</Title>
                  <Text size="sm" c="dimmed">{selectedDetail.summary}</Text>
                </Stack>
                <Badge color={statusColor(selectedStatus)} variant="light">{loading ? "Checking…" : statusLabels[selectedStatus]}</Badge>
              </Group>
              <Stack gap="xs" mt="md">
                <Text size="sm" fw={600}>Recommended system requirements</Text>
                {selectedDetail.requirements.map((requirement) => <Text key={requirement} size="sm" c="dimmed">{requirement}</Text>)}
                <Text size="xs" c="dimmed">Disk and RAM figures are Hive estimates; inference needs vary by host and runtime.</Text>
              </Stack>
              {busy && <Stack gap={4} mt="md">
                <Group justify="space-between"><Text size="xs">Download progress</Text><Text size="xs" c="dimmed">{(downloadedBytes / 1_000_000_000).toFixed(1)} / {(selectedDetail.sizeBytes / 1_000_000_000).toFixed(1)} GB</Text></Group>
                <Progress value={progress} size="sm" />
              </Stack>}
              {selectedState?.error && <Alert mt="md" color="hiveError" title="Download did not finish">{selectedState.error}</Alert>}
              <Group justify="space-between" mt="lg" className="inventory-preview-actions">
                <Button component="a" href={selectedDetail.source} target="_blank" rel="noreferrer" variant="subtle" px={0}>View model card</Button>
                {busy ? <Button variant="light" color="hiveError" disabled={selectedStatus === "cancelling"} loading={cancelling === selectedDetail.id || selectedStatus === "cancelling"} onClick={() => void cancelDownload(selectedDetail.id)}>Cancel download</Button>
                  : <Button disabled={loading || !selectedState || selectedStatus === "downloaded" || selectedStatus === "unavailable"} loading={requesting === selectedDetail.id} onClick={() => void startDownload(selectedDetail.id)}>
                    {selectedStatus === "downloaded" ? "Downloaded" : selectedStatus === "failed" ? "Retry download" : "Download model"}
                  </Button>}
              </Group>
            </Paper>}
            {!selectedDetail && <Paper withBorder radius="md" p="lg"><Group justify="center"><Loader size="sm" /><Text size="sm" c="dimmed">No models in this category.</Text></Group></Paper>}
          </div>
        </Stack>
      </Tabs.Panel>)}
    </Tabs>
    {!loading && models.length === 0 && <Text size="sm" c="dimmed">Model status is not available from the runner right now.</Text>}
  </Stack>;
}
