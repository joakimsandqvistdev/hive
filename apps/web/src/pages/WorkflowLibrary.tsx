import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ActionIcon, Alert, Badge, Button, Group, Loader, Modal, Paper, Stack, Table, Text, Textarea, TextInput, Title, Tooltip } from "@mantine/core";
import { apiFetch } from "../apiClient";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import { PaginatedTableFooter } from "../components/PaginatedTableFooter";
import type { AppView } from "../navigation/navigationState";
import { emptyWorkflowForm, type Workflow, type WorkflowForm } from "./workflowTypes";
import { startWorkflowRun } from "./startWorkflowRun";

const PAGE_SIZE = 10;
type WorkflowPageResult = { items: Workflow[]; page: number; pageSize: number; total: number; totalPages: number };

function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)); }

export function WorkflowLibrary({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<WorkflowPageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpened, setFormOpened] = useState(false);
  const [form, setForm] = useState<WorkflowForm>(emptyWorkflowForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [savingForm, setSavingForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [startingRunId, setStartingRunId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

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
    setStartingRunId(item.id); setRunError(null);
    try {
      await startWorkflowRun(item.id);
      onNavigate("runs");
    } catch (error) { setRunError(error instanceof Error ? error.message : "Could not start workflow."); }
    finally { setStartingRunId(null); }
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
    setDeleting(true); setDeleteError(null);
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
    } catch (error) { setDeleteError(error instanceof Error ? error.message : "Could not remove this workflow."); }
    finally { setDeleting(false); }
  };

  const rows = result?.items.map((item) => <Table.Tr key={item.id}>
    <Table.Td><Text fw={600}>{item.name}</Text></Table.Td>
    <Table.Td><Text size="sm" c={item.description ? undefined : "dimmed"} lineClamp={2}>{item.description || "No description"}</Text></Table.Td>
    <Table.Td><Text size="sm">{item.nodeCount} {item.nodeCount === 1 ? "node" : "nodes"}</Text></Table.Td>
    <Table.Td><Text size="sm" c="dimmed">{formatDate(item.updatedAt)}</Text></Table.Td>
    <Table.Td><Group gap={4} wrap="nowrap" justify="flex-end" w="100%"><Tooltip label={`Run ${item.name}`}><span><ActionIcon variant="subtle" color="hiveSuccess" aria-label={`Run ${item.name}`} loading={startingRunId === item.id} disabled={startingRunId !== null} onClick={() => void startRun(item)}><PlayIcon /></ActionIcon></span></Tooltip><Tooltip label={`Edit ${item.name}`}><ActionIcon variant="subtle" color="hiveSky" aria-label={`Edit ${item.name}`} onClick={() => openEdit(item)}><EditIcon /></ActionIcon></Tooltip><Tooltip label={item.activeRunCount ? "This workflow is currently running" : `Remove ${item.name}`}><span><ActionIcon variant="subtle" color="hiveError" aria-label={`Remove ${item.name}`} disabled={(item.activeRunCount ?? 0) > 0} onClick={() => { setDeleteTarget(item); setDeleteError(null); }}><TrashIcon /></ActionIcon></span></Tooltip></Group></Table.Td>
  </Table.Tr>);

  return <Stack className="workspace-page" gap="lg">
    <Group justify="space-between" align="end"><Stack gap={3}><Text className="page-eyebrow">Workspace</Text><Title order={1} className="page-title">Workflows</Title></Stack><Group><Button variant="light" onClick={() => onNavigate("models")}>Manage models</Button><Button onClick={openCreate}>Create workflow</Button></Group></Group>
    {runError && <Alert color="hiveError" title="Could not start workflow" withCloseButton onClose={() => setRunError(null)}>{runError}</Alert>}
    {loadError && <Alert color="hiveError" title="Workflow list unavailable">{loadError}</Alert>}
    <Paper className="workspace-table-panel" withBorder>
      {loading ? <Group justify="center" p="xl"><Loader size="sm" /><Text size="sm" c="dimmed">Loading workflows…</Text></Group>
        : result?.total === 0 ? <Stack className="workspace-empty" align="center" gap="sm"><Badge color="hiveSky" variant="light">Workflow library</Badge><Title order={2} size="h3">No workflows yet</Title><Text c="dimmed" ta="center" maw={480}>Create a named workflow, add inputs and downloaded models, and arrange them as a connected flow.</Text><Button variant="light" onClick={openCreate}>Create your first workflow</Button></Stack>
          : <><Table.ScrollContainer minWidth={760}><Table verticalSpacing="sm" highlightOnHover><Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Description</Table.Th><Table.Th>Nodes</Table.Th><Table.Th>Updated</Table.Th><Table.Th><span className="sr-only">Actions</span></Table.Th></Table.Tr></Table.Thead><Table.Tbody>{rows}</Table.Tbody></Table></Table.ScrollContainer><PaginatedTableFooter total={result?.total ?? 0} itemName="workflow" page={page} totalPages={result?.totalPages ?? 0} onPageChange={setPage} /></>}
    </Paper>
    <Modal opened={formOpened} onClose={() => setFormOpened(false)} title="Create workflow" centered>
      <form onSubmit={(event) => void createWorkflow(event)}><Stack gap="md">{formError && <Alert color="hiveError" title="Could not create workflow">{formError}</Alert>}<><TextInput label="Name" placeholder="e.g. Create a video from a script" value={form.name} maxLength={100} onChange={(event) => { const name = event.currentTarget.value; setForm((current) => ({ ...current, name })); }} required autoFocus /><Textarea label="Description" placeholder="What should this workflow do?" value={form.description} maxLength={1000} onChange={(event) => { const description = event.currentTarget.value; setForm((current) => ({ ...current, description })); }} minRows={3} autosize /><Group justify="flex-end"><Button variant="default" type="button" onClick={() => setFormOpened(false)}>Cancel</Button><Button type="submit" loading={savingForm}>Create workflow</Button></Group></></Stack></form>
    </Modal>
    <ConfirmActionModal opened={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Confirm workflow removal" confirmLabel="Remove workflow" onConfirm={() => void removeWorkflow()} loading={deleting} disabled={(deleteTarget?.activeRunCount ?? 0) > 0}>
      {deleteTarget && <>{deleteError && <Alert color="hiveError" title="Could not remove workflow">{deleteError}</Alert>}<Text>Are you sure you want to remove <Text component="span" fw={600}>{deleteTarget.name}</Text>?</Text><Text size="sm" c="dimmed">Its nodes and connections will be deleted. This cannot be undone.</Text>{(deleteTarget.activeRunCount ?? 0) > 0 && <Alert color="hiveWarning" title="Workflow is in use">This workflow has {deleteTarget.activeRunCount} queued or running {deleteTarget.activeRunCount === 1 ? "run" : "runs"} and can’t be removed.</Alert>}</>}
    </ConfirmActionModal>
  </Stack>;
}

function EditIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 5 5 5M4 20l4.2-.8L19 8.4a2.12 2.12 0 0 0-3-3L5.2 16.2 4 20Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function PlayIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" /></svg>; }
function TrashIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 12.2a1 1 0 0 1-1 .8H7.8a1 1 0 0 1-1-.8L6 7m4 4v5m4-5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
