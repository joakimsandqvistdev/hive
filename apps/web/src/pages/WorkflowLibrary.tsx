import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Alert, Badge, Button, Group, Loader, Modal, Paper, Stack, Table, Text, Textarea, TextInput, Title, Tooltip } from "@mantine/core";
import { apiFetch } from "../apiClient";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import { PaginatedTableFooter } from "../components/PaginatedTableFooter";
import { DuplicateIcon, EditIcon, PlayIcon, TrashIcon, WebhookIcon, WorkspaceTableAction, WorkspaceTableActions } from "../components/WorkspaceTableActions";
import type { AppView } from "../navigation/navigationState";
import { emptyWorkflowForm, type Workflow, type WorkflowForm } from "./workflowTypes";
import { startWorkflowRun } from "./startWorkflowRun";
import { useFlashMessages } from "../components/FlashMessages";
import { WorkflowTriggersModal } from "./WorkflowTriggersModal";

const PAGE_SIZE = 10;
type WorkflowPageResult = { items: Workflow[]; page: number; pageSize: number; total: number; totalPages: number };

function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)); }

export function WorkflowLibrary({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const { showFlash } = useFlashMessages();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<WorkflowPageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpened, setFormOpened] = useState(false);
  const [form, setForm] = useState<WorkflowForm>(emptyWorkflowForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [savingForm, setSavingForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [startingRunId, setStartingRunId] = useState<string | null>(null);
  const [duplicatingWorkflowId, setDuplicatingWorkflowId] = useState<string | null>(null);
  const [triggerTarget, setTriggerTarget] = useState<Workflow | null>(null);

  const loadWorkflows = useCallback(async (requestedPage: number) => {
    setLoading(true); setLoadError(null);
    try {
      const response = await apiFetch(`/api/workflows?page=${requestedPage}&pageSize=${PAGE_SIZE}`);
      const body = await response.json() as WorkflowPageResult;
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in to view your workflows." : "Could not load workflows. Please try again.");
      setResult(body);
      if (body.totalPages > 0 && requestedPage > body.totalPages) setPage(body.totalPages);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Could not load workflows."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadWorkflows(page); }, [loadWorkflows, page]);

  const openCreate = () => { setForm(emptyWorkflowForm); setFormError(null); setFormOpened(true); };
  const openEdit = (item: Workflow) => { window.location.hash = `workflows/${item.id}`; };

  const startRun = async (item: Workflow) => {
    setStartingRunId(item.id);
    try {
      await startWorkflowRun(item.id);
      showFlash({ tone: "success", title: "Run started", message: `“${item.name}” was added to the run queue.` });
    } catch (error) { showFlash({ tone: "error", title: "Could not start workflow", message: error instanceof Error ? error.message : "Could not start workflow." }); }
    finally { setStartingRunId(null); }
  };

  const duplicateWorkflow = async (item: Workflow) => {
    setDuplicatingWorkflowId(item.id);
    try {
      const response = await apiFetch(`/api/workflows/${item.id}/duplicate`, { method: "POST" });
      const body = await response.json().catch(() => ({})) as { workflow?: Workflow };
      if (!response.ok || !body.workflow) throw new Error(response.status === 401 ? "Sign in to duplicate workflows." : "Could not duplicate this workflow.");
      setPage(1); await loadWorkflows(1); showFlash({ tone: "success", title: "Workflow duplicated", message: `“${body.workflow.name}” was added to your workflows.` });
    } catch (error) { showFlash({ tone: "error", title: "Could not duplicate workflow", message: error instanceof Error ? error.message : "Could not duplicate this workflow." }); }
    finally { setDuplicatingWorkflowId(null); }
  };

  const createWorkflow = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingForm(true); setFormError(null);
    try {
      const response = await apiFetch("/api/workflows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json() as { workflow?: Workflow };
      if (!response.ok || !body.workflow) throw new Error(response.status === 401 ? "Sign in to create workflows." : "Could not create this workflow.");
      setFormOpened(false); setPage(1); await loadWorkflows(1); openEdit(body.workflow);
    } catch (error) { setFormError(error instanceof Error ? error.message : "Could not create this workflow."); }
    finally { setSavingForm(false); }
  };

  const removeWorkflow = async () => {
    if (!deleteTarget || (deleteTarget.activeRunCount ?? 0) > 0) return;
    setDeleting(true);
    try {
      const response = await apiFetch(`/api/workflows/${deleteTarget.id}`, { method: "DELETE" });
      if (response.status === 409) {
        const body = await response.json() as { activeRunCount?: number; activeJobCount?: number };
        if (body.activeJobCount) throw new Error("Pause or remove this workflow’s jobs before removing the workflow.");
        const updatedTarget = { ...deleteTarget, activeRunCount: body.activeRunCount ?? 1 };
        setDeleteTarget(updatedTarget);
        setResult((current) => current ? { ...current, items: current.items.map((item) => item.id === updatedTarget.id ? updatedTarget : item) } : current);
        return;
      }
      if (!response.ok && response.status !== 404) throw new Error("Could not remove this workflow.");
      setDeleteTarget(null); await loadWorkflows(page);
    } catch (error) { showFlash({ tone: "error", title: "Could not remove workflow", message: error instanceof Error ? error.message : "Could not remove this workflow." }); }
    finally { setDeleting(false); }
  };

  const rows = result?.items.map((item) => <Table.Tr key={item.id}>
    <Table.Td><Group gap="xs" wrap="nowrap"><Text fw={600} size="sm">{item.name}</Text>{item.needsAttention && <Tooltip label="Repair or update a custom node before running this workflow."><Badge color="hiveWarning" variant="light">Needs attention</Badge></Tooltip>}</Group></Table.Td>
    <Table.Td><Text size="sm" c={item.description ? undefined : "dimmed"} lineClamp={2}>{item.description || "No description"}</Text></Table.Td>
    <Table.Td><Text size="sm">{item.nodeCount} {item.nodeCount === 1 ? "node" : "nodes"}</Text></Table.Td>
    <Table.Td><Text size="sm" c="dimmed">{formatDate(item.updatedAt)}</Text></Table.Td>
    <Table.Td><WorkspaceTableActions>
      <WorkspaceTableAction label="Run" tooltip={item.needsAttention ? "Resolve custom node changes before running" : "Run"} color="hiveSuccess" loading={startingRunId === item.id} disabled={startingRunId !== null || item.needsAttention} onClick={() => void startRun(item)}><PlayIcon /></WorkspaceTableAction>
      <WorkspaceTableAction label="Edit" onClick={() => openEdit(item)}><EditIcon /></WorkspaceTableAction>
      <WorkspaceTableAction label="Duplicate" loading={duplicatingWorkflowId === item.id} disabled={duplicatingWorkflowId !== null} onClick={() => void duplicateWorkflow(item)}><DuplicateIcon /></WorkspaceTableAction>
      <WorkspaceTableAction label="Webhooks" tooltip="Webhooks" onClick={() => setTriggerTarget(item)}><WebhookIcon /></WorkspaceTableAction>
      <WorkspaceTableAction label="Delete" tooltip={item.activeRunCount ? "Workflow is currently running" : "Delete"} color="hiveError" disabled={(item.activeRunCount ?? 0) > 0} onClick={() => { setDeleteTarget(item); }}><TrashIcon /></WorkspaceTableAction>
    </WorkspaceTableActions></Table.Td>
  </Table.Tr>);

  return <Stack className="workspace-page" gap="lg">
    <Group justify="flex-end" className="page-header-actions"><Button className="page-header-button" data-header-tone="neutral" variant="default" onClick={() => onNavigate("models")}>Manage models</Button><Button className="page-header-button" data-header-tone="primary" variant="default" onClick={openCreate}>Create workflow</Button></Group>
    {loadError && <Alert color="hiveError" title="Workflow list unavailable">{loadError}</Alert>}
    <Paper className="inventory-list workspace-table-panel" withBorder radius="md">
      {loading ? <Group justify="center" p="xl"><Loader size="sm" /><Text size="sm" c="dimmed">Loading workflows…</Text></Group>
        : result?.total === 0 ? <Stack className="workspace-empty" align="center" gap="sm"><Badge color="hiveSky" variant="light">Workflow library</Badge><Title order={2} size="h3">No workflows yet</Title><Text c="dimmed" ta="center" maw={480}>Create a named workflow, add inputs and downloaded models, and arrange them as a connected flow.</Text><Button variant="light" onClick={openCreate}>Create your first workflow</Button></Stack>
          : <><Table.ScrollContainer minWidth={760}><Table className="inventory-table" highlightOnHover withRowBorders><Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Description</Table.Th><Table.Th>Nodes</Table.Th><Table.Th>Updated</Table.Th><Table.Th><span className="sr-only">Actions</span></Table.Th></Table.Tr></Table.Thead><Table.Tbody>{rows}</Table.Tbody></Table></Table.ScrollContainer><PaginatedTableFooter total={result?.total ?? 0} itemName="workflow" page={page} totalPages={result?.totalPages ?? 0} onPageChange={setPage} /></>}
    </Paper>
    <Modal opened={formOpened} onClose={() => setFormOpened(false)} title="Create workflow" centered>
      <form onSubmit={(event) => void createWorkflow(event)}><Stack gap="md">{formError && <Alert color="hiveError" title="Could not create workflow">{formError}</Alert>}<><TextInput label="Name" placeholder="e.g. Create a video from a script" value={form.name} maxLength={100} onChange={(event) => { const name = event.currentTarget.value; setForm((current) => ({ ...current, name })); }} required autoFocus /><Textarea label="Description" placeholder="What should this workflow do?" value={form.description} maxLength={1000} onChange={(event) => { const description = event.currentTarget.value; setForm((current) => ({ ...current, description })); }} minRows={3} autosize /><Group justify="flex-end"><Button variant="default" type="button" onClick={() => setFormOpened(false)}>Cancel</Button><Button type="submit" loading={savingForm}>Create workflow</Button></Group></></Stack></form>
    </Modal>
    <ConfirmActionModal opened={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Confirm workflow removal" confirmLabel="Remove workflow" onConfirm={() => void removeWorkflow()} loading={deleting} disabled={(deleteTarget?.activeRunCount ?? 0) > 0}>
      {deleteTarget && <><Text>Are you sure you want to remove <Text component="span" fw={600}>{deleteTarget.name}</Text>?</Text><Text size="sm" c="dimmed">Its nodes and connections will be deleted. This cannot be undone.</Text>{(deleteTarget.activeRunCount ?? 0) > 0 && <Alert color="hiveWarning" title="Workflow is in use">This workflow has {deleteTarget.activeRunCount} queued or running {deleteTarget.activeRunCount === 1 ? "run" : "runs"} and can’t be removed.</Alert>}</>}
    </ConfirmActionModal>
    <WorkflowTriggersModal workflow={triggerTarget} opened={triggerTarget !== null} onClose={() => setTriggerTarget(null)} />
  </Stack>;
}
