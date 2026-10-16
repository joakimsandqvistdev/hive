import { useCallback, useEffect, useRef, useState } from "react";
import { ActionIcon, Alert, Badge, Button, Group, Loader, Modal, NumberInput, Paper, Select, Stack, Table, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { apiFetch } from "../apiClient";
import type { AppView } from "../navigation/navigationState";
import { useFlashMessages } from "../components/FlashMessages";

type WorkflowChoice = { id: string; name: string };
type JobStatus = "active" | "paused" | "completed" | "failed";
type Job = {
  id: string; name: string; workflowId: string; workflowName: string; status: JobStatus;
  firstRunAt: string; intervalSeconds: number | null; repeatCount: number | null; completedRuns: number;
  nextRunAt: string | null; currentRunStatus: string | null; lastError: string | null;
};
type JobForm = { name: string; workflowId: string | null; firstRunAt: string; repeatMode: "once" | "count" | "forever"; repeatCount: number | string; interval: number | string; intervalUnit: string | null };
const initialForm = (): JobForm => ({ name: "", workflowId: null, firstRunAt: localInputDate(new Date()), repeatMode: "once", repeatCount: 2, interval: 1, intervalUnit: "hours" });

function localInputDate(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}
function intervalSeconds(value: number, unit: string) {
  return value * (unit === "minutes" ? 60 : unit === "days" ? 86400 : 3600);
}
function intervalLabel(seconds: number) {
  const units = [[86400, "day"], [3600, "hour"], [60, "minute"]] as const;
  const [size, label] = units.find(([unitSize]) => seconds % unitSize === 0) ?? units[2]!;
  const amount = seconds / size;
  return "every " + amount + " " + label + (amount === 1 ? "" : "s") + " after workflow generation finishes";
}
function currentActivity(job: Job) {
  return job.currentRunStatus === "queued" ? "Run queued" : job.currentRunStatus === "running" ? "Run in progress" : job.currentRunStatus === "awaiting_publish" ? "Workflow finished; publication pending" : job.currentRunStatus === "cancel_requested" ? "Stopping run" : null;
}

export function JobsPage({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const { showFlash } = useFlashMessages();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<JobForm>(initialForm);
  const [saving, setSaving] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Job | null>(null);
  const previousJobStates = useRef<Map<string, { currentRunStatus: string | null; status: JobStatus }>>(new Map());
  const hasLoadedJobStates = useRef(false);

  const refresh = useCallback(async (includeWorkflows = false) => {
    try {
      const jobsResponse = await apiFetch("/api/jobs");
      const jobsBody = await jobsResponse.json() as { jobs?: Job[] };
      if (!jobsResponse.ok) throw new Error("Could not load jobs.");
      const nextJobs = jobsBody.jobs ?? [];
      if (hasLoadedJobStates.current) {
        for (const job of nextJobs) {
          const previous = previousJobStates.current.get(job.id);
          const wasActive = previous?.currentRunStatus === "queued" || previous?.currentRunStatus === "running" || previous?.currentRunStatus === "cancel_requested";
          const isActive = job.currentRunStatus === "queued" || job.currentRunStatus === "running" || job.currentRunStatus === "cancel_requested";
          if (isActive && !wasActive) showFlash({ tone: "success", title: "Run started", message: `“${job.name}” was added to the run queue.` });
          if (job.status === "failed" && previous?.status !== "failed") showFlash({ tone: "error", title: "Job run failed", message: job.lastError ?? `The latest run for “${job.name}” could not start.` });
        }
      }
      previousJobStates.current = new Map(nextJobs.map((job) => [job.id, { currentRunStatus: job.currentRunStatus, status: job.status }]));
      hasLoadedJobStates.current = true;
      setJobs(nextJobs);
      if (includeWorkflows) {
        const firstResponse = await apiFetch("/api/workflows?page=1&pageSize=50");
        const firstPage = await firstResponse.json() as { items?: WorkflowChoice[]; totalPages?: number };
        if (!firstResponse.ok) throw new Error("Could not load workflows.");
        const allWorkflows = [...(firstPage.items ?? [])];
        for (let page = 2; page <= (firstPage.totalPages ?? 1); page += 1) {
          const response = await apiFetch("/api/workflows?page=" + page + "&pageSize=50");
          const body = await response.json() as { items?: WorkflowChoice[] };
          if (!response.ok) throw new Error("Could not load workflows.");
          allWorkflows.push(...(body.items ?? []));
        }
        setWorkflows(allWorkflows);
      }
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load jobs.");
    } finally { setLoading(false); }
  }, [showFlash]);

  useEffect(() => { void refresh(true); }, [refresh]);
  const needsPolling = jobs.some((job) => job.status === "active" || currentActivity(job) !== null);
  useEffect(() => {
    if (!needsPolling) return;
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [needsPolling, refresh]);

  const createJob = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.workflowId || !form.name.trim()) return;
    setSaving(true); setError(null);
    const repeating = form.repeatMode !== "once";
    const value = Number(form.interval);
    const count = Number(form.repeatCount);
    try {
      const response = await apiFetch("/api/jobs", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(), workflowId: form.workflowId, firstRunAt: new Date(form.firstRunAt).toISOString(),
          repeatCount: form.repeatMode === "once" ? 1 : form.repeatMode === "count" ? count : null,
          intervalSeconds: repeating ? intervalSeconds(value, form.intervalUnit ?? "hours") : null,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? "Could not create this job. Check the workflow and schedule.");
      }
      const jobName = form.name.trim();
      setFormOpen(false); setForm(initialForm()); await refresh();
      showFlash({ tone: "neutral", title: "Job scheduled", message: `“${jobName}” is ready. Its first run will start at the scheduled time.` });
    } catch (cause) { showFlash({ tone: "error", title: "Could not create job", message: cause instanceof Error ? cause.message : "Could not create this job." }); }
    finally { setSaving(false); }
  };

  const setJobStatus = async (job: Job, status: "active" | "paused") => {
    setMutatingId(job.id); setError(null);
    try {
      const response = await apiFetch("/api/jobs/" + job.id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      if (!response.ok) throw new Error("Could not update this job.");
      await refresh();
      showFlash({ tone: "success", title: status === "paused" ? "Job paused" : "Job resumed", message: `“${job.name}” was ${status === "paused" ? "paused" : "resumed"}.` });
    } catch (cause) { showFlash({ tone: "error", title: "Could not update job", message: cause instanceof Error ? cause.message : "Could not update this job." }); }
    finally { setMutatingId(null); }
  };

  const removeJob = async () => {
    if (!confirmRemove) return;
    setMutatingId(confirmRemove.id); setError(null);
    try {
      const response = await apiFetch("/api/jobs/" + confirmRemove.id, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ cancelQueuedRun: true }) });
      if (!response.ok) throw new Error("Could not remove this job.");
      const jobName = confirmRemove.name;
      setConfirmRemove(null); await refresh();
      showFlash({ tone: "success", title: "Job removed", message: `“${jobName}” was removed.` });
    } catch (cause) { showFlash({ tone: "error", title: "Could not remove job", message: cause instanceof Error ? cause.message : "Could not remove this job." }); }
    finally { setMutatingId(null); }
  };

  const rows = jobs.map((job) => {
    const activity = currentActivity(job);
    const status = job.status === "active" ? "Active" : job.status === "paused" ? "Paused" : job.status === "completed" ? "Completed" : "Needs attention";
    const color = job.status === "active" ? "hiveSuccess" : job.status === "failed" ? "hiveError" : "gray";
    return <Table.Tr key={job.id}>
      <Table.Td><Text fw={600} size="sm">{job.name}</Text><Text size="xs" c="dimmed">{job.workflowName}</Text></Table.Td>
      <Table.Td><Badge color={color} variant="light">{status}</Badge>{activity && <Text size="xs" c="dimmed" mt={4}>{activity}</Text>}{job.lastError && <Text size="xs" c="hiveError.7" mt={4} maw={360}>{job.lastError}</Text>}</Table.Td>
      <Table.Td><Text size="sm">{job.repeatCount === 1 ? "Once" : intervalLabel(job.intervalSeconds ?? 3600)}</Text><Text size="xs" c="dimmed">{job.repeatCount === null ? job.completedRuns + " completed · no limit" : job.completedRuns + " of " + job.repeatCount + " runs"}</Text></Table.Td>
      <Table.Td><Text size="sm">{activity ?? formatDate(job.nextRunAt)}</Text></Table.Td>
      <Table.Td><Group gap={4} wrap="nowrap" justify="flex-end">
        {job.status === "active" || job.status === "paused" || job.status === "failed" ? <Tooltip label={job.status === "active" ? "Pause job" : job.status === "failed" ? "Retry job" : "Resume job"}><ActionIcon variant="subtle" color={job.status === "active" ? "hiveSky" : "hiveSuccess"} aria-label={job.status === "active" ? "Pause " + job.name : "Resume " + job.name} loading={mutatingId === job.id} onClick={() => void setJobStatus(job, job.status === "active" ? "paused" : "active")}><PausePlayIcon paused={job.status !== "active"} /></ActionIcon></Tooltip> : null}
        <Tooltip label="Remove job"><ActionIcon variant="subtle" color="hiveError" aria-label={"Remove " + job.name} loading={mutatingId === job.id} onClick={() => setConfirmRemove(job)}><TrashIcon /></ActionIcon></Tooltip>
      </Group></Table.Td>
    </Table.Tr>;
  });

  const workflowOptions = workflows.map((workflow) => ({ value: workflow.id, label: workflow.name }));
  const intervalValid = Number(form.interval) >= 1 && Number.isFinite(Number(form.interval));
  const intervalSecondsValue = intervalValid ? intervalSeconds(Number(form.interval), form.intervalUnit ?? "hours") : 0;
  const intervalWithinLimit = intervalSecondsValue >= 60 && intervalSecondsValue <= 31_536_000;
  const repeatCountValid = form.repeatMode !== "count" || (Number.isInteger(Number(form.repeatCount)) && Number(form.repeatCount) >= 2 && Number(form.repeatCount) <= 10000);

  return <Stack className="workspace-page" gap="lg">
    <Group justify="flex-end" className="page-header-actions"><Button className="page-header-button" data-header-tone="neutral" variant="default" onClick={() => void refresh(true)} loading={loading}>Refresh</Button><Button className="page-header-button" data-header-tone="primary" variant="default" disabled={loading || workflows.length === 0} onClick={() => { setError(null); setForm(initialForm()); setFormOpen(true); }}>Create job</Button></Group>
    {error && <Alert color="hiveError" title="Jobs unavailable" withCloseButton onClose={() => setError(null)}>{error}</Alert>}
    <Paper className="inventory-list workspace-table-panel" withBorder radius="md">
      {loading ? <Group justify="center" p="xl"><Loader size="sm" /><Text size="sm" c="dimmed">Loading jobs…</Text></Group>
        : jobs.length === 0 ? <Stack className="workspace-empty" align="center" gap="sm"><Badge color="hiveSky" variant="light">Workflow automation</Badge><Title order={2} size="h3">No jobs yet</Title><Text c="dimmed" ta="center" maw={520}>Create a job to run a saved workflow once or repeat it on an interval. Repeats are queued only after the previous run finishes, so each job has at most one queued or active run.</Text>{workflows.length ? <Button variant="light" onClick={() => { setForm(initialForm()); setFormOpen(true); }}>Create your first job</Button> : <Button variant="light" onClick={() => onNavigate("workflows")}>Create a workflow first</Button>}</Stack>
          : <><Table.ScrollContainer minWidth={900}><Table className="inventory-table" highlightOnHover withRowBorders><Table.Thead><Table.Tr><Table.Th>Job</Table.Th><Table.Th>Status</Table.Th><Table.Th>Repeat</Table.Th><Table.Th>Next run</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{rows}</Table.Tbody></Table></Table.ScrollContainer><Text size="xs" c="dimmed" p="sm">A repeating job waits its configured interval after the previous run finishes before queueing another run.</Text></>}
    </Paper>
    <Modal opened={formOpen} onClose={() => { if (!saving) setFormOpen(false); }} title="Create job" centered>
      <form onSubmit={(event) => void createJob(event)}><Stack gap="md">
        {!workflows.length && <Alert color="hiveWarning" title="A saved workflow is required">Create a workflow before setting up a job. <Button variant="subtle" size="compact-sm" onClick={() => onNavigate("workflows")}>Go to Workflows</Button></Alert>}
        <TextInput label="Job name" placeholder="e.g. Daily image generation" value={form.name} maxLength={100} required autoFocus onChange={(event) => setForm({ ...form, name: event.currentTarget.value })} />
        <Select label="Workflow" placeholder="Choose a saved workflow" data={workflowOptions} value={form.workflowId} onChange={(workflowId) => setForm({ ...form, workflowId })} searchable required />
        <TextInput label="First run" type="datetime-local" value={form.firstRunAt} onChange={(event) => setForm({ ...form, firstRunAt: event.currentTarget.value })} required />
        <Select label="Repetition" data={[{ value: "once", label: "Run once" }, { value: "count", label: "Repeat a set number of times" }, { value: "forever", label: "Repeat indefinitely" }]} value={form.repeatMode} onChange={(repeatMode) => setForm({ ...form, repeatMode: (repeatMode as JobForm["repeatMode"]) ?? "once" })} />
        {form.repeatMode !== "once" && <Group grow align="end">
          {form.repeatMode === "count" && <NumberInput label="Total runs" min={2} max={10000} value={form.repeatCount} onChange={(repeatCount) => setForm({ ...form, repeatCount })} />}
          <NumberInput label="Interval" min={1} max={form.intervalUnit === "days" ? 365 : form.intervalUnit === "hours" ? 8760 : 525600} value={form.interval} onChange={(interval) => setForm({ ...form, interval })} />
          <Select label="Unit" data={[{ value: "minutes", label: "Minutes" }, { value: "hours", label: "Hours" }, { value: "days", label: "Days" }]} value={form.intervalUnit} onChange={(intervalUnit) => setForm({ ...form, intervalUnit })} />
        </Group>}
        {form.repeatMode !== "once" && <Text size="xs" c={intervalWithinLimit ? "dimmed" : "hiveError.7"}>The interval starts after the previous run finishes. Minimum 1 minute; maximum 365 days.</Text>}
        <Text size="xs" c="dimmed">The workflow is validated and snapshotted each time a run is queued. Repeating jobs don’t create future runs in advance.</Text>
        <Group justify="flex-end"><Button variant="default" type="button" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" loading={saving} disabled={!form.workflowId || (form.repeatMode !== "once" && (!intervalWithinLimit || !repeatCountValid))}>Create job</Button></Group>
      </Stack></form>
    </Modal>
    <Modal opened={confirmRemove !== null} onClose={() => setConfirmRemove(null)} title="Remove job?" centered>
      <Stack gap="md"><Text>Remove <strong>{confirmRemove?.name}</strong>? No future runs will be queued. Any queued run will be cancelled; a run already in progress will finish. If it is waiting for an Instagram publication, that publication stays in Runs and must still be published or discarded. Existing run history and generated media will remain in Runs.</Text><Group justify="flex-end"><Button variant="default" onClick={() => setConfirmRemove(null)}>Keep job</Button><Button color="hiveError" loading={mutatingId !== null} onClick={() => void removeJob()}>Remove job</Button></Group></Stack>
    </Modal>
  </Stack>;
}

function PausePlayIcon({ paused }: { paused: boolean }) {
  return paused
    ? <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10-6.5-10-6.5Z" /></svg>
    : <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM14 5h4v14h-4z" /></svg>;
}
function TrashIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 12.2a1 1 0 0 1-1 .8H7.8a1 1 0 0 1-1-.8L6 7m4 4v5m4-5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
