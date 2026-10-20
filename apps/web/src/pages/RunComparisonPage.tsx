import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Checkbox, Group, Loader, Pagination, Paper, Select, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { apiFetch } from "../apiClient";
import { useFlashMessages } from "../components/FlashMessages";
import { useAppBreadcrumb } from "../components/AppBreadcrumbs";
import { ArtifactPreview } from "../components/RunDetailsInspector";
import { formatFileSize } from "../formatters";
import { date, nodeTypeLabel, statusColor } from "../runFormatting";
import type { Artifact, Detail, PageResult, Run, RunNode } from "../runTypes";
import { displayJson, diffLines, nodeChanged, nodeDuration, nodeKind, nodeLabel, outputState, pairNodes, runInputsChanged, safeErrorSummary, suggestedMatches, workflowDefinitionChanged } from "../runComparison";
import type { NodePair } from "../runComparison";
import "./runComparison.css";

const PICKER_PAGE_SIZE = 10;
const runRoute = () => window.location.hash.match(/^#runs\/compare(?:\?(.*))?$/i)?.[1] ?? "";
function selectedFromRoute(key: "baseline" | "comparison") { return new URLSearchParams(runRoute()).get(key) ?? ""; }
function putRouteSelection(baseline: string, comparison: string) {
  const query = new URLSearchParams();
  if (baseline) query.set("baseline", baseline);
  if (comparison) query.set("comparison", comparison);
  window.location.hash = `runs/compare${query.size ? `?${query.toString()}` : ""}`;
}
function runOption(run: Run) {
  const title = run.workflowSnapshotJson?.name ?? "Workflow";
  return { value: run.id, label: `${title} · ${date(run.createdAt)} · ${run.status.replaceAll("_", " ")} · ${run.id.slice(0, 8)}` };
}
function detailsUrl(id: string) { return `/api/runs/${encodeURIComponent(id)}`; }
function elapsed(startedAt: string | null, finishedAt: string | null): number | null {
  if (!startedAt || !finishedAt) return null;
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}
function durationLabel(ms: number | null) { return ms === null ? "Not measured" : Math.abs(ms) < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`; }
function pairKey(pair: NodePair) { return `${pair.baseline?.nodeId ?? ""}:${pair.comparison?.nodeId ?? ""}`; }
function statusLabel(status: string | undefined) { return status ? status.replaceAll("_", " ") : "Not present"; }
function outputStateLabel(state: string) { return state.replaceAll("-", " "); }

export function RunComparisonPage({ initialBaseline = "", onBack }: { initialBaseline?: string; onBack: () => void }) {
  const { showFlash } = useFlashMessages();
  const [baselineId, setBaselineId] = useState(() => selectedFromRoute("baseline") || initialBaseline);
  const [comparisonId, setComparisonId] = useState(() => selectedFromRoute("comparison"));
  const [baselineDetail, setBaselineDetail] = useState<Detail | null>(null);
  const [comparisonDetail, setComparisonDetail] = useState<Detail | null>(null);
  const [pickerResult, setPickerResult] = useState<PageResult | null>(null);
  const [pickerPage, setPickerPage] = useState(1);
  const [search, setSearch] = useState("");
  const [allWorkflows, setAllWorkflows] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [showChangedOnly, setShowChangedOnly] = useState(true);
  const [confirmedMatches, setConfirmedMatches] = useState<Record<string, string>>({});
  const [selectedPair, setSelectedPair] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useAppBreadcrumb({ parentView: "runs", currentLabel: "Compare runs", onParentNavigate: onBack });

  useEffect(() => {
    const sync = () => { setBaselineId(selectedFromRoute("baseline") || initialBaseline); setComparisonId(selectedFromRoute("comparison")); };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [initialBaseline]);

  const fetchRun = useCallback(async (id: string): Promise<Detail> => {
    const response = await apiFetch(detailsUrl(id));
    const body = await response.json().catch(() => ({})) as Detail & { error?: string };
    if (!response.ok || !body.run || !Array.isArray(body.nodes)) throw new Error(response.status === 404 ? "This run was deleted or is no longer available." : "Could not load run details. Please refresh and try again.");
    return body;
  }, []);

  useEffect(() => {
    let current = true;
    const loadPicker = async () => {
      setPickerLoading(true);
      const params = new URLSearchParams({ page: String(pickerPage), pageSize: String(PICKER_PAGE_SIZE) });
      if (search.trim()) params.set("search", search.trim());
      if (!allWorkflows && baselineDetail?.run.workflowId) params.set("workflowId", baselineDetail.run.workflowId);
      else if (!allWorkflows && baselineDetail?.run.workflowSnapshotJson?.name) params.set("workflowName", baselineDetail.run.workflowSnapshotJson.name);
      try {
        const response = await apiFetch(`/api/runs?${params.toString()}`);
        const body = await response.json() as PageResult;
        if (!response.ok) throw new Error("Could not load runs for comparison.");
        if (current) setPickerResult(body);
      } catch (error) {
        if (current) showFlash({ tone: "error", title: "Run picker unavailable", message: error instanceof Error ? error.message : "Could not load runs." });
      } finally { if (current) setPickerLoading(false); }
    };
    void loadPicker();
    return () => { current = false; };
  }, [allWorkflows, baselineDetail?.run.workflowId, pickerPage, search, showFlash]);

  useEffect(() => {
    let current = true;
    setDetailsError(null);
    setDetailsLoading(Boolean(baselineId || comparisonId));
    if (!baselineId) setBaselineDetail(null);
    if (!comparisonId) setComparisonDetail(null);
    const load = async () => {
      const [baselineResult, comparisonResult] = await Promise.all([
        baselineId ? fetchRun(baselineId).then((detail) => ({ detail })).catch((error: unknown) => ({ error })) : Promise.resolve(null),
        comparisonId ? fetchRun(comparisonId).then((detail) => ({ detail })).catch((error: unknown) => ({ error })) : Promise.resolve(null),
      ]);
      if (!current) return;
      if (baselineResult && "detail" in baselineResult) setBaselineDetail(baselineResult.detail);
      else if (baselineResult && "error" in baselineResult) setBaselineDetail(null);
      if (comparisonResult && "detail" in comparisonResult) setComparisonDetail(comparisonResult.detail);
      else if (comparisonResult && "error" in comparisonResult) setComparisonDetail(null);
      const errors = [baselineResult && "error" in baselineResult ? baselineResult.error : null, comparisonResult && "error" in comparisonResult ? comparisonResult.error : null].filter(Boolean);
      if (errors.length) setDetailsError(errors.map((error) => error instanceof Error ? error.message : "Could not load run details.").join(" "));
      setDetailsLoading(false);
    };
    void load();
    return () => { current = false; };
  }, [baselineId, comparisonId, fetchRun, refreshVersion]);

  useEffect(() => { setConfirmedMatches({}); setSelectedPair(""); }, [baselineId, comparisonId]);
  useEffect(() => { putRouteSelection(baselineId, comparisonId); }, [baselineId, comparisonId]);

  const pickerRuns = (pickerResult?.items ?? []).filter((run) => !run.deletion);
  const optionRuns = useMemo(() => {
    const byId = new Map(pickerRuns.map((run) => [run.id, run]));
    if (baselineDetail) byId.set(baselineDetail.run.id, baselineDetail.run);
    if (comparisonDetail) byId.set(comparisonDetail.run.id, comparisonDetail.run);
    return [...byId.values()];
  }, [baselineDetail, comparisonDetail, pickerRuns]);
  const baselineOptions = optionRuns.map(runOption);
  const comparisonOptions = optionRuns.filter((run) => run.id !== baselineId).map(runOption);
  const pairs = useMemo(() => baselineDetail && comparisonDetail ? pairNodes(baselineDetail.nodes, comparisonDetail.nodes, confirmedMatches) : [], [baselineDetail, comparisonDetail, confirmedMatches]);
  const suggestions = useMemo(() => baselineDetail && comparisonDetail ? suggestedMatches(baselineDetail.nodes, comparisonDetail.nodes, confirmedMatches) : [], [baselineDetail, comparisonDetail, confirmedMatches]);
  const changedPairs = pairs.filter((pair) => nodeChanged(pair, baselineDetail?.artifacts ?? [], comparisonDetail?.artifacts ?? []));
  const visiblePairs = showChangedOnly ? changedPairs : pairs;
  const currentPair = visiblePairs.find((pair) => pairKey(pair) === selectedPair) ?? visiblePairs[0] ?? null;

  useEffect(() => {
    if (!currentPair) { setSelectedPair(""); return; }
    if (currentPair && selectedPair !== pairKey(currentPair)) setSelectedPair(pairKey(currentPair));
  }, [currentPair, selectedPair]);

  const selectBaseline = (id: string | null) => { setDetailsError(null); setBaselineDetail(null); setComparisonDetail(null); setBaselineId(id ?? ""); setComparisonId(""); setPickerPage(1); };
  const selectComparison = (id: string | null) => { setDetailsError(null); setComparisonDetail(null); setComparisonId(id ?? ""); };
  const loadingDetails = detailsLoading;
  const definitionChanged = baselineDetail && comparisonDetail ? workflowDefinitionChanged(baselineDetail, comparisonDetail) : false;
  const inputsChanged = baselineDetail && comparisonDetail ? runInputsChanged(baselineDetail, comparisonDetail) : false;
  const sameWorkflow = Boolean(baselineDetail && comparisonDetail && (baselineDetail.run.workflowId
    ? baselineDetail.run.workflowId === comparisonDetail.run.workflowId
    : !comparisonDetail.run.workflowId && baselineDetail.run.workflowSnapshotJson?.name === comparisonDetail.run.workflowSnapshotJson?.name));
  const comparisonAllowed = allWorkflows || sameWorkflow;
  const durationA = baselineDetail ? elapsed(baselineDetail.run.startedAt, baselineDetail.run.finishedAt) : null;
  const durationB = comparisonDetail ? elapsed(comparisonDetail.run.startedAt, comparisonDetail.run.finishedAt) : null;
  const durationDelta = durationA !== null && durationB !== null ? durationB - durationA : null;
  const changedCount = changedPairs.length;
  const addedCount = pairs.filter((pair) => !pair.baseline).length;
  const removedCount = pairs.filter((pair) => !pair.comparison).length;

  const refresh = async () => {
    setDetailsError(null);
    setRefreshVersion((version) => version + 1);
  };

  return <Stack className="workspace-page run-comparison-page" gap="md">
    <Group justify="space-between" align="flex-start" wrap="wrap">
      <div><Title order={1} size="h2">Run comparison</Title><Text size="sm" c="dimmed">Review stored differences between two runs. Hive does not score image or media quality.</Text></div>
      <Group><Button variant="default" onClick={onBack}>Back to Runs</Button><Button variant="light" disabled={!baselineId && !comparisonId} loading={detailsLoading} onClick={() => void refresh()}>Refresh comparison</Button></Group>
    </Group>

    <Paper withBorder radius="md" p="md">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Select label="Baseline run" placeholder="Choose a run" searchable data={baselineOptions} value={baselineId || null} onChange={selectBaseline} nothingFoundMessage="No runs found" />
        <Select label="Comparison run" placeholder={baselineId ? "Choose another run" : "Choose a baseline first"} searchable data={comparisonOptions} value={comparisonId || null} onChange={selectComparison} disabled={!baselineId} nothingFoundMessage="No runs found" />
      </SimpleGrid>
      <Group mt="sm" justify="space-between" align="flex-end" wrap="wrap">
        <Group align="flex-end" wrap="wrap">
          <TextInput label="Find runs" placeholder="Workflow name or run ID" value={search} onChange={(event) => { setSearch(event.currentTarget.value); setPickerPage(1); }} />
          <Checkbox label="Include runs from other workflows" checked={allWorkflows} onChange={(event) => { setAllWorkflows(event.currentTarget.checked); setPickerPage(1); }} disabled={!baselineDetail} />
        </Group>
        <Group gap="xs" align="center">{pickerLoading && <Loader size="xs" />}<Text size="xs" c="dimmed">{pickerResult?.total ?? 0} matching runs</Text>{(pickerResult?.totalPages ?? 0) > 1 && <Pagination size="sm" total={pickerResult?.totalPages ?? 1} value={pickerPage} onChange={setPickerPage} />}</Group>
      </Group>
      {baselineId && baselineDetail && <Text size="xs" c="dimmed" mt="xs">{allWorkflows ? "Showing runs from your workspace." : baselineDetail.run.workflowId ? "Showing runs from the baseline workflow. Turn on the filter above to compare across workflows." : "The source workflow was deleted; showing runs with the same snapshot name. Turn on the filter above to compare across workflows."}</Text>}
    </Paper>

    {detailsError && <Alert color="hiveWarning" title="Run data unavailable">{detailsError} Refresh to check whether both runs are still available.</Alert>}
    {baselineDetail && comparisonDetail && !comparisonAllowed && <Alert color="hiveWarning" title="Cross-workflow comparison is off">These runs belong to different workflows. Turn on “Include runs from other workflows” to compare them.</Alert>}
    {loadingDetails && <Group justify="center" p="xl"><Loader size="sm" /><Text size="sm" c="dimmed">Loading run snapshots…</Text></Group>}
    {baselineDetail && comparisonDetail && comparisonAllowed && <>
      <Paper withBorder radius="md" p="md">
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <RunSummary label="BASELINE" detail={baselineDetail} />
          <RunSummary label="COMPARISON" detail={comparisonDetail} />
        </SimpleGrid>
        {definitionChanged && <Alert mt="md" color="hiveSky" title="Workflow definition changed">The saved definitions differ. Node settings and graph structure are compared from the snapshots stored with each run.</Alert>}
          {(baselineDetail.run.status === "running" || comparisonDetail.run.status === "running" || baselineDetail.run.status === "queued" || comparisonDetail.run.status === "queued" || baselineDetail.run.status === "cancel_requested" || comparisonDetail.run.status === "cancel_requested") && <Alert mt="sm" color="hiveWarning" title="Live run data">At least one run is still active. Values can change; use Refresh comparison to load the latest stored state.</Alert>}
        <Group className="run-comparison-summary" mt="md" gap="lg" wrap="wrap">
          <Text size="sm"><b>{inputsChanged ? "Changed" : "Same"}</b> run inputs</Text><Text size="sm"><b>{changedCount}</b> changed nodes</Text><Text size="sm"><b>{addedCount}</b> added</Text><Text size="sm"><b>{removedCount}</b> removed</Text><Text size="sm"><b>{baselineDetail.run.status === comparisonDetail.run.status ? "Same" : `${baselineDetail.run.status} → ${comparisonDetail.run.status}`}</b> run status</Text>
          <details className="run-timing-details"><summary>Timing details</summary><Text size="xs">Baseline: {durationLabel(durationA)} · Comparison: {durationLabel(durationB)} · Delta: {durationDelta === null ? "Unavailable" : `${durationDelta > 0 ? "+" : ""}${durationLabel(durationDelta)}`}</Text></details>
        </Group>
        {(baselineDetail.publication || comparisonDetail.publication) && <Text size="xs" c="dimmed" mt="xs">Instagram publication state: {baselineDetail.publication?.status ?? "none"} → {comparisonDetail.publication?.status ?? "none"}. Workflow generation results are compared separately; this view does not publish.</Text>}
        {definitionChanged && <details className="run-settings-details run-comparison-collapsed"><summary>Workflow definition snapshots</summary><SimpleGrid cols={{ base: 1, md: 2 }} mt="xs"><pre className="run-json-diff">{displayJson(baselineDetail.run.workflowSnapshotJson)}</pre><pre className="run-json-diff">{displayJson(comparisonDetail.run.workflowSnapshotJson)}</pre></SimpleGrid></details>}
        {inputsChanged && <details className="run-settings-details run-comparison-collapsed"><summary>Run input values</summary><SimpleGrid cols={{ base: 1, md: 2 }} mt="xs"><pre className="run-json-diff">{displayJson(baselineDetail.run.inputJson ?? {})}</pre><pre className="run-json-diff">{displayJson(comparisonDetail.run.inputJson ?? {})}</pre></SimpleGrid></details>}
      </Paper>

      {suggestions.length > 0 && <Paper withBorder radius="md" p="md"><Text fw={600} size="sm" mb="xs">Suggested node matches</Text><Text size="xs" c="dimmed" mb="sm">Names and node types match, but IDs differ. Confirm a pair before Hive compares it.</Text><Stack gap="xs">{suggestions.map(({ baseline, comparison }) => <Group key={`${baseline.nodeId}:${comparison.nodeId}`} justify="space-between" wrap="wrap"><Text size="sm">{nodeLabel(baseline)} <Text component="span" c="dimmed">→</Text> {nodeLabel(comparison)}</Text><Button size="xs" variant="light" onClick={() => setConfirmedMatches((current) => ({ ...current, [baseline.nodeId]: comparison.nodeId }))}>Confirm match</Button></Group>)}</Stack></Paper>}

      <Group className="run-comparison-controls" justify="space-between" wrap="wrap"><Checkbox label="Show changed nodes only" checked={showChangedOnly} onChange={(event) => setShowChangedOnly(event.currentTarget.checked)} /><Text size="xs" c="dimmed">Unmatched nodes stay separate until a suggested match is confirmed.</Text></Group>
      <div className="run-comparison-layout">
        <Paper className="run-comparison-nodes" withBorder radius="md" p="xs">
          <Text fw={600} size="sm" p="xs">Workflow steps</Text>
          {visiblePairs.map((pair) => <button type="button" key={pairKey(pair)} className={`run-comparison-node${selectedPair === pairKey(pair) ? " is-selected" : ""}`} onClick={() => setSelectedPair(pairKey(pair))}>
            <span className="run-comparison-node-name">{nodeLabel(pair.baseline ?? pair.comparison!)}</span><span className="run-comparison-node-meta">{statusLabel(pair.baseline?.status)} → {statusLabel(pair.comparison?.status)}</span><Badge size="xs" variant="light" color={outputColor(outputState(pair.baseline, pair.comparison, baselineDetail.artifacts, comparisonDetail.artifacts))}>{outputStateLabel(outputState(pair.baseline, pair.comparison, baselineDetail.artifacts, comparisonDetail.artifacts))}</Badge>
          </button>)}
          {visiblePairs.length === 0 && <Text size="sm" c="dimmed" p="xs">No changed nodes.</Text>}
          {pairs.filter((pair) => !pair.baseline).length > 0 && <Text size="xs" c="dimmed" p="xs">Added to comparison: {pairs.filter((pair) => !pair.baseline).map((pair) => nodeLabel(pair.comparison!)).join(", ")}</Text>}
          {pairs.filter((pair) => !pair.comparison).length > 0 && <Text size="xs" c="dimmed" p="xs">Removed from comparison: {pairs.filter((pair) => !pair.comparison).map((pair) => nodeLabel(pair.baseline!)).join(", ")}</Text>}
        </Paper>
        <Paper className="run-comparison-detail" withBorder radius="md" p="md">
          {currentPair ? <NodeComparison pair={currentPair} left={baselineDetail} right={comparisonDetail} /> : <Text size="sm" c="dimmed">Select a workflow step to inspect its differences.</Text>}
        </Paper>
      </div>
    </>}
    {!baselineId && !loadingDetails && <Paper withBorder radius="md" p="lg"><Text size="sm" c="dimmed">Choose a baseline and comparison run to begin. Only runs owned by your account appear here.</Text></Paper>}
  </Stack>;
}

function RunSummary({ label, detail }: { label: string; detail: Detail }) {
  const run = detail.run;
  return <div className="run-comparison-run-summary"><Text size="xs" fw={600} c="dimmed">{label}</Text><Group justify="space-between" align="flex-start" wrap="wrap"><div><Text fw={600} size="sm">{run.workflowSnapshotJson?.name ?? "Workflow"}</Text><Text size="xs" c="dimmed">Created {date(run.createdAt)} · {run.startedAt ? `Started ${date(run.startedAt)}` : "Not started"} · Run {run.id.slice(0, 8)}</Text></div><Badge variant="light" color={statusColor(run.status)}>{run.status.replaceAll("_", " ")}</Badge></Group></div>;
}

function NodeComparison({ pair, left, right }: { pair: NodePair; left: Detail; right: Detail }) {
  const baseline = pair.baseline;
  const comparison = pair.comparison;
  const artifactsA = left.artifacts;
  const artifactsB = right.artifacts;
  const state = outputState(baseline, comparison, artifactsA, artifactsB);
  const artifactA = baseline?.outputJson?.artifactId ? artifactsA.find((artifact) => artifact.id === baseline.outputJson?.artifactId) : undefined;
  const artifactB = comparison?.outputJson?.artifactId ? artifactsB.find((artifact) => artifact.id === comparison.outputJson?.artifactId) : undefined;
  const textA = typeof baseline?.outputJson?.text === "string" ? baseline.outputJson.text : null;
  const textB = typeof comparison?.outputJson?.text === "string" ? comparison.outputJson.text : null;
  const rows = textA !== null && textB !== null ? diffLines(textA.slice(0, 30_000), textB.slice(0, 30_000)) : [];
  const settingsA = baseline ? { kind: nodeKind(baseline), label: nodeLabel(baseline), modelId: baseline.nodeSnapshotJson?.modelId ?? baseline.parameters?.modelId, dataTypeId: baseline.nodeSnapshotJson?.dataTypeId, parameters: baseline.parameters ?? {}, inputText: baseline.nodeSnapshotJson?.inputText, resolvedInput: baseline.resolvedInputJson ?? null } : null;
  const settingsB = comparison ? { kind: nodeKind(comparison), label: nodeLabel(comparison), modelId: comparison.nodeSnapshotJson?.modelId ?? comparison.parameters?.modelId, dataTypeId: comparison.nodeSnapshotJson?.dataTypeId, parameters: comparison.parameters ?? {}, inputText: comparison.nodeSnapshotJson?.inputText, resolvedInput: comparison.resolvedInputJson ?? null } : null;
  const media = Boolean(artifactA || artifactB);
  const structuredOutput = baseline?.outputJson && comparison?.outputJson && textA === null && textB === null && !media;
  return <Stack gap="sm">
    <Group justify="space-between" align="flex-start" wrap="wrap"><div><Text fw={600} size="sm">{nodeLabel(baseline ?? comparison!)}</Text><Text size="xs" c="dimmed">{baseline && comparison ? pair.matchKind === "id" ? "Matched by stable node ID" : "Confirmed suggested match" : baseline ? "Removed from comparison run" : "Added to comparison run"}</Text></div><Badge variant="light" color={outputColor(state)}>Output {outputStateLabel(state)}</Badge></Group>
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
      <NodeSide label="BASELINE" node={baseline} artifact={artifactA} duration={baseline ? nodeDuration(baseline) : null} />
      <NodeSide label="COMPARISON" node={comparison} artifact={artifactB} duration={comparison ? nodeDuration(comparison) : null} />
    </SimpleGrid>
    {baseline && comparison && <details className="run-timing-details"><summary>Step timing details</summary><Text size="xs">Baseline: {durationLabel(nodeDuration(baseline))} · Comparison: {durationLabel(nodeDuration(comparison))} · Delta: {nodeDuration(baseline) === null || nodeDuration(comparison) === null ? "Unavailable" : `${nodeDuration(comparison)! - nodeDuration(baseline)! > 0 ? "+" : ""}${durationLabel(nodeDuration(comparison)! - nodeDuration(baseline)!)}`}</Text></details>}
    {media && <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
      {(artifactA || baseline?.outputJson?.artifactId) && <div className="run-comparison-preview"><Text size="xs" fw={600} c="dimmed" mb={4}>BASELINE OUTPUT</Text>{artifactA ? <><ArtifactPreview artifactId={artifactA.id} label="Baseline output" mediaType={artifactA.mediaType} /><Text size="xs" c="dimmed" mt={4}>{artifactA.mediaType} · {formatFileSize(artifactA.byteSize)}{artifactA.checksum ? ` · SHA-256 ${artifactA.checksum.slice(0, 12)}` : ""}</Text></> : <Text size="sm" c="dimmed">Artifact unavailable.</Text>}</div>}
      {(artifactB || comparison?.outputJson?.artifactId) && <div className="run-comparison-preview"><Text size="xs" fw={600} c="dimmed" mb={4}>COMPARISON OUTPUT</Text>{artifactB ? <><ArtifactPreview artifactId={artifactB.id} label="Comparison output" mediaType={artifactB.mediaType} /><Text size="xs" c="dimmed" mt={4}>{artifactB.mediaType} · {formatFileSize(artifactB.byteSize)}{artifactB.checksum ? ` · SHA-256 ${artifactB.checksum.slice(0, 12)}` : ""}</Text></> : <Text size="sm" c="dimmed">Artifact unavailable.</Text>}</div>}
    </SimpleGrid>}
    {(artifactA?.mediaType.startsWith("audio/") || artifactB?.mediaType.startsWith("audio/")) && <Text size="xs" c="dimmed">Audio comparison is playback-based.</Text>}
    {(textA !== null || textB !== null) && <section className="run-text-diff" aria-label="Text output line comparison"><Text fw={600} size="xs">Text output · exact line comparison</Text><div className="run-text-diff-columns">{textA === null ? <MissingText label="BASELINE" /> : textB === null ? <TextPane label="BASELINE" text={textA} /> : <DiffPane label="BASELINE" rows={rows} side="left" />}{textB === null ? <MissingText label="COMPARISON" /> : textA === null ? <TextPane label="COMPARISON" text={textB} /> : <DiffPane label="COMPARISON" rows={rows} side="right" />}</div>{(textA?.length ?? 0) > 30_000 || (textB?.length ?? 0) > 30_000 ? <Text size="xs" c="dimmed">Text is truncated to 30,000 characters per side.</Text> : null}</section>}
    {structuredOutput && <section><Text fw={600} size="xs" mb={4}>Structured output</Text><SimpleGrid cols={{ base: 1, md: 2 }}><pre className="run-json-diff">{displayJson(baseline.outputJson)}</pre><pre className="run-json-diff">{displayJson(comparison.outputJson)}</pre></SimpleGrid></section>}
    <details className="run-settings-details"><summary>Configuration and resolved inputs</summary><SimpleGrid cols={{ base: 1, md: 2 }} mt="xs"><pre className="run-json-diff">{displayJson(settingsA)}</pre><pre className="run-json-diff">{displayJson(settingsB)}</pre></SimpleGrid></details>
  </Stack>;
}

function NodeSide({ label, node, artifact, duration }: { label: string; node: RunNode | null; artifact: Artifact | undefined; duration: number | null }) {
  const modality = node ? nodeTypeLabel(node.nodeSnapshotJson?.modality ?? node.nodeSnapshotJson?.kind ?? "input", node.nodeSnapshotJson?.modelId ?? node.parameters?.modelId) : "—";
  return <div className="run-comparison-side"><Text size="xs" fw={600} c="dimmed">{label}</Text>{node ? <Group justify="space-between" align="center" mt={4}><div><Text size="sm">{modality}</Text><Text size="xs" c="dimmed">{node.startedAt ? date(node.startedAt) : "Not started"} · {durationLabel(duration)}{artifact ? ` · ${formatFileSize(artifact.byteSize)}` : ""}</Text></div><Badge size="sm" variant="light" color={statusColor(node.status)}>{node.status.replaceAll("_", " ")}</Badge></Group> : <Text size="sm" c="dimmed" mt={4}>No matching node.</Text>}{node?.errorSummary && <Text size="xs" c="hiveError.7" mt={4}>{safeErrorSummary(node.errorSummary)}</Text>}</div>;
}

function DiffPane({ label, rows, side }: { label: string; rows: ReturnType<typeof diffLines>; side: "left" | "right" }) {
  return <div><Text size="xs" fw={600} c="dimmed" mb={4}>{label}</Text><pre className="run-text-diff-pane">{rows.map((row, index) => {
    if (side === "left" && row.kind === "added") return null;
    if (side === "right" && row.kind === "removed") return null;
    return <span className={`diff-line ${row.kind}`} key={`${index}:${row.kind}`}>{row.kind === "same" ? "  " : row.kind === "added" ? "+ " : "− "}{row.text || " "}{"\n"}</span>;
  })}</pre></div>;
}

function TextPane({ label, text }: { label: string; text: string }) {
  return <div><Text size="xs" fw={600} c="dimmed" mb={4}>{label}</Text><pre className="run-text-diff-pane">{text.slice(0, 30_000)}</pre></div>;
}

function MissingText({ label }: { label: string }) {
  return <div><Text size="xs" fw={600} c="dimmed" mb={4}>{label}</Text><Paper className="run-text-diff-pane" withBorder><Text size="sm" c="dimmed">No text output recorded.</Text></Paper></div>;
}

function outputColor(state: string): string {
  return state === "same" ? "hiveSuccess" : state.includes("only") ? "gray" : state === "unavailable" || state === "missing" ? "hiveWarning" : "hiveSky";
}
