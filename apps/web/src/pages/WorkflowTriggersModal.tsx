import { useEffect, useMemo, useRef, useState } from "react";
import { ActionIcon, Alert, Badge, Button, Code, CopyButton, Group, Loader, Modal, Paper, Select, Stack, Switch, Table, Text, TextInput, Textarea, Tooltip } from "@mantine/core";
import { apiFetch } from "../apiClient";
import { useFlashMessages } from "../components/FlashMessages";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import type { Workflow } from "./workflowTypes";

type InputNode = { id: string; label: string; dataTypeId: string; configured: boolean };
type WebhookTextInput = { nodeId: string; label: string; jsonPath: string; defaultText: string; configured: boolean };
type Mapping = { nodeId: string; source: "payload" | "library"; path?: string; artifactId?: string };
type Trigger = { id: string; name: string; workflowName: string; enabled: boolean; hasSecret: boolean; endpointUrl: string | null; inputMappings: Mapping[]; createdAt: string; updatedAt: string };
type Delivery = { id: string; eventId: string; outcome: "accepted" | "rejected"; statusCode: number; errorCode: string | null; runId: string | null; receivedAt: string };
type MediaItem = { id: string; dataTypeId: string; displayName: string; mediaType: string; byteSize: number };
type InputSource = { mode: "library"; artifactId: string } | { mode: "unchanged" };
type TriggerPage = { workflow: { id: string; name: string }; inputNodes: InputNode[]; webhookTextInputs: WebhookTextInput[]; triggers: Trigger[]; publicApiConfigured: boolean };

function pathValue(value: unknown, path: string): unknown {
  let current = value;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !Object.hasOwn(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function examplePayloadFor(inputs: WebhookTextInput[]): string {
  const payload: Record<string, unknown> = {};
  for (const input of inputs) {
    const parts = input.jsonPath.split(".");
    let current = payload;
    for (const [index, part] of parts.entries()) {
      if (index === parts.length - 1) current[part] = `Example text for ${input.label}`;
      else {
        const nested = current[part];
        if (!nested || typeof nested !== "object" || Array.isArray(nested)) current[part] = {};
        current = current[part] as Record<string, unknown>;
      }
    }
  }
  return JSON.stringify(payload, null, 2);
}

function errorMessage(error: string) {
  const messages: Record<string, string> = {
    webhook_encryption_not_configured: "Configure WEBHOOK_SECRET_ENCRYPTION_KEY in .env and restart Hive before creating or rotating webhook triggers.",
    webhook_public_url_not_configured: "Set WEBHOOK_PUBLIC_API_URL to a public HTTPS API origin, such as your Cloudflare Tunnel URL, before creating a trigger.",
    workflow_needs_attention: "Repair this workflow before adding a trigger.",
    invalid_input_mapping: "Check that each mapping targets a compatible workflow input.",
    webhook_identifier_conflict: "Resolve duplicate or overlapping webhook identifiers in the workflow or its nested Custom Nodes.",
    webhook_contract_in_use: "Delete the existing webhook trigger before changing its input identifiers. Update the external sender, then create a new trigger.",
    invalid_media_mapping: "Choose a saved library asset that matches the input type.",
    required_input_unmapped: "Map every required input or configure a value on that workflow input node.",
    required_input_missing: "The sample payload is missing a mapped value.",
    invalid_payload: "Enter a valid JSON object with the values expected by this trigger.",
  };
  return messages[error] ?? error.replaceAll("_", " ");
}

export function WorkflowTriggersModal({ workflow, opened, onClose }: { workflow: Workflow | null; opened: boolean; onClose: () => void }) {
  const { showFlash } = useFlashMessages();
  const [page, setPage] = useState<TriggerPage | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [deliveries, setDeliveries] = useState<Record<string, Delivery[]>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("Workflow webhook");
  const [sources, setSources] = useState<Record<string, InputSource>>({});
  const [sample, setSample] = useState("{}\n");
  const sampleEdited = useRef(false);
  const [preview, setPreview] = useState<Array<{ nodeId?: string; label: string; value: string }> | null>(null);
  const [issued, setIssued] = useState<{ secret: string; endpointUrl: string } | null>(null);
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Trigger | null>(null);
  const [testRunTarget, setTestRunTarget] = useState<Trigger | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [updatingTriggerId, setUpdatingTriggerId] = useState<string | null>(null);

  async function refresh() {
    if (!workflow) return;
    setLoading(true); setError(null);
    try {
      const [triggerResponse, mediaResponse] = await Promise.all([
        apiFetch(`/api/webhooks/workflows/${workflow.id}`), apiFetch("/api/webhooks/library-media"),
      ]);
      const triggerBody = await triggerResponse.json() as TriggerPage & { error?: string };
      const mediaBody = await mediaResponse.json() as { items?: MediaItem[] };
      if (!triggerResponse.ok) throw new Error(triggerBody.error ?? "Could not load webhook triggers.");
      if (!mediaResponse.ok) throw new Error("Could not load saved Media Library assets.");
      setPage(triggerBody); setMedia(mediaBody.items ?? []);
      if (!sampleEdited.current) {
        setSample(triggerBody.webhookTextInputs?.length ? examplePayloadFor(triggerBody.webhookTextInputs) : "{}\n");
      }
      const histories = await Promise.all((triggerBody.triggers ?? []).map(async (trigger) => {
        const response = await apiFetch(`/api/webhooks/triggers/${trigger.id}/deliveries`);
        const body = await response.json() as { items?: Delivery[] };
        return [trigger.id, response.ok ? body.items ?? [] : []] as const;
      }));
      setDeliveries(Object.fromEntries(histories));
    } catch (cause) { setError(errorMessage(cause instanceof Error ? cause.message : "Could not load webhook triggers.")); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!opened || !workflow) return;
    sampleEdited.current = false;
    setPage(null); setMedia([]); setDeliveries({});
    setName("Workflow webhook"); setSources({}); setSample("{}\n"); setPreview(null); setIssued(null); setEditingTriggerId(null);
    void refresh();
  }, [opened, workflow?.id]);

  const payloadPreview = useMemo(() => {
    let parsed: unknown;
    try { parsed = JSON.parse(sample); } catch { return null; }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const textInputs = (page?.webhookTextInputs ?? []).map((node): { label: string; value: string } => {
      const value = pathValue(parsed, node.jsonPath);
      if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
        return { label: `${node.label} · ${node.jsonPath}`, value: node.configured ? "Using configured text" : "Missing required text" };
      }
      if (typeof value === "object") return { label: `${node.label} · ${node.jsonPath}`, value: "Unsupported value" };
      return { label: `${node.label} · ${node.jsonPath}`, value: String(value) };
    });
    const mediaInputs = (page?.inputNodes ?? []).filter((node) => node.dataTypeId !== "text").flatMap((node): Array<{ label: string; value: string }> => {
      const source = sources[node.id] ?? { mode: "unchanged" as const };
      if (source.mode === "library") {
        const asset = media.find((item) => item.id === source.artifactId);
        return [{ label: node.label, value: asset ? `Saved media: ${asset.displayName}` : "Choose saved media" }];
      }
      return node.configured ? [] : [{ label: node.label, value: "Needs a value or mapping" }];
    });
    return [...textInputs, ...mediaInputs];
  }, [media, page?.inputNodes, sample, sources]);
  const examplePayload = useMemo(() => {
    const inputs = page?.webhookTextInputs ?? [];
    return inputs.length ? examplePayloadFor(inputs) : null;
  }, [page?.webhookTextInputs]);

  function mappings(): Mapping[] {
    const payloadMappings = (page?.webhookTextInputs ?? []).map((input): Mapping => ({ nodeId: input.nodeId, source: "payload", path: input.jsonPath }));
    const mediaMappings = Object.entries(sources).flatMap<Mapping>(([nodeId, source]) => source.mode === "library" && source.artifactId
        ? [{ nodeId, source: "library" as const, artifactId: source.artifactId }]
        : []);
    return [...payloadMappings, ...mediaMappings];
  }

  function editTrigger(trigger: Trigger) {
    setEditingTriggerId(trigger.id);
    setName(trigger.name);
    setSources(Object.fromEntries(trigger.inputMappings.filter((mapping) => mapping.source === "library").map((mapping) => [mapping.nodeId, { mode: "library" as const, artifactId: mapping.artifactId ?? "" }])));
  }

  async function saveTrigger() {
    if (!workflow) return;
    setBusy(true); setError(null); setIssued(null);
    try {
      const response = await apiFetch(editingTriggerId ? `/api/webhooks/triggers/${editingTriggerId}` : `/api/webhooks/workflows/${workflow.id}`, { method: editingTriggerId ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, inputMappings: mappings() }) });
      const body = await response.json() as { trigger?: Trigger; secret?: string; endpointUrl?: string; error?: string };
      if (!response.ok || !body.trigger) throw new Error(body.error ?? "Could not save the webhook trigger.");
      if (!editingTriggerId) {
        if (!body.secret || !body.endpointUrl) throw new Error(body.error ?? "Could not create the webhook trigger.");
        setIssued({ secret: body.secret, endpointUrl: body.endpointUrl });
      }
      setEditingTriggerId(null); setName("Workflow webhook"); setSources({});
      await refresh();
      showFlash({ tone: "success", title: editingTriggerId ? "Webhook trigger updated" : "Webhook trigger created", message: editingTriggerId ? "The trigger settings were updated." : "Copy the signing secret now. Hive only shows it once." });
    } catch (cause) { setError(errorMessage(cause instanceof Error ? cause.message : "Could not save the webhook trigger.")); }
    finally { setBusy(false); }
  }

  async function updateTrigger(trigger: Trigger, update: { enabled?: boolean }) {
    setError(null); setUpdatingTriggerId(trigger.id);
    try {
      const response = await apiFetch(`/api/webhooks/triggers/${trigger.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(update) });
      const body = await response.json() as { trigger?: Trigger; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not update the trigger.");
      if (body.trigger) setPage((current) => current ? { ...current, triggers: current.triggers.map((item) => item.id === trigger.id ? body.trigger! : item) } : current);
    } catch (cause) { setError(errorMessage(cause instanceof Error ? cause.message : "Could not update the trigger.")); }
    finally { setUpdatingTriggerId(null); }
  }

  async function rotateSecret(trigger: Trigger) {
    setError(null);
    try {
      const response = await apiFetch(`/api/webhooks/triggers/${trigger.id}/rotate-secret`, { method: "POST" });
      const body = await response.json() as { secret?: string; endpointUrl?: string; error?: string };
      if (!response.ok || !body.secret || !body.endpointUrl) throw new Error(body.error ?? "Could not rotate the secret.");
      setIssued({ secret: body.secret, endpointUrl: body.endpointUrl }); await refresh();
    } catch (cause) { setError(errorMessage(cause instanceof Error ? cause.message : "Could not rotate the secret.")); }
  }

  async function deleteTrigger(trigger: Trigger) {
    setDeleting(true); setError(null);
    try {
      const response = await apiFetch(`/api/webhooks/triggers/${trigger.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not delete the trigger.");
      setPage((current) => current ? { ...current, triggers: current.triggers.filter((item) => item.id !== trigger.id) } : current);
      setDeliveries((current) => { const next = { ...current }; delete next[trigger.id]; return next; });
      setDeleteTarget(null);
      showFlash({ tone: "success", title: "Webhook trigger deleted", message: `“${trigger.name}” can no longer receive requests.` });
    } catch (cause) { setError(errorMessage(cause instanceof Error ? cause.message : "Could not delete the trigger.")); }
    finally { setDeleting(false); }
  }

  async function previewTrigger(trigger: Trigger) {
    setError(null); setPreview(null);
    try {
      const payload = JSON.parse(sample) as unknown;
      const response = await apiFetch(`/api/webhooks/triggers/${trigger.id}/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload }) });
      const body = await response.json() as { inputs?: Array<{ label: string; value: string }>; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not validate this payload.");
      setPreview(body.inputs ?? []);
      showFlash({ tone: "success", title: "Payload validation passed", message: `${body.inputs?.length ?? 0} inputs resolved. Empty request values use configured fallbacks.` });
    } catch (cause) { setError(errorMessage(cause instanceof Error ? cause.message : "Enter a valid JSON object.")); }
  }

  async function startTestRun(trigger: Trigger) {
    setBusy(true); setError(null);
    try {
      const payload = JSON.parse(sample) as unknown;
      const response = await apiFetch(`/api/webhooks/triggers/${trigger.id}/test-run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not start the test run.");
      setTestRunTarget(null);
      showFlash({ tone: "success", title: "Test run started", message: `A real run was queued for “${trigger.name}”.` });
    } catch (cause) {
      const message = errorMessage(cause instanceof Error ? cause.message : "Could not start the test run.");
      setTestRunTarget(null);
      showFlash({ tone: "error", title: "Could not start test run", message });
    }
    finally { setBusy(false); }
  }

  const mediaOptions = (dataTypeId: string) => media.filter((item) => item.dataTypeId === dataTypeId).map((item) => ({ value: item.id, label: item.displayName }));

  return <>
    <Modal opened={opened} onClose={onClose} title={workflow ? `Webhook triggers · ${workflow.name}` : "Webhook triggers"} size="xl" centered>
    {loading ? <Group justify="center" py="xl"><Loader size="sm" /></Group> : <Stack gap="md">
      {error && <Alert color="hiveError" title="Webhook action failed">{error}</Alert>}
      {!page?.publicApiConfigured && <Alert color="hiveWarning" title="Public API URL not configured">Set WEBHOOK_PUBLIC_API_URL to your public HTTPS API origin before creating triggers.</Alert>}
      {issued && <Paper className="webhook-issued-credentials" withBorder radius="md" p="sm">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs"><Stack gap={2}><Text size="sm" fw={700}>Webhook credentials</Text><Text size="xs" c="dimmed">Copy the signing secret now. Hive shows it only after creation or rotation.</Text></Stack><Badge variant="light" color="hiveWarning">Secret shown once</Badge></Group>
          <div className="webhook-credential-field"><Text className="webhook-credential-label" size="xs" fw={600}>Endpoint URL</Text><div className="webhook-credential-row"><Code block className="webhook-credential-value">{issued.endpointUrl}</Code><CopyButton value={issued.endpointUrl} timeout={1600}>{({ copied, copy }) => <Button size="xs" variant="default" color={copied ? "hiveSuccess" : "gray"} onClick={() => void copy()}>{copied ? "Copied" : "Copy URL"}</Button>}</CopyButton></div></div>
          <div className="webhook-credential-field"><Text className="webhook-credential-label" size="xs" fw={600}>Signing secret</Text><div className="webhook-credential-row"><Code block className="webhook-credential-value">{issued.secret}</Code><CopyButton value={issued.secret} timeout={1600}>{({ copied, copy }) => <Button size="xs" variant="default" color={copied ? "hiveSuccess" : "gray"} onClick={() => void copy()}>{copied ? "Copied" : "Copy secret"}</Button>}</CopyButton></div></div>
        </Stack>
      </Paper>}
      <Paper className="webhook-signing-guide" withBorder radius="md" p="sm">
        <Stack gap="xs">
          <Group justify="space-between" align="center" wrap="wrap" gap="xs"><Group gap="xs"><Badge variant="light" color="hiveSky">POST</Badge><Text size="sm" fw={700}>Connection details</Text></Group><Text size="xs" c="dimmed">Signed JSON · HMAC-SHA256</Text></Group>
          <Text size="sm">Include <Code>X-Hive-Timestamp</Code>, <Code>X-Hive-Event-Id</Code>, and <Code>X-Hive-Signature</Code>. The signature covers the exact raw body digest to support safe retries.</Text>
          <Code block className="webhook-signature-code">HMAC-SHA256(secret, "v1\n" + timestamp + "\n" + eventId + "\n" + sha256Hex(rawBody))</Code>
          <Text size="xs" c="dimmed">Send the signature as v1=&lt;lowercase hex&gt;. Timestamps may be at most five minutes from Hive’s clock. Reuse an event ID only when retrying the same request.</Text>
        </Stack>
      </Paper>

      <Paper withBorder radius="md" p="sm"><Stack gap="sm">
        <Group justify="space-between"><Text fw={700} size="sm">{editingTriggerId ? "Edit trigger settings" : "Create a trigger"}</Text><Group gap="xs"><Badge variant="light" color="gray">HMAC-SHA256</Badge>{editingTriggerId && <Button size="xs" variant="default" onClick={() => { setEditingTriggerId(null); setName("Workflow webhook"); setSources({}); }}>Cancel edit</Button>}</Group></Group>
        <TextInput label="Trigger name" value={name} maxLength={100} onChange={(event) => setName(event.currentTarget.value)} />
        <Text size="xs" c="dimmed">Text inputs are mapped automatically by their Webhook identifiers. Nested Custom Node instance names become path prefixes. Missing values use the text configured on the node. Media inputs can use a fixed saved library asset.</Text>
        {(page?.webhookTextInputs ?? []).map((node) => <Group key={node.nodeId} justify="space-between" align="flex-start" wrap="wrap" gap="xs">
          <Stack gap={2} style={{ minWidth: 180, flex: 1 }}><Text size="sm" fw={600}>{node.label}</Text><Text size="xs" c="dimmed">If omitted or empty: {node.configured ? <Text component="span" size="xs" c="dimmed" lineClamp={2} title={node.defaultText}>“{node.defaultText}”</Text> : "No fallback configured; this value must be sent."}</Text></Stack>
          <Code>{node.jsonPath}</Code>
        </Group>)}
        {!examplePayload && <Alert color="hiveSky" title="No JSON payload needed">No text inputs are mapped to this webhook. Call it with an empty body or <Code>{"{}"}</Code>; Hive will run the workflow using the values configured on its inputs and any selected saved media. The timestamp, event ID, and signature headers are still required.</Alert>}
        {(page?.inputNodes ?? []).filter((node) => node.dataTypeId !== "text").map((node) => {
          const source = sources[node.id];
          return <Group key={node.id} align="end" wrap="wrap" gap="xs">
          <Text size="sm" fw={600} style={{ minWidth: 130 }}>{node.label}</Text>
          <Select aria-label={`${node.label} saved media`} placeholder="Use workflow value" clearable searchable style={{ flex: 1 }} data={mediaOptions(node.dataTypeId)} value={source?.mode === "library" ? source.artifactId : null} onChange={(artifactId) => setSources((current) => ({ ...current, [node.id]: artifactId ? { mode: "library", artifactId } : { mode: "unchanged" } }))} />
        </Group>;
        })}
        <Textarea label="Payload for preview/test run" description={examplePayload ? "Prefilled from the current input mappings. Edit values here to validate or test a specific request." : "Use {} to preview or test a run with the workflow's configured input values."} value={sample} onChange={(event) => { sampleEdited.current = true; setSample(event.currentTarget.value); setPreview(null); }} minRows={3} autosize spellCheck={false} />
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <Stack gap={2}>{payloadPreview?.map((item) => <Text key={item.label} size="xs" c={item.value.startsWith("Missing") || item.value.startsWith("Needs") ? "hiveWarning" : "dimmed"}>{item.label}: {item.value}</Text>)}</Stack>
          <Button onClick={() => void saveTrigger()} loading={busy} disabled={!name.trim() || (!editingTriggerId && !page?.publicApiConfigured)}>{editingTriggerId ? "Save trigger" : "Create trigger"}</Button>
        </Group>
      </Stack></Paper>

      <Stack gap="xs"><Group justify="space-between" align="center"><Text fw={700} size="sm">Connected triggers</Text><Badge variant="light" color="gray">{page?.triggers.length ?? 0}</Badge></Group>
        {(page?.triggers ?? []).length === 0 ? <Text size="sm" c="dimmed">No triggers configured for this workflow.</Text> : page!.triggers.map((trigger) => <Paper key={trigger.id} withBorder radius="md" p="sm"><Stack gap="xs">
          <Group justify="space-between" wrap="wrap"><Group gap="xs"><Text fw={600} size="sm">{trigger.name}</Text><Badge size="sm" color={trigger.enabled ? "hiveSuccess" : "gray"} variant="light">{trigger.enabled ? "Enabled" : "Paused"}</Badge></Group><Group gap="xs"><Switch size="sm" aria-label={`${trigger.enabled ? "Pause" : "Enable"} ${trigger.name}`} checked={trigger.enabled} disabled={updatingTriggerId === trigger.id} onChange={(event) => void updateTrigger(trigger, { enabled: event.currentTarget.checked })} /><Tooltip label="Rotate signing secret"><ActionIcon variant="subtle" aria-label={`Rotate secret for ${trigger.name}`} onClick={() => void rotateSecret(trigger)}>↻</ActionIcon></Tooltip><Tooltip label="Delete trigger"><ActionIcon variant="subtle" color="hiveError" aria-label={`Delete ${trigger.name}`} onClick={() => setDeleteTarget(trigger)}>×</ActionIcon></Tooltip></Group></Group>
          {trigger.endpointUrl ? <Group className="webhook-trigger-endpoint-row" gap="xs" wrap="nowrap"><Code block className="webhook-trigger-endpoint">{trigger.endpointUrl}</Code><CopyButton value={trigger.endpointUrl} timeout={1600}>{({ copied, copy }) => <Button size="xs" variant="default" color={copied ? "hiveSuccess" : "gray"} onClick={() => void copy()}>{copied ? "Copied" : "Copy URL"}</Button>}</CopyButton></Group> : <Text size="xs" c="hiveWarning">Set WEBHOOK_PUBLIC_API_URL to see the endpoint.</Text>}
          <Group gap="xs"><Button size="xs" variant="default" onClick={() => editTrigger(trigger)}>Edit settings</Button><Button size="xs" variant="default" onClick={() => void previewTrigger(trigger)}>Validate sample</Button><Button size="xs" onClick={() => setTestRunTarget(trigger)} disabled={!trigger.enabled || busy}>Test run</Button></Group>
          {(deliveries[trigger.id] ?? []).length > 0 && <Table fz="xs" verticalSpacing={4} horizontalSpacing="xs"><Table.Thead><Table.Tr><Table.Th>Recent delivery</Table.Th><Table.Th>Result</Table.Th><Table.Th>Run</Table.Th><Table.Th>Received</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{deliveries[trigger.id]!.slice(0, 5).map((item) => <Table.Tr key={item.id}><Table.Td><Text size="xs" lineClamp={1}>{item.eventId}</Text></Table.Td><Table.Td><Badge size="xs" variant="light" color={item.outcome === "accepted" ? "hiveSuccess" : "hiveError"}>{item.outcome === "accepted" ? "Accepted" : item.errorCode ?? item.statusCode}</Badge></Table.Td><Table.Td>{item.runId ? <Button size="compact-xs" variant="subtle" onClick={() => { window.location.hash = `runs/${item.runId}`; onClose(); }}>{item.runId.slice(0, 8)}</Button> : <Text size="xs" c="dimmed">—</Text>}</Table.Td><Table.Td><Text size="xs" c="dimmed">{new Date(item.receivedAt).toLocaleString()}</Text></Table.Td></Table.Tr>)}</Table.Tbody></Table>}
          {preview && <Paper className="webhook-payload-preview" withBorder radius="sm" p="xs"><Stack gap={4}><Text size="xs" fw={600}>Resolved input values</Text>{preview.map((item) => <Text key={item.nodeId ?? item.label} size="xs"><Text component="span" size="xs" fw={600}>{item.label}: </Text>{item.value}</Text>)}</Stack></Paper>}
        </Stack></Paper>)}
      </Stack>
      <Group justify="flex-end"><Button variant="default" onClick={onClose}>Close</Button></Group>
    </Stack>}
    </Modal>
    <ConfirmActionModal opened={deleteTarget !== null} onClose={() => { if (!deleting) setDeleteTarget(null); }} title="Delete webhook trigger?" confirmLabel="Delete trigger" loading={deleting} onConfirm={() => { if (deleteTarget) void deleteTrigger(deleteTarget); }}>
      <Text size="sm">Delete “{deleteTarget?.name}”? Its endpoint and signing secret will stop working immediately. Delivery history will remain until its normal retention period expires.</Text>
    </ConfirmActionModal>
    <ConfirmActionModal opened={testRunTarget !== null} onClose={() => { if (!busy) setTestRunTarget(null); }} title="Start a real workflow run?" confirmLabel="Start test run" loading={busy} color="hiveWarning" onConfirm={() => { if (testRunTarget) void startTestRun(testRunTarget); }}>
      <Text size="sm">This queues a real run for “{testRunTarget?.name}”. The workflow may publish to Instagram or cause other configured external side effects.</Text>
    </ConfirmActionModal>
  </>;
}
