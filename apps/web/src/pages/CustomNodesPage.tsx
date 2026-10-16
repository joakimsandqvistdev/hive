import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Group, Loader, Modal, Paper, Stack, Table, Text, TextInput, Textarea, Title, Tooltip } from "@mantine/core";
import { apiFetch } from "../apiClient";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import { PaginatedTableFooter } from "../components/PaginatedTableFooter";
import { EditIcon, TrashIcon, WorkspaceTableAction, WorkspaceTableActions } from "../components/WorkspaceTableActions";
import type { AppView } from "../navigation/navigationState";
import { WorkflowEditor } from "./WorkflowEditor";

type CustomNode = { id: string; name: string; description: string; nodeCount: number; directUsageCount: number; needsAttention: boolean; updatedAt: string };
type CustomNodePageResult = { items: CustomNode[]; page: number; pageSize: number; total: number; totalPages: number };
type Impact = { directWorkflowCount: number; directCustomNodeCount: number; affectedWorkflowCount: number; affectedCustomNodeCount: number };
const PAGE_SIZE = 10;

function editorIdFromHash() { return window.location.hash.match(/^#custom-nodes\/([^/]+)$/)?.[1] ?? null; }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)); }

export function CustomNodesPage({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const [customNodeId, setCustomNodeId] = useState<string | null>(editorIdFromHash);
  const [result, setResult] = useState<CustomNodePageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomNode | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (requestedPage = page) => {
    setLoading(true); setError(null);
    try {
      const response = await apiFetch(`/api/custom-nodes?page=${requestedPage}&pageSize=${PAGE_SIZE}`);
      const body = await response.json() as CustomNodePageResult;
      if (!response.ok) throw new Error("Could not load custom nodes.");
      setResult(body);
      if (body.totalPages > 0 && requestedPage > body.totalPages) setPage(body.totalPages);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load custom nodes."); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { const sync = () => setCustomNodeId(editorIdFromHash()); window.addEventListener("hashchange", sync); return () => window.removeEventListener("hashchange", sync); }, []);
  useEffect(() => { if (!customNodeId) void load(page); }, [customNodeId, load, page]);

  async function create() {
    setSaving(true); setError(null);
    try {
      const response = await apiFetch("/api/custom-nodes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim(), description }) });
      const body = await response.json() as { customNode?: CustomNode };
      if (!response.ok || !body.customNode) throw new Error("Could not create this custom node.");
      setCreateOpen(false); setName(""); setDescription(""); window.location.hash = `custom-nodes/${body.customNode.id}`;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create this custom node."); }
    finally { setSaving(false); }
  }

  async function requestDelete(node: CustomNode) {
    setError(null); setImpact(null); setDeleteTarget(node);
    try {
      const response = await apiFetch(`/api/custom-nodes/${node.id}/impact`);
      const body = await response.json() as Impact;
      if (!response.ok) throw new Error("Could not check which workflows use this custom node.");
      setImpact(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not check custom node usage."); setDeleteTarget(null); }
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true); setError(null);
    try {
      const response = await apiFetch(`/api/custom-nodes/${deleteTarget.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete this custom node.");
      setDeleteTarget(null); setImpact(null); await load(page);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete this custom node."); }
    finally { setDeleting(false); }
  }

  const rows = result?.items.map((item) => <Table.Tr key={item.id}>
    <Table.Td><Text fw={600}>{item.name}</Text></Table.Td>
    <Table.Td><Text size="sm" c={item.description ? undefined : "dimmed"} lineClamp={2}>{item.description || "No description"}</Text></Table.Td>
    <Table.Td><Text size="sm">{item.nodeCount} {item.nodeCount === 1 ? "node" : "nodes"}</Text></Table.Td>
    <Table.Td><Text size="sm">{item.directUsageCount} {item.directUsageCount === 1 ? "use" : "uses"}</Text></Table.Td>
    <Table.Td><Text size="sm" c="dimmed">{formatDate(item.updatedAt)}</Text></Table.Td>
    <Table.Td>{item.needsAttention ? <Tooltip label="Repair or update nested custom nodes before using this node."><Badge color="hiveWarning" variant="light">Needs attention</Badge></Tooltip> : <Badge color="hiveSuccess" variant="light">Ready</Badge>}</Table.Td>
    <Table.Td><WorkspaceTableActions>
      <WorkspaceTableAction label={`Edit ${item.name}`} onClick={() => { window.location.hash = `custom-nodes/${item.id}`; }}><EditIcon /></WorkspaceTableAction>
      <WorkspaceTableAction label={`Delete ${item.name}`} color="hiveError" onClick={() => void requestDelete(item)}><TrashIcon /></WorkspaceTableAction>
    </WorkspaceTableActions></Table.Td>
  </Table.Tr>);

  if (customNodeId) return <WorkflowEditor key={customNodeId} workflowId={customNodeId} customNodeEditor onClose={() => { window.location.hash = "custom-nodes"; }} onNavigate={onNavigate} />;

  return <Stack className="workspace-page" gap="lg">
    <Group justify="space-between" align="end"><Stack gap={3}><Text className="page-eyebrow">Workspace</Text><Title order={1} className="page-title">Custom Nodes</Title></Stack><Button onClick={() => { setError(null); setName(""); setDescription(""); setCreateOpen(true); }}>Create custom node</Button></Group>
    {error && <Alert color="hiveError" title="Custom nodes">{error}</Alert>}
    <Paper className="workspace-table-panel" withBorder>
      {loading ? <Group justify="center" p="xl"><Loader size="sm" /><Text size="sm" c="dimmed">Loading custom nodes…</Text></Group>
        : result?.total === 0 ? <Stack className="workspace-empty" align="center" gap="sm"><Badge color="hiveSky" variant="light">Reusable workflow logic</Badge><Title order={2} size="h3">No custom nodes yet</Title><Text c="dimmed" ta="center" maw={520}>Create a reusable node from a blank editor, then import workflows or build its logic inside.</Text><Button variant="light" onClick={() => setCreateOpen(true)}>Create your first custom node</Button></Stack>
          : <><Table.ScrollContainer minWidth={980}><Table verticalSpacing="sm" highlightOnHover><Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Description</Table.Th><Table.Th>Nodes</Table.Th><Table.Th>Used by</Table.Th><Table.Th>Updated</Table.Th><Table.Th>Status</Table.Th><Table.Th><span className="sr-only">Actions</span></Table.Th></Table.Tr></Table.Thead><Table.Tbody>{rows}</Table.Tbody></Table></Table.ScrollContainer><PaginatedTableFooter total={result?.total ?? 0} itemName="custom node" page={page} totalPages={result?.totalPages ?? 0} onPageChange={setPage} /></>}
    </Paper>
    <Modal opened={createOpen} onClose={() => { if (!saving) setCreateOpen(false); }} title="Create custom node" centered><Stack><TextInput label="Name" value={name} onChange={(event) => setName(event.currentTarget.value)} maxLength={100} required /><Textarea label="Description" value={description} onChange={(event) => setDescription(event.currentTarget.value)} maxLength={1000} autosize minRows={2} /><Text size="sm" c="dimmed">This creates a blank custom node editor. You can import an existing workflow into it after creation.</Text><Group justify="flex-end"><Button variant="default" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button><Button onClick={() => void create()} loading={saving} disabled={!name.trim()}>Create and edit</Button></Group></Stack></Modal>
    <ConfirmActionModal opened={deleteTarget !== null} onClose={() => { if (!deleting) { setDeleteTarget(null); setImpact(null); } }} title="Delete custom node?" confirmLabel="Delete custom node" loading={deleting || !impact} onConfirm={() => void remove()}>
      {deleteTarget && impact && <Text>“{deleteTarget.name}” is used directly by {impact.directWorkflowCount} {impact.directWorkflowCount === 1 ? "workflow" : "workflows"} and {impact.directCustomNodeCount} {impact.directCustomNodeCount === 1 ? "custom node" : "custom nodes"}. Including nested dependencies, {impact.affectedWorkflowCount} {impact.affectedWorkflowCount === 1 ? "workflow" : "workflows"} and {impact.affectedCustomNodeCount} {impact.affectedCustomNodeCount === 1 ? "custom node" : "custom nodes"} will be marked Needs attention. Missing node placeholders will remain so you can replace or remove them.</Text>}
    </ConfirmActionModal>
  </Stack>;
}
