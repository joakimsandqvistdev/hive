import { Badge, CopyButton, Group, Paper, Select, Table, Text, TextInput } from "@mantine/core";
import { PaginatedTableFooter } from "../components/PaginatedTableFooter";
import { ActivityIcon, CopyIcon, PauseIcon, PlayIcon, TrashIcon, WorkspaceTableAction, WorkspaceTableActions } from "../components/WorkspaceTableActions";
import type { WebhookDelivery, WebhookTrigger } from "./webhookManagerTypes";

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ageLabel(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (elapsed < 60_000) return "Just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function deliveryLabel(delivery: WebhookDelivery) {
  return delivery.outcome === "accepted" ? "Succeeded" : delivery.errorCode?.replaceAll("_", " ") ?? `HTTP ${delivery.statusCode}`;
}

type Props = {
  triggers: WebhookTrigger[];
  filteredCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: "all" | "enabled" | "paused";
  onStatusFilterChange: (value: "all" | "enabled" | "paused") => void;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  selectedId: string | null;
  busyId: string | null;
  onOpenEdit: (trigger: WebhookTrigger) => void;
  onOpenActivity: (trigger: WebhookTrigger) => void;
  onToggleEnabled: (trigger: WebhookTrigger) => void;
  onDelete: (trigger: WebhookTrigger) => void;
};

export function WebhookManagerList({ triggers, filteredCount, search, onSearchChange, statusFilter, onStatusFilterChange, page, pageSize, totalPages, onPageChange, selectedId, busyId, onOpenEdit, onOpenActivity, onToggleEnabled, onDelete }: Props) {
  return <Paper className="inventory-list workspace-table-panel webhook-manager-table-panel" withBorder radius="md">
    <Group className="inventory-toolbar webhook-manager-toolbar" justify="space-between" wrap="wrap">
      <Group className="webhook-manager-filters" gap="xs" wrap="wrap">
        <TextInput aria-label="Search webhooks" placeholder="Search webhook, workflow, or endpoint URL" leftSection={<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.4" /><path d="m10.1 10.1 3.3 3.3" /></svg>} value={search} onChange={(event) => onSearchChange(event.currentTarget.value)} className="webhook-manager-search" />
        <Select aria-label="Filter webhooks by status" className="webhook-manager-status-filter" value={statusFilter} data={[{ value: "all", label: "All statuses" }, { value: "enabled", label: "Enabled" }, { value: "paused", label: "Paused" }]} onChange={(value) => { if (value === "all" || value === "enabled" || value === "paused") onStatusFilterChange(value); }} />
      </Group>
      <Text size="xs" c="dimmed">{filteredCount} {filteredCount === 1 ? "webhook" : "webhooks"}</Text>
    </Group>
    {filteredCount === 0 ? <Text p="md" size="sm" c="dimmed">No webhooks match the current filters.</Text>
      : <><Table.ScrollContainer minWidth={700}><Table className="inventory-table webhook-manager-list" highlightOnHover withRowBorders>
        <Table.Thead><Table.Tr><Table.Th>Webhook</Table.Th><Table.Th>Workflow</Table.Th><Table.Th>Status</Table.Th><Table.Th>Last delivery</Table.Th><Table.Th aria-label="Actions" /></Table.Tr></Table.Thead>
        <Table.Tbody>{triggers.map((trigger) => {
          const openEdit = () => onOpenEdit(trigger);
          const openActivity = () => onOpenActivity(trigger);
          return <Table.Tr key={trigger.id} className={selectedId === trigger.id ? "inventory-row-selected webhook-manager-row" : "webhook-manager-row"} tabIndex={0} aria-label={`Edit webhook ${trigger.name}`} onClick={openEdit} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openEdit(); } }}>
            <Table.Td><Text className="inventory-row-title" fw={600} size="sm">{trigger.name}</Text><Text size="xs" c="dimmed">{formatDate(trigger.updatedAt)}</Text></Table.Td>
            <Table.Td><Text size="sm" lineClamp={1}>{trigger.workflowName}</Text></Table.Td>
            <Table.Td><Badge color={trigger.enabled ? "hiveSuccess" : "gray"} variant="light">{trigger.enabled ? "Enabled" : "Paused"}</Badge></Table.Td>
            <Table.Td>{trigger.lastDelivery ? <><Text size="sm" c={trigger.lastDelivery.outcome === "accepted" ? "hiveSuccess.7" : "hiveError.7"}>{deliveryLabel(trigger.lastDelivery)}</Text><Text size="xs" c="dimmed">{ageLabel(trigger.lastDelivery.receivedAt)}</Text></> : <Text size="sm" c="dimmed">No deliveries</Text>}</Table.Td>
            <Table.Td className="webhook-manager-actions-cell" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
              <WorkspaceTableActions className="webhook-manager-actions">
                <WorkspaceTableAction label={trigger.enabled ? "Disable webhook" : "Enable webhook"} tooltip={trigger.enabled ? "Disable webhook" : "Enable webhook"} color={trigger.enabled ? "gray" : "hiveSuccess"} disabled={busyId === trigger.id} loading={busyId === trigger.id} onClick={() => onToggleEnabled(trigger)}>{trigger.enabled ? <PauseIcon /> : <PlayIcon />}</WorkspaceTableAction>
                <CopyButton value={trigger.endpointUrl ?? ""} timeout={1600}>{({ copied, copy }) => <WorkspaceTableAction label={copied ? "Endpoint URL copied" : "Copy endpoint URL"} tooltip={copied ? "Endpoint URL copied" : "Copy endpoint URL"} color={copied ? "hiveSuccess" : "gray"} disabled={!trigger.endpointUrl} onClick={() => void copy()}><CopyIcon /></WorkspaceTableAction>}</CopyButton>
                <WorkspaceTableAction label="Recent deliveries" tooltip="View recent deliveries" color="hiveSky" onClick={openActivity}><ActivityIcon /></WorkspaceTableAction>
                <WorkspaceTableAction label="Delete webhook" tooltip="Delete webhook" color="hiveError" disabled={busyId === trigger.id} onClick={() => onDelete(trigger)}><TrashIcon /></WorkspaceTableAction>
              </WorkspaceTableActions>
            </Table.Td>
          </Table.Tr>;
        })}</Table.Tbody>
      </Table></Table.ScrollContainer>
      <PaginatedTableFooter total={filteredCount} itemName="webhook" page={page} pageSize={pageSize} totalPages={totalPages} onPageChange={onPageChange} /></>}
  </Paper>;
}
