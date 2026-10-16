import { useEffect, useMemo, useRef, useState } from "react";
import { ActionIcon, Alert, Badge, Button, Code, CopyButton, Group, Loader, Paper, Select, Stack, Text, TextInput, Textarea, Tooltip } from "@mantine/core";
import { apiFetch } from "../apiClient";
import { useFlashMessages } from "../components/FlashMessages";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import { CopyIcon } from "../components/WorkspaceTableActions";
import type { Workflow } from "./workflowTypes";

type InputNode = { id: string; label: string; dataTypeId: string; configured: boolean };
type WebhookTextInput = { nodeId: string; label: string; jsonPath: string; defaultText: string; configured: boolean };
type Mapping = { nodeId: string; source: "payload" | "library"; path?: string; artifactId?: string };
type Trigger = { id: string; name: string; workflowName: string; enabled: boolean; hasSecret: boolean; endpointUrl: string | null; inputMappings: Mapping[]; createdAt: string; updatedAt: string };
type MediaItem = { id: string; dataTypeId: string; displayName: string; mediaType: string; byteSize: number };
type InputSource = { mode: "library"; artifactId: string } | { mode: "unchanged" };
type TriggerPage = { workflow: { id: string; name: string }; inputNodes: InputNode[]; webhookTextInputs: WebhookTextInput[]; triggers: Trigger[]; publicApiConfigured: boolean };
type IssuedCredentials = { secret: string; endpointUrl: string };

function WebhookConnectionDetails({ endpointUrl, issued }: { endpointUrl: string | null; issued: IssuedCredentials | null }) {
  const resolvedEndpointUrl = issued?.endpointUrl ?? endpointUrl;
  return <section className="webhook-connection-section" aria-label="Webhook connection details">
    <Group className="webhook-connection-heading webhook-section-heading" justify="space-between" align="center" wrap="wrap" gap="xs"><Group gap="xs"><Text className="webhook-section-title" size="sm" fw={600}>Connection details</Text><Badge size="sm" variant="light" color="hiveSky">POST · HMAC-SHA256</Badge></Group>{issued && <Badge size="sm" variant="light" color="hiveWarning">Secret shown once</Badge>}</Group>
    <div className="webhook-credential-row webhook-credential-inline"><Text className="webhook-credential-label" size="xs" fw={500}>Endpoint</Text><Code className="webhook-credential-value">{resolvedEndpointUrl ?? "Loading endpoint…"}</Code>{resolvedEndpointUrl && <CopyButton value={resolvedEndpointUrl} timeout={1600}>{({ copied, copy }) => <Tooltip label={copied ? "URL copied" : "Copy URL"}><ActionIcon size={28} variant="default" color={copied ? "hiveSuccess" : "gray"} aria-label={copied ? "URL copied" : "Copy webhook URL"} onClick={() => void copy()}><CopyIcon /></ActionIcon></Tooltip>}</CopyButton>}</div>
    <div className="webhook-credential-row webhook-credential-inline"><Text className="webhook-credential-label" size="xs" fw={500}>Signing secret</Text>{issued ? <Code className="webhook-credential-value">{issued.secret}</Code> : <Text className="webhook-credential-value webhook-secret-stored" size="xs">Stored securely · rotate to replace</Text>}{issued && <CopyButton value={issued.secret} timeout={1600}>{({ copied, copy }) => <Tooltip label={copied ? "Secret copied" : "Copy secret"}><ActionIcon size={28} variant="default" color={copied ? "hiveSuccess" : "gray"} aria-label={copied ? "Secret copied" : "Copy signing secret"} onClick={() => void copy()}><CopyIcon /></ActionIcon></Tooltip>}</CopyButton>}</div>
    {issued && <Text className="webhook-credential-footnote" size="xs" c="dimmed">Hive shows the signing secret only after creation or rotation. Copy it somewhere safe.</Text>}
  </section>;
}

function WebhookSigningGuide() {
  return <details className="webhook-signing-guide webhook-compact-signing-guide">
    <summary><span>Request signing</span><Text component="span" size="xs" c="dimmed">Headers · HMAC-SHA256</Text></summary>
    <Stack gap="xs" mt="xs"><Text size="xs">Include <Code>X-Hive-Timestamp</Code>, <Code>X-Hive-Event-Id</Code>, and <Code>X-Hive-Signature</Code>. The signature covers the exact raw body digest to support safe retries.</Text><Code block className="webhook-signature-code">HMAC-SHA256(secret, "v1\n" + timestamp + "\n" + eventId + "\n" + sha256Hex(rawBody))</Code><Text size="xs" c="dimmed">Send the signature as v1=&lt;lowercase hex&gt;. Timestamps may be at most five minutes from Hive’s clock. Reuse an event ID only when retrying the same request.</Text></Stack>
  </details>;
}

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

export function WebhookTriggerDrawerContent({ workflow, opened, initialTriggerId, initialCredentials = null, onSaved }: { workflow: Workflow; opened: boolean; initialTriggerId: string; initialCredentials?: { secret: string; endpointUrl: string } | null; onSaved: () => void }) {
  const { showFlash } = useFlashMessages();
  const [page, setPage] = useState<TriggerPage | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("Workflow webhook");
  const [sources, setSources] = useState<Record<string, InputSource>>({});
  const [sample, setSample] = useState("{}\n");
  const sampleEdited = useRef(false);
  const configPanelRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<Array<{ nodeId?: string; label: string; value: string }> | null>(null);
  const [issued, setIssued] = useState<IssuedCredentials | null>(initialCredentials);
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null);
  const [initialTriggerApplied, setInitialTriggerApplied] = useState(false);
  const [testRunTarget, setTestRunTarget] = useState<Trigger | null>(null);

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
    } catch (cause) { setError(errorMessage(cause instanceof Error ? cause.message : "Could not load webhook triggers.")); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!opened) return;
    sampleEdited.current = false;
    setPage(null); setMedia([]);
    setName("Workflow webhook"); setSources({}); setSample("{}\n"); setPreview(null); setIssued(initialCredentials); setEditingTriggerId(null); setInitialTriggerApplied(false);
    void refresh();
  }, [opened, workflow.id, initialTriggerId]);

  useEffect(() => {
    if (!opened || !initialTriggerId || !page || initialTriggerApplied) return;
    const trigger = page.triggers.find((item) => item.id === initialTriggerId);
    if (trigger) { editTrigger(trigger); setInitialTriggerApplied(true); }
  }, [opened, initialTriggerId, page, initialTriggerApplied]);

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
    requestAnimationFrame(() => configPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function saveTrigger() {
    setBusy(true); setError(null);
    try {
      if (!editingTriggerId) throw new Error("trigger_not_selected");
      const response = await apiFetch(`/api/webhooks/triggers/${editingTriggerId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, inputMappings: mappings() }) });
      const body = await response.json() as { trigger?: Trigger; error?: string };
      if (!response.ok || !body.trigger) throw new Error(body.error ?? "Could not save the webhook trigger.");
      await refresh();
      onSaved();
      showFlash({ tone: "success", title: "Webhook trigger updated", message: "The trigger settings were updated." });
    } catch (cause) { setError(errorMessage(cause instanceof Error ? cause.message : "Could not save the webhook trigger.")); }
    finally { setBusy(false); }
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
  const activeTrigger = page?.triggers.find((item) => item.id === editingTriggerId) ?? null;

  return <>
    {loading ? <Group justify="center" py="xl"><Loader size="sm" /></Group> : <div className="webhook-trigger-drawer-settings">
      <Stack className="webhook-trigger-drawer-scroll" gap="xs">
      {error && <Alert color="hiveError" title="Webhook action failed">{error}</Alert>}
      {activeTrigger && !activeTrigger.enabled && <div className="webhook-paused-notice"><span className="webhook-paused-dot" /><div className="webhook-paused-copy"><Text size="xs" fw={600}>Setup incomplete</Text><Text size="xs">Configure inputs, save, then enable from the list.</Text></div></div>}
      <WebhookConnectionDetails endpointUrl={activeTrigger?.endpointUrl ?? null} issued={issued} />
      <WebhookSigningGuide />

      <div className="webhook-section-divider" />
      <section ref={configPanelRef} className="webhook-trigger-config-panel"><Stack gap={0}>
        <Group className="webhook-section-heading" justify="space-between"><Text className="webhook-section-title" fw={600} size="sm">Trigger settings</Text>{issued && activeTrigger && !activeTrigger.enabled && <Badge size="sm" variant="light" color="gray">Draft</Badge>}</Group>
        <TextInput label="Trigger name" value={name} maxLength={100} onChange={(event) => setName(event.currentTarget.value)} />
        <Text className="webhook-trigger-settings-hint" size="xs" c="dimmed">Webhook identifiers map text fields automatically. Empty values use workflow defaults; media inputs can use saved library assets.</Text>
        {(page?.webhookTextInputs ?? []).map((node) => <Group key={node.nodeId} justify="space-between" align="flex-start" wrap="wrap" gap="xs">
          <Stack gap={2} style={{ minWidth: 180, flex: 1 }}><Text size="sm" fw={600}>{node.label}</Text><Text size="xs" c="dimmed">If omitted or empty: {node.configured ? <Text component="span" size="xs" c="dimmed" lineClamp={2} title={node.defaultText}>“{node.defaultText}”</Text> : "No fallback configured; this value must be sent."}</Text></Stack>
          <Code>{node.jsonPath}</Code>
        </Group>)}
        {!examplePayload && <div className="webhook-no-payload-note"><span className="webhook-no-payload-icon">{"{}"}</span><div><Text size="xs" fw={600}>No text inputs mapped</Text><Text size="xs" c="dimmed">Send an empty body or <Code>{"{}"}</Code> to run with workflow defaults. Signature headers are still required.</Text></div></div>}
        {(page?.inputNodes ?? []).filter((node) => node.dataTypeId !== "text").map((node) => {
          const source = sources[node.id];
          return <Group key={node.id} align="end" wrap="wrap" gap="xs">
          <Text size="sm" fw={600} style={{ minWidth: 130 }}>{node.label}</Text>
          <Select aria-label={`${node.label} saved media`} placeholder="Use workflow value" clearable searchable style={{ flex: 1 }} data={mediaOptions(node.dataTypeId)} value={source?.mode === "library" ? source.artifactId : null} onChange={(artifactId) => setSources((current) => ({ ...current, [node.id]: artifactId ? { mode: "library", artifactId } : { mode: "unchanged" } }))} />
        </Group>;
        })}
        <Textarea label="Payload for preview/test run" description={examplePayload ? "Prefilled from the current input mappings. Edit values to validate or test a request." : "Use {} to test with the workflow's configured input values."} value={sample} onChange={(event) => { sampleEdited.current = true; setSample(event.currentTarget.value); setPreview(null); }} minRows={2} autosize spellCheck={false} />
        {preview && <Paper className="webhook-payload-preview" radius="sm" p="xs"><Stack gap={4}><Text size="xs" fw={600}>Resolved input values</Text>{preview.map((item) => <Text key={item.nodeId ?? item.label} size="xs"><Text component="span" size="xs" fw={600}>{item.label}: </Text>{item.value}</Text>)}</Stack></Paper>}
        {payloadPreview && payloadPreview.length > 0 && <Stack gap={2} mt="xs">{payloadPreview.map((item) => <Text key={item.label} size="xs" c={item.value.startsWith("Missing") || item.value.startsWith("Needs") ? "hiveWarning" : "dimmed"}>{item.label}: {item.value}</Text>)}</Stack>}
      </Stack></section>
      </Stack>
      {editingTriggerId && <Group className="webhook-trigger-drawer-footer" justify="space-between" wrap="wrap">
        <Group gap="xs">
          {activeTrigger && <><Button size="xs" variant="default" onClick={() => void previewTrigger(activeTrigger)}>Validate</Button><Button size="xs" variant="default" disabled={!activeTrigger.enabled || busy} onClick={() => setTestRunTarget(activeTrigger)}>Test run</Button><Button size="xs" variant="default" onClick={() => void rotateSecret(activeTrigger)}>Rotate secret</Button></>}
        </Group>
        <Button size="xs" onClick={() => void saveTrigger()} loading={busy} disabled={!name.trim() || !editingTriggerId}>Save trigger</Button>
      </Group>}
    </div>}
    <ConfirmActionModal modalClassName="webhook-flow-modal-content" size="sm" stackGap="sm" opened={testRunTarget !== null} onClose={() => { if (!busy) setTestRunTarget(null); }} title="Start a real workflow run?" confirmLabel="Start test run" loading={busy} color="hiveWarning" onConfirm={() => { if (testRunTarget) void startTestRun(testRunTarget); }}>
      <Text size="sm">This queues a real run for “{testRunTarget?.name}”. The workflow may publish to Instagram or cause other configured external side effects.</Text>
    </ConfirmActionModal>
  </>;
}
