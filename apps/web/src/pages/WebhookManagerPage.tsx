import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, CopyButton, Drawer, Group, Loader, Modal, Paper, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { apiFetch } from "../apiClient";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import { PaginatedTableFooter } from "../components/PaginatedTableFooter";
import { useFlashMessages } from "../components/FlashMessages";
import { ActivityIcon, CopyIcon, PauseIcon, PlayIcon, TrashIcon, WorkspaceTableAction, WorkspaceTableActions } from "../components/WorkspaceTableActions";
import { WebhookTriggerDrawerContent } from "./WebhookTriggerDrawerContent";
import type { Workflow } from "./workflowTypes";
import type { AppView } from "../navigation/navigationState";

const PAGE_SIZE = 10;
type Delivery = { id: string; eventId: string; outcome: "accepted" | "rejected"; statusCode: number; errorCode: string | null; runId: string | null; receivedAt: string };
type Trigger = { id: string; workflowId: string; workflowName: string; name: string; enabled: boolean; hasSecret: boolean; endpointUrl: string | null; createdAt: string; updatedAt: string; lastDelivery: Delivery | null };
type DeliveryResult = { items?: Delivery[] };
type TriggerResult = { items?: Trigger[] };
type WorkflowResult = { items?: Workflow[]; totalPages?: number };

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function ageLabel(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (elapsed < 60_000) return "Just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function deliveryLabel(delivery: Delivery | null) {
  if (!delivery) return "No deliveries";
  return delivery.outcome === "accepted" ? "Succeeded" : delivery.errorCode?.replaceAll("_", " ") ?? `HTTP ${delivery.statusCode}`;
}

export function WebhookManagerPage({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const { showFlash } = useFlashMessages();
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "paused">("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Trigger | null>(null);
  const [createWorkflowOpen, setCreateWorkflowOpen] = useState(false);
  const [workflowChoices, setWorkflowChoices] = useState<Workflow[]>([]);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [chosenWorkflowId, setChosenWorkflowId] = useState<string | null>(null);
  const [creatingTrigger, setCreatingTrigger] = useState(false);
  const [drawerEditTriggerId, setDrawerEditTriggerId] = useState<string | null>(null);
  const [issuedCredentials, setIssuedCredentials] = useState<{ triggerId: string; secret: string; endpointUrl: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch("/api/webhooks");
      const body = await response.json() as TriggerResult & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not load webhooks.");
      setTriggers(body.items ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load webhooks.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return triggers.filter((trigger) => {
      const matchesStatus = statusFilter === "all" || (statusFilter === "enabled" ? trigger.enabled : !trigger.enabled);
      const matchesQuery = !query
        || trigger.name.toLocaleLowerCase().includes(query)
        || trigger.workflowName.toLocaleLowerCase().includes(query)
        || (trigger.endpointUrl ?? "").toLocaleLowerCase().includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [search, statusFilter, triggers]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = pageItems.find((trigger) => trigger.id === selectedId) ?? null;

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!selected) { setSelectedId(null); setDeliveries([]); return; }
    let mounted = true;
    setDeliveryLoading(true);
    void apiFetch(`/api/webhooks/triggers/${selected.id}/deliveries`)
      .then(async (response) => {
        const body = await response.json() as DeliveryResult;
        if (!response.ok) throw new Error("Could not load delivery history.");
        if (mounted) setDeliveries(body.items ?? []);
      })
      .catch((cause) => { if (mounted) showFlash({ tone: "error", title: "Delivery history unavailable", message: cause instanceof Error ? cause.message : "Could not load delivery history." }); })
      .finally(() => { if (mounted) setDeliveryLoading(false); });
    return () => { mounted = false; };
  }, [selected?.id, showFlash]);

  const loadWorkflowChoices = async () => {
    setWorkflowLoading(true);
    try {
      const firstResponse = await apiFetch("/api/workflows?page=1&pageSize=50");
      const first = await firstResponse.json() as WorkflowResult;
      if (!firstResponse.ok) throw new Error("Could not load workflows.");
      const all = [...(first.items ?? [])];
      for (let requestedPage = 2; requestedPage <= (first.totalPages ?? 1); requestedPage += 1) {
        const response = await apiFetch(`/api/workflows?page=${requestedPage}&pageSize=50`);
        const body = await response.json() as WorkflowResult;
        if (!response.ok) throw new Error("Could not load workflows.");
        all.push(...(body.items ?? []));
      }
      setWorkflowChoices(all.filter((workflow) => !workflow.isCustomNode));
      setChosenWorkflowId(null);
      setCreateWorkflowOpen(true);
    } catch (cause) {
      showFlash({ tone: "error", title: "Could not start webhook setup", message: cause instanceof Error ? cause.message : "Could not load workflows." });
    } finally { setWorkflowLoading(false); }
  };

  const createTriggerForWorkflow = async (workflow: Workflow) => {
    setCreatingTrigger(true);
    try {
      const response = await apiFetch(`/api/webhooks/workflows/${workflow.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Workflow webhook", inputMappings: [], enabled: false }),
      });
      const body = await response.json() as { trigger?: Omit<Trigger, "workflowId" | "lastDelivery"> & { workflowId?: string }; secret?: string; endpointUrl?: string | null; error?: string };
      if (!response.ok || !body.trigger || !body.secret || !body.endpointUrl) throw new Error(body.error ?? "Could not create the webhook.");
      const created: Trigger = { ...body.trigger, workflowId: workflow.id, workflowName: workflow.name, lastDelivery: null, enabled: false, hasSecret: true, endpointUrl: body.endpointUrl };
      setTriggers((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setSearch("");
      setPage(1);
      setCreateWorkflowOpen(false);
      setSelectedId(created.id);
      setDrawerEditTriggerId(created.id);
      setIssuedCredentials({ triggerId: created.id, secret: body.secret, endpointUrl: body.endpointUrl });
      showFlash({ tone: "success", title: "Webhook created", message: "It is paused until you finish configuring its inputs and enable it." });
    } catch (cause) {
      setChosenWorkflowId(null);
      showFlash({ tone: "error", title: "Could not create webhook", message: cause instanceof Error ? cause.message.replaceAll("_", " ") : "Could not create the webhook." });
    } finally { setCreatingTrigger(false); }
  };

  const updateEnabled = async (trigger: Trigger) => {
    setBusyId(trigger.id);
    try {
      const response = await apiFetch(`/api/webhooks/triggers/${trigger.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !trigger.enabled }) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not update this webhook.");
      setTriggers((current) => current.map((item) => item.id === trigger.id ? { ...item, enabled: !trigger.enabled } : item));
      showFlash({ tone: "success", title: trigger.enabled ? "Webhook paused" : "Webhook enabled", message: `"${trigger.name}" was ${trigger.enabled ? "paused" : "enabled"}.` });
    } catch (cause) {
      showFlash({ tone: "error", title: "Could not update webhook", message: cause instanceof Error ? cause.message : "Could not update this webhook." });
    } finally { setBusyId(null); }
  };

  const removeTrigger = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      const response = await apiFetch(`/api/webhooks/triggers/${deleteTarget.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not delete this webhook.");
      showFlash({ tone: "success", title: "Webhook deleted", message: `"${deleteTarget.name}" can no longer receive requests.` });
      setTriggers((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      if (selectedId === deleteTarget.id) { setSelectedId(null); setDrawerEditTriggerId(null); setIssuedCredentials(null); }
    } catch (cause) {
      showFlash({ tone: "error", title: "Could not delete webhook", message: cause instanceof Error ? cause.message : "Could not delete this webhook." });
    } finally { setBusyId(null); }
  };

  const workflowForTrigger = (trigger: Trigger): Workflow => ({ id: trigger.workflowId, name: trigger.workflowName, description: "", nodeCount: 0, connectionCount: 0, createdAt: trigger.createdAt, updatedAt: trigger.updatedAt });

  const rows = pageItems.map((trigger) => {
    const openEdit = () => { setDrawerEditTriggerId(trigger.id); setSelectedId(trigger.id); };
    const openActivity = () => { setDrawerEditTriggerId(null); setSelectedId(trigger.id); };
    return <Table.Tr key={trigger.id} className={selected?.id === trigger.id ? "inventory-row-selected webhook-manager-row" : "webhook-manager-row"} tabIndex={0} aria-label={`Edit webhook ${trigger.name}`} onClick={openEdit} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openEdit(); } }}>
      <Table.Td><Text className="inventory-row-title" fw={600} size="sm">{trigger.name}</Text><Text size="xs" c="dimmed">{formatDate(trigger.updatedAt)}</Text></Table.Td>
      <Table.Td><Text size="sm" lineClamp={1}>{trigger.workflowName}</Text></Table.Td>
      <Table.Td><Badge color={trigger.enabled ? "hiveSuccess" : "gray"} variant="light">{trigger.enabled ? "Enabled" : "Paused"}</Badge></Table.Td>
      <Table.Td>{trigger.lastDelivery ? <><Text size="sm" c={trigger.lastDelivery.outcome === "accepted" ? "hiveSuccess.7" : "hiveError.7"}>{deliveryLabel(trigger.lastDelivery)}</Text><Text size="xs" c="dimmed">{ageLabel(trigger.lastDelivery.receivedAt)}</Text></> : <Text size="sm" c="dimmed">No deliveries</Text>}</Table.Td>
      <Table.Td className="webhook-manager-actions-cell" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <WorkspaceTableActions className="webhook-manager-actions">
          <WorkspaceTableAction label={trigger.enabled ? "Disable webhook" : "Enable webhook"} tooltip={trigger.enabled ? "Disable webhook" : "Enable webhook"} color={trigger.enabled ? "gray" : "hiveSuccess"} disabled={busyId === trigger.id} loading={busyId === trigger.id} onClick={() => void updateEnabled(trigger)}>{trigger.enabled ? <PauseIcon /> : <PlayIcon />}</WorkspaceTableAction>
          <CopyButton value={trigger.endpointUrl ?? ""} timeout={1600}>{({ copied, copy }) => <WorkspaceTableAction label={copied ? "Endpoint URL copied" : "Copy endpoint URL"} tooltip={copied ? "Endpoint URL copied" : "Copy endpoint URL"} color={copied ? "hiveSuccess" : "gray"} disabled={!trigger.endpointUrl} onClick={() => void copy()}><CopyIcon /></WorkspaceTableAction>}</CopyButton>
          <WorkspaceTableAction label="Recent deliveries" tooltip="View recent deliveries" color="hiveSky" onClick={openActivity}><ActivityIcon /></WorkspaceTableAction>
          <WorkspaceTableAction label="Delete webhook" tooltip="Delete webhook" color="hiveError" disabled={busyId === trigger.id} onClick={() => setDeleteTarget(trigger)}><TrashIcon /></WorkspaceTableAction>
        </WorkspaceTableActions>
      </Table.Td>
    </Table.Tr>;
  });

  return <Stack className="workspace-page webhook-manager-page" gap="lg">
    <Group justify="flex-end" className="page-header-actions">
      <Button className="page-header-button" data-header-tone="neutral" variant="default" onClick={() => void refresh()} loading={loading}>Refresh</Button>
      <Button className="page-header-button" data-header-tone="primary" variant="default" onClick={() => void loadWorkflowChoices()} loading={workflowLoading}>Create webhook</Button>
    </Group>
    {error && <Alert color="hiveError" title="Webhook list unavailable">{error}</Alert>}
    {loading ? <Paper className="inventory-list" withBorder radius="md"><Group justify="center" p="xl"><Loader size="sm" /><Text size="sm" c="dimmed">Loading webhooks...</Text></Group></Paper>
      : triggers.length === 0 ? <Paper className="inventory-list webhook-manager-empty" withBorder radius="md"><Stack align="center" gap="sm"><Badge color="hiveSky" variant="light">Workflow triggers</Badge><Text fw={600}>No webhooks yet</Text><Text size="sm" c="dimmed" ta="center" maw={460}>Create a signed webhook to start a workflow from an external service.</Text><Button onClick={() => void loadWorkflowChoices()}>Create webhook</Button></Stack></Paper>
        : <Paper className="inventory-list workspace-table-panel webhook-manager-table-panel" withBorder radius="md">
            <Group className="inventory-toolbar webhook-manager-toolbar" justify="space-between" wrap="wrap">
              <Group className="webhook-manager-filters" gap="xs" wrap="wrap">
                <TextInput aria-label="Search webhooks" placeholder="Search webhook, workflow, or endpoint URL" leftSection={<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.4" /><path d="m10.1 10.1 3.3 3.3" /></svg>} value={search} onChange={(event) => { setSearch(event.currentTarget.value); setPage(1); }} className="webhook-manager-search" />
                <Select aria-label="Filter webhooks by status" className="webhook-manager-status-filter" value={statusFilter} data={[{ value: "all", label: "All statuses" }, { value: "enabled", label: "Enabled" }, { value: "paused", label: "Paused" }]} onChange={(value) => { if (value === "all" || value === "enabled" || value === "paused") { setStatusFilter(value); setPage(1); } }} />
              </Group>
              <Text size="xs" c="dimmed">{filtered.length} {filtered.length === 1 ? "webhook" : "webhooks"}</Text>
            </Group>
            {filtered.length === 0 ? <Text p="md" size="sm" c="dimmed">No webhooks match the current filters.</Text>
              : <><Table.ScrollContainer minWidth={700}><Table className="inventory-table webhook-manager-list" highlightOnHover withRowBorders><Table.Thead><Table.Tr><Table.Th>Webhook</Table.Th><Table.Th>Workflow</Table.Th><Table.Th>Status</Table.Th><Table.Th>Last delivery</Table.Th><Table.Th aria-label="Actions" /></Table.Tr></Table.Thead><Table.Tbody>{rows}</Table.Tbody></Table></Table.ScrollContainer>
                <PaginatedTableFooter total={filtered.length} itemName="webhook" page={page} pageSize={PAGE_SIZE} totalPages={totalPages} onPageChange={setPage} />
              </>}
          </Paper>}
    <Drawer opened={Boolean(selected)} onClose={() => { setSelectedId(null); setDrawerEditTriggerId(null); setIssuedCredentials(null); }} position="right" size="min(710px, 100vw)" title={selected ? <Group justify="space-between" wrap="nowrap" pr="md"><Stack gap={0} style={{ minWidth: 0 }}><Text className="inventory-row-title" fw={650} size="md" lineClamp={1}>{selected.name}</Text><Text size="xs" c="dimmed" lineClamp={1}>{selected.workflowName}</Text></Stack><Badge color={selected.enabled ? "hiveSuccess" : "gray"} variant="light">{selected.enabled ? "Enabled" : "Paused"}</Badge></Group> : null} classNames={{ root: "webhook-manager-drawer-root", content: "webhook-manager-drawer-content" }} styles={{ root: { top: 64, bottom: 0, height: "auto" }, inner: { height: "100%", minHeight: 0 }, content: { height: "100%", minHeight: 0, maxHeight: "100%" } }} transitionProps={{ transition: "slide-left", duration: 180 }} overlayProps={{ backgroundOpacity: 0.18 }} padding="md">
      {selected && <>
      {drawerEditTriggerId === selected.id ? <WebhookTriggerDrawerContent workflow={workflowForTrigger(selected)} opened initialTriggerId={selected.id} initialCredentials={issuedCredentials?.triggerId === selected.id ? issuedCredentials : null} onSaved={() => void refresh()} /> : <Stack gap="sm">
        <div className="webhook-delivery-summary"><div><Text fw={700}>{deliveries.length}</Text><Text size="xs" c="dimmed">Recent</Text></div><div><Text fw={700} c="hiveSuccess.7">{deliveries.filter((item) => item.outcome === "accepted").length}</Text><Text size="xs" c="dimmed">Succeeded</Text></div><div><Text fw={700} c="hiveError.7">{deliveries.filter((item) => item.outcome === "rejected").length}</Text><Text size="xs" c="dimmed">Failed</Text></div></div>
        <Group justify="space-between" align="center"><Text size="sm" fw={650}>Recent deliveries</Text><Text size="xs" c="dimmed">Latest 50 | last 30 days</Text></Group>
        {deliveryLoading ? <Group justify="center" py="md"><Loader size="xs" /></Group> : deliveries.length ? <div className="webhook-deliveries-scroll"><Table className="inventory-table webhook-delivery-table" withRowBorders><Table.Thead><Table.Tr><Table.Th>Event</Table.Th><Table.Th>Result</Table.Th><Table.Th>HTTP</Table.Th><Table.Th>Age</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{deliveries.map((delivery) => <Table.Tr key={delivery.id}>
          <Table.Td><Text size="xs" ff="monospace" title={delivery.eventId}>{delivery.eventId.slice(0, 12)}{delivery.eventId.length > 12 ? "..." : ""}</Text>{delivery.runId && <Button variant="subtle" size="compact-xs" px={0} onClick={() => { onNavigate("runs"); window.location.hash = `runs/${delivery.runId}`; }}>Open run</Button>}</Table.Td>
          <Table.Td><Badge size="xs" color={delivery.outcome === "accepted" ? "hiveSuccess" : "hiveError"} variant="light">{delivery.outcome === "accepted" ? "Succeeded" : delivery.errorCode?.replaceAll("_", " ") ?? "Failed"}</Badge></Table.Td>
          <Table.Td className="inventory-nowrap">{delivery.statusCode}</Table.Td><Table.Td className="inventory-nowrap" title={formatDate(delivery.receivedAt)}>{ageLabel(delivery.receivedAt)}</Table.Td>
        </Table.Tr>)}</Table.Tbody></Table></div> : <Text size="sm" c="dimmed">No deliveries recorded for this webhook.</Text>}
      </Stack>
      }
      </>}
    </Drawer>
    <Modal opened={createWorkflowOpen} onClose={() => setCreateWorkflowOpen(false)} title="Create webhook" centered size="sm" classNames={{ content: "webhook-flow-modal-content" }}>
      <Stack gap="md"><Text size="sm" c="dimmed">Choose the workflow that this signed webhook will start. The trigger will be created paused so you can configure any required media inputs before enabling it.</Text><Select label="Workflow" placeholder="Select a workflow" data={workflowChoices.map((workflow) => ({ value: workflow.id, label: workflow.name }))} value={chosenWorkflowId} onChange={(workflowId) => { setChosenWorkflowId(workflowId); const workflow = workflowChoices.find((item) => item.id === workflowId); if (workflow) void createTriggerForWorkflow(workflow); }} searchable disabled={creatingTrigger} nothingFoundMessage="No workflows found" /><Group justify="flex-end"><Button variant="default" disabled={creatingTrigger} onClick={() => setCreateWorkflowOpen(false)}>Cancel</Button>{creatingTrigger && <Loader size="xs" />}</Group></Stack>
    </Modal>
    <ConfirmActionModal modalClassName="webhook-flow-modal-content" opened={deleteTarget !== null} onClose={() => { if (busyId === null) setDeleteTarget(null); }} title="Delete webhook?" confirmLabel="Delete webhook" loading={busyId === deleteTarget?.id} onConfirm={() => void removeTrigger()}>
      <Text size="sm">Delete "{deleteTarget?.name}"? Its endpoint and signing secret will stop working immediately. Delivery history will expire on its normal schedule.</Text>
    </ConfirmActionModal>
  </Stack>;
}

