import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ActionIcon, Alert, Badge, Button, Group, Loader, Modal, Pagination, Paper, Select, Stack, Table, Text, Textarea, TextInput, Title, Tooltip } from "@mantine/core";
import { API_BASE } from "../auth";

const PAGE_SIZE = 10;
const modalityOptions = [
  { value: "text", label: "Text" },
  { value: "image", label: "Image" },
  { value: "audio", label: "Audio" },
  { value: "video", label: "Video" },
];

type Modality = "text" | "image" | "audio" | "video";
type Agent = { id: string; modality: Modality; name: string; description: string; createdAt: string; updatedAt: string; workflowUsageCount: number };
type AgentPage = { items: Agent[]; page: number; pageSize: number; total: number; totalPages: number };
type AgentForm = { modality: Modality | ""; name: string; description: string };
const emptyForm: AgentForm = { modality: "text", name: "", description: "" };

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function modalityLabel(value: Modality) {
  return modalityOptions.find((option) => option.value === value)?.label ?? value;
}

export function AgentsPage() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AgentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [form, setForm] = useState<AgentForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadAgents = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`${API_BASE}/api/agents?page=${requestedPage}&pageSize=${PAGE_SIZE}`, { credentials: "include" });
      const body = await response.json() as AgentPage & { error?: string };
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in to view your agents." : "Could not load agents. Please try again.");
      setResult(body);
      if (body.totalPages > 0 && requestedPage > body.totalPages) setPage(body.totalPages);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load agents. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAgents(page); }, [loadAgents, page]);

  const openCreate = () => {
    setEditingAgent(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpened(true);
  };

  const openEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setForm({ modality: agent.modality, name: agent.name, description: agent.description });
    setFormError(null);
    setModalOpened(true);
  };

  const openDelete = (agent: Agent) => {
    setDeleteError(null);
    setDeleteTarget(agent);
  };

  const saveAgent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.modality) { setFormError("Choose an agent type."); return; }
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch(`${API_BASE}/api/agents${editingAgent ? `/${editingAgent.id}` : ""}`, {
        method: editingAgent ? "PATCH" : "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json() as { error?: string };
      if (response.status === 409) { setFormError("An agent with this name already exists. Choose a different name."); return; }
      if (response.status === 401) { setFormError("Sign in to create or edit agents."); return; }
      if (!response.ok) { setFormError(body.error === "invalid_agent" ? "Check the name and description and try again." : "Could not save this agent. Please try again."); return; }
      setModalOpened(false);
      const nextPage = editingAgent ? page : 1;
      if (!editingAgent) setPage(1);
      await loadAgents(nextPage);
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const removeAgent = async () => {
    if (!deleteTarget || deleteTarget.workflowUsageCount > 0) return;
    setRemoving(true);
    try {
      const response = await fetch(`${API_BASE}/api/agents/${deleteTarget.id}`, { method: "DELETE", credentials: "include" });
      const body = response.status === 204 ? {} : await response.json() as { error?: string; workflowUsageCount?: number };
      if (response.status === 409) {
        const updatedTarget = { ...deleteTarget, workflowUsageCount: body.workflowUsageCount ?? 1 };
        setDeleteTarget(updatedTarget);
        setResult((current) => current ? { ...current, items: current.items.map((agent) => agent.id === updatedTarget.id ? updatedTarget : agent) } : current);
        setEditingAgent((current) => current?.id === updatedTarget.id ? updatedTarget : current);
        return;
      }
      if (response.status === 401) throw new Error("Sign in to remove agents.");
      if (!response.ok && response.status !== 404) throw new Error("Could not remove this agent.");
      if (editingAgent?.id === deleteTarget.id) setModalOpened(false);
      setDeleteTarget(null);
      await loadAgents(page);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not remove this agent. Please try again.");
    } finally {
      setRemoving(false);
    }
  };

  const rows = result?.items.map((agent) => (
    <Table.Tr key={agent.id}>
      <Table.Td><Text fw={600}>{agent.name}</Text></Table.Td>
      <Table.Td><Badge variant="light" color="hiveSky">{modalityLabel(agent.modality)}</Badge></Table.Td>
      <Table.Td><Text size="sm" c={agent.description ? undefined : "dimmed"} lineClamp={2}>{agent.description || "No description"}</Text></Table.Td>
      <Table.Td><Text size="sm" c="dimmed">{formatDate(agent.createdAt)}</Text></Table.Td>
      <Table.Td><Text size="sm" c="dimmed">{formatDate(agent.updatedAt)}</Text></Table.Td>
      <Table.Td><Text size="sm" c={agent.workflowUsageCount ? "hiveWarning.3" : "dimmed"}>{agent.workflowUsageCount ? `Used by ${agent.workflowUsageCount} ${agent.workflowUsageCount === 1 ? "workflow" : "workflows"}` : "—"}</Text></Table.Td>
      <Table.Td>
        <Group gap={4} wrap="nowrap">
          <Tooltip label={`Edit ${agent.name}`}>
            <ActionIcon type="button" variant="subtle" color="hiveSky" aria-label={`Edit ${agent.name}`} onClick={() => openEdit(agent)}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 5 5 5M4 20l4.2-.8L19 8.4a2.12 2.12 0 0 0-3-3L5.2 16.2 4 20Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </ActionIcon>
          </Tooltip>
          <Tooltip label={agent.workflowUsageCount ? "This agent is used by a workflow" : `Remove ${agent.name}`}>
            <span><ActionIcon type="button" variant="subtle" color="hiveError" aria-label={`Remove ${agent.name}`} disabled={agent.workflowUsageCount > 0} onClick={() => openDelete(agent)}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 12.2a1 1 0 0 1-1 .8H7.8a1 1 0 0 1-1-.8L6 7m4 4v5m4-5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </ActionIcon></span>
          </Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Stack className="workspace-page" gap="lg">
      <Group justify="space-between" align="end">
        <Stack gap={3}><Text className="page-eyebrow">Workspace</Text><Title order={1} className="page-title">Agents</Title></Stack>
        <Button onClick={openCreate}>Create agent</Button>
      </Group>

      {loadError && <Alert color="hiveError" title="Agent list unavailable">{loadError}</Alert>}
      <Paper className="agents-table-panel" withBorder>
        {loading ? <Group justify="center" p="xl"><Loader size="sm" /><Text size="sm" c="dimmed">Loading agents…</Text></Group>
          : result?.total === 0 ? (
            <Stack className="agents-empty" align="center" gap="sm">
              <Badge color="hiveSky" variant="light">Agent library</Badge>
              <Title order={2} size="h3">No agents yet</Title>
              <Text c="dimmed" ta="center" maw={480}>Create your first agent by choosing a modality, name, and optional description. Agents are reusable building blocks for workflows.</Text>
              <Button variant="light" onClick={openCreate}>Create your first agent</Button>
            </Stack>
          ) : (
            <>
              <Table.ScrollContainer minWidth={1020}>
                <Table verticalSpacing="sm" highlightOnHover>
                  <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Type</Table.Th><Table.Th>Description</Table.Th><Table.Th>Created</Table.Th><Table.Th>Updated</Table.Th><Table.Th>Workflow use</Table.Th><Table.Th><span className="sr-only">Actions</span></Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>{rows}</Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              <Group justify="space-between" px="md" py="sm" className="agents-table-footer">
                <Text size="sm" c="dimmed">{result?.total ?? 0} {result?.total === 1 ? "agent" : "agents"}</Text>
                <Pagination value={page} onChange={setPage} total={result?.totalPages ?? 0} size="sm" withEdges />
              </Group>
            </>
          )}
      </Paper>

      <Modal opened={modalOpened} onClose={() => setModalOpened(false)} title={editingAgent ? "Edit agent" : "Create agent"} centered>
        <form onSubmit={saveAgent}>
          <Stack gap="md">
            {formError && <Alert color="hiveError" title="Could not save agent">{formError}</Alert>}
            <Select label="Agent type" placeholder="Choose a modality" data={modalityOptions} value={form.modality} onChange={(value) => setForm((current) => ({ ...current, modality: (value ?? "") as AgentForm["modality"] }))} allowDeselect={false} required />
            <TextInput label="Name" placeholder="e.g. Story Writer" value={form.name} onChange={(event) => { const name = event.currentTarget.value; setForm((current) => ({ ...current, name })); }} maxLength={80} required autoFocus />
            <Textarea label="Description" placeholder="What should this agent be used for?" value={form.description} onChange={(event) => { const description = event.currentTarget.value; setForm((current) => ({ ...current, description })); }} maxLength={500} minRows={3} autosize />
            <Text size="xs" c="dimmed">Names must be unique in your agent library, ignoring capitalization.</Text>
            <Group justify="flex-end" mt="xs">
              {editingAgent && <Tooltip label={editingAgent.workflowUsageCount ? "This agent is used by a workflow" : "Remove agent"}><span><ActionIcon type="button" variant="subtle" color="hiveError" aria-label={`Remove ${editingAgent.name}`} disabled={editingAgent.workflowUsageCount > 0} onClick={() => openDelete(editingAgent)}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 12.2a1 1 0 0 1-1 .8H7.8a1 1 0 0 1-1-.8L6 7m4 4v5m4-5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></ActionIcon></span></Tooltip>}
              <Button variant="default" type="button" onClick={() => setModalOpened(false)}>Cancel</Button>
              <Button type="submit" loading={saving}>{editingAgent ? "Save changes" : "Create agent"}</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={deleteTarget !== null} onClose={() => { setDeleteTarget(null); setDeleteError(null); }} title="Confirm agent removal" centered>
        {deleteTarget && <Stack gap="md">
          {deleteError && <Alert color="hiveError" title="Could not remove agent">{deleteError}</Alert>}
          <Text>Are you sure you want to permanently remove <Text component="span" fw={600}>{deleteTarget.name}</Text> from your agent library?</Text>
          <Text size="sm" c="dimmed">This cannot be undone. Any agent used by a workflow must be removed from that workflow first.</Text>
          {deleteTarget.workflowUsageCount > 0 && <Alert color="hiveWarning" title="Agent is in use">This agent is used by {deleteTarget.workflowUsageCount} {deleteTarget.workflowUsageCount === 1 ? "workflow" : "workflows"} and can’t be removed.</Alert>}
          <Group justify="flex-end">
            <Button type="button" variant="default" onClick={() => { setDeleteTarget(null); setDeleteError(null); }}>Cancel</Button>
            <Button type="button" color="hiveError" onClick={() => void removeAgent()} loading={removing} disabled={deleteTarget.workflowUsageCount > 0}>Remove agent</Button>
          </Group>
        </Stack>}
      </Modal>
    </Stack>
  );
}
