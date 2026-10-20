import { useCallback, useEffect, useState } from "react";
import { ActionIcon, Alert, Badge, Button, Card, Group, Image, Loader, Pagination, Paper, SegmentedControl, SimpleGrid, Stack, Tabs, Text, Textarea, TextInput, Title } from "@mantine/core";
import { apiFetch, apiUrl } from "../apiClient";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import { useFlashMessages } from "../components/FlashMessages";
import { formatFileSize } from "../formatters";
import { useVisiblePolling } from "../hooks/useVisiblePolling";
import type { AppView } from "../navigation/navigationState";

type LibraryImage = { id: string; displayName: string; mediaType: string; byteSize: number; createdAt: string; publicationCaption?: string | null };
type InstagramAccount = { id: string; username: string };
type PublicationMedia = { artifactId: string; displayName: string; mediaType: string; position: number; altText: string; sourcePublicationId: string | null };
type Draft = { id: string; accountId: string; caption: string; updatedAt: string; media: PublicationMedia[] };
type PostActivity = Draft & { status: "queued" | "publishing" | "published" | "awaiting_review"; errorSummary: string | null; publishedAt: string | null };
type AwaitingImage = { runId: string; sourcePublicationId: string; artifactId: string; displayName: string; mediaType: string; workflowName: string; caption?: string | null; createdAt: string };
type SelectedMedia = { artifactId: string; displayName: string; mediaType: string; byteSize?: number; sourcePublicationId: string | null };
type PublishPageProps = { onNavigate: (view: AppView) => void };
const pageSize = 12;

export function PublishPage({ onNavigate }: PublishPageProps) {
  const { showFlash } = useFlashMessages();
  const [account, setAccount] = useState<InstagramAccount | null>(null);
  const [items, setItems] = useState<LibraryImage[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activity, setActivity] = useState<PostActivity[]>([]);
  const [awaitingImages, setAwaitingImages] = useState<AwaitingImage[]>([]);
  const [mediaSource, setMediaSource] = useState("library");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedCache, setSelectedCache] = useState<Record<string, SelectedMedia>>({});
  const [altTextById, setAltTextById] = useState<Record<string, string>>({});
  const [caption, setCaption] = useState("");
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>("compose");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"publish" | "retry" | "delete-draft" | null>(null);
  const [deleteDraftTarget, setDeleteDraftTarget] = useState<Draft | null>(null);
  const [retryTarget, setRetryTarget] = useState<PostActivity | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const refreshDrafts = useCallback(async () => {
    const response = await apiFetch("/api/instagram/drafts");
    if (!response.ok) throw new Error("Could not load Instagram drafts.");
    const body = await response.json() as { items: Draft[] };
    setDrafts(body.items);
  }, []);

  const refreshActivity = useCallback(async () => {
    const response = await apiFetch("/api/instagram/history");
    if (!response.ok) throw new Error("Could not load publishing activity.");
    const body = await response.json() as { items: PostActivity[] };
    setActivity(body.items);
  }, []);

  const refreshAwaiting = useCallback(async () => {
    const response = await apiFetch("/api/instagram/awaiting-publish");
    if (!response.ok) throw new Error("Could not load runs awaiting publish.");
    const body = await response.json() as { items: AwaitingImage[] };
    setAwaitingImages(body.items);
  }, []);

  const refreshImages = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), type: "image", saveState: "saved", search });
    const response = await apiFetch(`/api/artifacts?${params}`);
    if (!response.ok) throw new Error("Could not load saved images.");
    const body = await response.json() as { items: LibraryImage[]; total: number };
    setItems(body.items);
    setTotal(body.total);
    setSelectedCache((current) => ({ ...current, ...Object.fromEntries(body.items.map((item) => [item.id, { artifactId: item.id, displayName: item.displayName, mediaType: item.mediaType, byteSize: item.byteSize, sourcePublicationId: null }])) }));
  }, [page, search]);

  useEffect(() => {
    let active = true;
    void apiFetch("/api/instagram/account").then(async (accountResponse) => {
      if (!accountResponse.ok) throw new Error("Could not load the connected Instagram account.");
      const body = await accountResponse.json() as { account: InstagramAccount | null };
      if (active) setAccount(body.account);
    }).catch((error) => {
      if (active) showFlash({ tone: "error", title: "Publish", message: error instanceof Error ? error.message : "Could not load publishing data." });
    });
    void refreshDrafts().catch((error) => { if (active) showFlash({ tone: "error", title: "Drafts", message: error instanceof Error ? error.message : "Could not load drafts." }); });
    void refreshActivity().catch((error) => { if (active) showFlash({ tone: "error", title: "Publish", message: error instanceof Error ? error.message : "Could not load publishing activity." }); });
    void refreshAwaiting().catch((error) => { if (active) showFlash({ tone: "error", title: "Awaiting publish", message: error instanceof Error ? error.message : "Could not load runs awaiting publish." }); });
    return () => { active = false; };
  }, [refreshActivity, refreshAwaiting, refreshDrafts, showFlash]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void refreshImages().catch((error) => {
      if (active) showFlash({ tone: "error", title: "Media Library", message: error instanceof Error ? error.message : "Could not load saved images." });
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshImages, showFlash]);

  useVisiblePolling(() => { void refreshActivity().catch(() => {}); }, 5000, activeTab === "activity");
  useVisiblePolling(() => { void refreshAwaiting().catch(() => {}); }, 5000, activeTab === "compose" && mediaSource === "awaiting");

  const selected: SelectedMedia[] = selectedIds.flatMap((id) => {
    const cached = selectedCache[id];
    if (cached) return [cached];
    const libraryItem = items.find((item) => item.id === id);
    if (libraryItem) return [{ artifactId: libraryItem.id, displayName: libraryItem.displayName, mediaType: libraryItem.mediaType, byteSize: libraryItem.byteSize, sourcePublicationId: null }];
    const draftItem = drafts.flatMap((draft) => draft.media).find((item) => item.artifactId === id);
    return draftItem ? [{ artifactId: draftItem.artifactId, displayName: draftItem.displayName, mediaType: draftItem.mediaType, sourcePublicationId: draftItem.sourcePublicationId }] : [];
  });
  const chooseImage = (item: SelectedMedia) => {
    const id = item.artifactId;
    setSelectedCache((current) => ({ ...current, [id]: item }));
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 10) { showFlash({ tone: "warning", title: "Carousel limit", message: "Instagram posts can contain up to 10 images." }); return current; }
      return [...current, id];
    });
    setPreviewIndex(0);
  };
  const seedAltText = (artifactId: string, caption?: string | null) => {
    if (caption == null || selectedIds.includes(artifactId) || altTextById[artifactId] !== undefined) return;
    setAltTextById((current) => current[artifactId] !== undefined ? current : { ...current, [artifactId]: caption });
  };
  const chooseLibraryImage = (item: LibraryImage) => {
    seedAltText(item.id, item.publicationCaption);
    chooseImage({ artifactId: item.id, displayName: item.displayName, mediaType: item.mediaType, byteSize: item.byteSize, sourcePublicationId: null });
  };
  const chooseAwaitingImage = (item: AwaitingImage) => {
    seedAltText(item.artifactId, item.caption);
    chooseImage({ artifactId: item.artifactId, displayName: item.displayName, mediaType: item.mediaType, sourcePublicationId: item.sourcePublicationId });
  };
  const updateCaption = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.currentTarget?.value ?? "";
    setCaption(value);
  };

  const saveDraft = async () => {
    if (!account || selectedIds.length === 0) throw new Error("Choose an Instagram account and at least one saved image.");
    const path = activeDraftId ? `/api/instagram/drafts/${activeDraftId}` : "/api/instagram/drafts";
    const response = await apiFetch(path, {
      method: activeDraftId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: account.id, media: selected.map((item) => ({ artifactId: item.artifactId, sourcePublicationId: item.sourcePublicationId, altText: altTextById[item.artifactId] ?? "" })), caption }),
    });
    const body = await response.json().catch(() => ({})) as { publication?: { id: string }; message?: string };
    if (!response.ok || !body.publication) throw new Error(body.message ?? "Could not save this draft.");
    setActiveDraftId(body.publication.id);
    await refreshDrafts();
    return body.publication.id;
  };

  const runConfirmedAction = async () => {
    setSaving(true);
    try {
      if (confirmAction === "publish") {
        const id = await saveDraft();
        const response = await apiFetch(`/api/instagram/drafts/${id}/publish`, { method: "POST" });
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error === "instagram_not_configured" ? "Instagram publishing is not configured on this Hive server." : "Could not queue this Instagram post.");
        }
        showFlash({ tone: "success", title: "Post queued", message: "Hive will publish your post to Instagram and show the result in Publish." });
        setConfirmAction(null);
        setActiveDraftId(null);
        setSelectedIds([]);
        setAltTextById({});
        setCaption("");
        await refreshDrafts();
        await refreshAwaiting();
      } else if (confirmAction === "delete-draft" && deleteDraftTarget) {
        const response = await apiFetch(`/api/instagram/drafts/${deleteDraftTarget.id}`, { method: "DELETE" });
        if (!response.ok) throw new Error("Could not delete this draft.");
        setDrafts((current) => current.filter((draft) => draft.id !== deleteDraftTarget.id));
        if (activeDraftId === deleteDraftTarget.id) { setActiveDraftId(null); setSelectedIds([]); setAltTextById({}); setCaption(""); }
        setDeleteDraftTarget(null);
        setConfirmAction(null);
        showFlash({ tone: "success", title: "Draft deleted", message: "The draft was removed." });
      } else if (confirmAction === "retry" && retryTarget) {
        const response = await apiFetch(`/api/instagram/publications/${retryTarget.id}/publish`, { method: "POST" });
        if (!response.ok) throw new Error("Could not retry this Instagram post.");
        setConfirmAction(null);
        setRetryTarget(null);
        showFlash({ tone: "success", title: "Post queued", message: "Hive will retry publishing this post." });
        await refreshActivity();
      }
    } catch (error) {
      showFlash({ tone: "error", title: "Publish", message: error instanceof Error ? error.message : "Could not complete this action." });
    } finally { setSaving(false); }
  };

  const openDraft = (draft: Draft) => {
    setActiveDraftId(draft.id);
    const media = [...draft.media].sort((a, b) => a.position - b.position);
    setSelectedCache((current) => ({ ...current, ...Object.fromEntries(media.map((item) => [item.artifactId, { artifactId: item.artifactId, displayName: item.displayName, mediaType: item.mediaType, sourcePublicationId: item.sourcePublicationId }])) }));
    setAltTextById((current) => ({ ...current, ...Object.fromEntries(media.map((item) => [item.artifactId, item.altText ?? ""])) }));
    setSelectedIds(media.map((item) => item.artifactId));
    setCaption(draft.caption ?? "");
    setPreviewIndex(0);
    setMediaSource("library");
    setActiveTab("compose");
  };

  const moveSelected = (index: number, direction: -1 | 1) => {
    setSelectedIds((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
      return next;
    });
  };
  const reorderSelected = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= selectedIds.length || to >= selectedIds.length) return;
    setSelectedIds((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to, 0, moved);
      return next;
    });
    setPreviewIndex((current) => current === from ? to : current > from && current <= to ? current - 1 : current < from && current >= to ? current + 1 : current);
  };

  return <Stack className="workspace-page" gap="md">
    <Group className="page-header" justify="space-between" align="flex-end">
      <div><Title order={1} className="page-title">Publish</Title><Text size="sm" c="dimmed">Compose Instagram posts from saved images and runs awaiting publish.</Text></div>
      <Button variant="default" onClick={() => setActiveTab("drafts")}>Drafts ({drafts.length})</Button>
    </Group>
    {!loading && !account && <Alert color="hiveWarning" title="Connect an Instagram account first">Connect your Instagram professional account to publish media from Hive.<Button ml="sm" variant="light" size="xs" onClick={() => onNavigate("accounts")}>Open Accounts</Button></Alert>}
    <Tabs value={activeTab} onChange={setActiveTab} keepMounted={false}>
      <Tabs.List><Tabs.Tab value="compose">Create post</Tabs.Tab><Tabs.Tab value="drafts">Drafts ({drafts.length})</Tabs.Tab><Tabs.Tab value="activity">Activity</Tabs.Tab></Tabs.List>
      <Tabs.Panel value="compose" pt="md">
        {loading ? <Group justify="center" py="xl"><Loader size="sm" /></Group> : <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" mb="sm"><div><Text fw={600}>Choose media</Text><Text size="xs" c="dimmed">Select 1–10 images. Multiple images publish as a carousel.</Text></div><Badge variant="light" color="hiveSky">{selectedIds.length} selected</Badge></Group>
            <SegmentedControl fullWidth mb="sm" value={mediaSource} onChange={setMediaSource} data={[{ label: "Media Library", value: "library" }, { label: `Awaiting publish (${awaitingImages.length})`, value: "awaiting" }]} />
            {mediaSource === "library" ? <>
            <TextInput label="Search saved images" placeholder="Search by file name" value={search} onChange={(event) => { setSearch(event.currentTarget.value); setPage(1); }} mb="sm" />
            {items.length ? <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
              {items.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                const order = selectedIds.indexOf(item.id);
                return <Card key={item.id} className={`publish-media-card${isSelected ? " is-selected" : ""}`} withBorder p={5} radius="sm" onClick={() => chooseLibraryImage(item)} role="checkbox" aria-checked={isSelected} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chooseLibraryImage(item); } }}>
                  <div className="publish-media-image-wrap"><Image src={apiUrl(`/api/artifacts/${item.id}/thumbnail`)} alt={item.displayName} fit="cover" className="publish-media-image" /><span className={`publish-media-selection${isSelected ? " is-selected" : ""}`}>{isSelected ? order + 1 : ""}</span></div>
                  <Text size="xs" fw={500} lineClamp={1} mt={5}>{item.displayName}</Text><Text size="xs" c="dimmed">{formatFileSize(item.byteSize)}</Text>
                </Card>;
              })}
            </SimpleGrid> : <Text size="sm" c="dimmed" py="xl" ta="center">No saved images match. Save an image in Media Library to use it here.</Text>}
            <Group justify="space-between" mt="md"><Text size="xs" c="dimmed">{total} saved images</Text><Pagination size="sm" total={Math.max(1, Math.ceil(total / pageSize))} value={page} onChange={setPage} disabled={total <= pageSize} /></Group>
            </> : <Stack gap="xs">
              {awaitingImages.length ? awaitingImages.map((item) => {
                const isSelected = selectedIds.includes(item.artifactId);
                const order = selectedIds.indexOf(item.artifactId);
                return <Card key={item.sourcePublicationId} className={`publish-media-card${isSelected ? " is-selected" : ""}`} withBorder p="xs" radius="sm" onClick={() => chooseAwaitingImage(item)} role="checkbox" aria-checked={isSelected} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chooseAwaitingImage(item); } }}>
                  <Group wrap="nowrap" gap="sm"><div className="publish-media-image-wrap"><Image src={apiUrl(`/api/artifacts/${item.artifactId}/thumbnail`)} alt={item.displayName} w={58} h={58} fit="cover" radius="sm" /><span className={`publish-media-selection${isSelected ? " is-selected" : ""}`}>{isSelected ? order + 1 : ""}</span></div><div style={{ flex: 1, minWidth: 0 }}><Text size="sm" fw={500} lineClamp={1}>{item.displayName}</Text><Text size="xs" c="dimmed" lineClamp={1}>{item.workflowName} · Run {item.runId.slice(0, 8)}</Text><Badge size="xs" color="hiveWarning" variant="light" mt={4}>Awaiting publish</Badge></div></Group>
                </Card>;
              }) : <Text size="sm" c="dimmed" py="xl" ta="center">No image runs are awaiting publish.</Text>}
              <Text size="xs" c="dimmed">Selected runs stay Awaiting publish until Instagram confirms success.</Text>
            </Stack>}
          </Paper>
          <Stack gap="md">
            <Paper withBorder p="md" radius="md">
              <Group justify="space-between" mb="sm"><Text fw={600}>Post details</Text>{activeDraftId && <Badge color="gray" variant="light">Draft</Badge>}</Group>
              <Stack gap="sm">
                <Group align="flex-end" wrap="nowrap"><TextInput label="Instagram account" value={account ? `@${account.username}` : "Not connected"} readOnly style={{ flex: 1 }} /><Button variant="default" onClick={() => onNavigate("accounts")}>Accounts</Button></Group>
                <div><Text size="sm" fw={500} mb={6}>Carousel order</Text>{selected.length ? <Stack gap={6}>{selected.map((item, index) => <Paper key={item.artifactId} withBorder p={8} radius="sm" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (draggedIndex !== null) reorderSelected(draggedIndex, index); setDraggedIndex(null); }} style={{ opacity: draggedIndex === index ? 0.55 : 1 }}>
                  <Group wrap="nowrap" gap="xs">
                    <Text size="sm" c="dimmed" aria-label={`Drag slide ${index + 1}`} draggable onDragStart={(event) => { setDraggedIndex(index); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.artifactId); }} onDragEnd={() => setDraggedIndex(null)} style={{ cursor: "grab", userSelect: "none" }}>⠿</Text><Text size="xs" c="dimmed" w={18} ta="center">{index + 1}</Text><Image src={apiUrl(`/api/artifacts/${item.artifactId}/thumbnail`)} alt="" w={42} h={42} fit="cover" radius="sm" /><Text size="xs" fw={500} lineClamp={1} style={{ flex: 1 }}>{item.displayName}</Text>
                    <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Move ${item.displayName} up`} disabled={index === 0} onClick={() => moveSelected(index, -1)}>↑</ActionIcon><ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Move ${item.displayName} down`} disabled={index === selected.length - 1} onClick={() => moveSelected(index, 1)}>↓</ActionIcon><ActionIcon variant="subtle" color="hiveError" size="sm" aria-label={`Remove ${item.displayName}`} onClick={() => chooseImage(item)}>×</ActionIcon>
                  </Group>
                  <Textarea mt="xs" label={`Alt text for slide ${index + 1}`} placeholder="Describe this image for screen reader users" value={altTextById[item.artifactId] ?? ""} onChange={(event) => { const value = event.currentTarget.value; setAltTextById((current) => ({ ...current, [item.artifactId]: value })); }} maxLength={1000} autosize minRows={2} maxRows={4} description={`${(altTextById[item.artifactId] ?? "").length} / 1,000 characters`} />
                </Paper>)}</Stack> : <Text size="xs" c="dimmed">Select images from Media Library or Awaiting publish.</Text>}</div>
                <Textarea label="Caption" value={caption ?? ""} onChange={updateCaption} maxLength={2200} autosize minRows={4} maxRows={8} description={`${(caption ?? "").length} / 2,200 characters · One caption for the whole post`} />
                <Group justify="space-between"><Button variant="default" loading={saving} disabled={!selectedIds.length || !account} onClick={() => { setSaving(true); void saveDraft().then(() => showFlash({ tone: "success", title: "Draft saved", message: "Your Instagram post draft is saved." })).catch((error) => showFlash({ tone: "error", title: "Draft", message: error instanceof Error ? error.message : "Could not save the draft." })).finally(() => setSaving(false)); }}>Save draft</Button><Button loading={saving} disabled={!selectedIds.length || !account} onClick={() => setConfirmAction("publish")}>Review and publish</Button></Group>
              </Stack>
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Group justify="space-between" mb="sm"><Text fw={600}>Instagram preview</Text><Text size="xs" c="dimmed">{selected.length ? `Slide ${previewIndex + 1} of ${selected.length}` : "Select media to preview"}</Text></Group>
              {selected[previewIndex] ? <Stack align="center" gap="xs"><Paper withBorder radius="md" p="xs" w="min(100%, 330px)"><Group gap="xs" mb="xs"><div className="publish-preview-avatar" /><Text size="xs" fw={600}>@{account?.username ?? "your account"}</Text></Group><Image src={apiUrl(`/api/artifacts/${selected[previewIndex]!.artifactId}/preview`)} alt={`Slide ${previewIndex + 1}`} fit="contain" mah={360} radius="sm" /><Text size="xs" lineClamp={2} mt="xs"><strong>@{account?.username}</strong>　{caption || "Your caption will appear here."}</Text></Paper><Group><Button variant="subtle" size="xs" disabled={previewIndex === 0} onClick={() => setPreviewIndex((value) => value - 1)}>Previous</Button><Button variant="subtle" size="xs" disabled={previewIndex >= selected.length - 1} onClick={() => setPreviewIndex((value) => value + 1)}>Next slide</Button></Group></Stack> : <Text size="sm" c="dimmed" ta="center" py="xl">Choose one or more images to preview your Instagram post.</Text>}
            </Paper>
          </Stack>
        </SimpleGrid>}
      </Tabs.Panel>
      <Tabs.Panel value="drafts" pt="md">
        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb="md"><div><Text fw={600}>Saved drafts</Text><Text size="xs" c="dimmed">Continue editing a draft or remove it.</Text></div><Button onClick={() => { setActiveDraftId(null); setSelectedIds([]); setAltTextById({}); setCaption(""); setActiveTab("compose"); }}>New post</Button></Group>
          {loading ? <Loader size="sm" /> : drafts.length ? <Stack gap="xs">{drafts.map((draft) => <Paper withBorder p="sm" radius="sm" key={draft.id}><Group justify="space-between" wrap="nowrap"><Group wrap="nowrap" gap="sm"><Group gap={4}>{draft.media.slice(0, 3).map((item) => <Image key={item.artifactId} src={apiUrl(`/api/artifacts/${item.artifactId}/thumbnail`)} alt="" w={44} h={44} fit="cover" radius="sm" />)}</Group><div><Text size="sm" fw={500}>{draft.media.length} image{draft.media.length === 1 ? "" : "s"} · @{account?.username ?? "Instagram"}</Text><Text size="xs" c="dimmed" lineClamp={1}>{draft.caption || "No caption"}</Text><Text size="xs" c="dimmed">Updated {new Date(draft.updatedAt).toLocaleString()}</Text></div></Group><Group gap="xs" wrap="nowrap"><Button variant="default" size="xs" onClick={() => openDraft(draft)}>Open</Button><ActionIcon variant="subtle" color="hiveError" aria-label="Delete draft" onClick={() => { setDeleteDraftTarget(draft); setConfirmAction("delete-draft"); }}>×</ActionIcon></Group></Group></Paper>)}</Stack> : <Text size="sm" c="dimmed" ta="center" py="xl">No saved drafts yet.</Text>}
        </Paper>
      </Tabs.Panel>
      <Tabs.Panel value="activity" pt="md">
        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb="md"><div><Text fw={600}>Publishing activity</Text><Text size="xs" c="dimmed">Instagram posts composed from library images and runs awaiting publish.</Text></div><Button variant="default" onClick={() => void refreshActivity()}>Refresh</Button></Group>
          {activity.length ? <Stack gap="xs">{activity.map((post) => <Paper withBorder p="sm" radius="sm" key={post.id}><Group justify="space-between" wrap="nowrap"><Group wrap="nowrap" gap="sm"><Group gap={4}>{post.media.slice(0, 3).map((item) => <Image key={item.artifactId} src={apiUrl(`/api/artifacts/${item.artifactId}/thumbnail`)} alt="" w={42} h={42} fit="cover" radius="sm" />)}</Group><div><Group gap="xs"><Text size="sm" fw={500}>{post.media.length} image{post.media.length === 1 ? "" : "s"}</Text><Badge color={post.status === "published" ? "hiveSuccess" : post.status === "awaiting_review" ? "hiveWarning" : "hiveSky"} variant="light">{post.status.replaceAll("_", " ")}</Badge></Group><Text size="xs" c="dimmed" lineClamp={1}>{post.caption || "No caption"}</Text>{post.errorSummary && <Text size="xs" c="hiveError">{post.errorSummary}</Text>}{post.status === "awaiting_review" && <Text size="xs" c="dimmed">If Instagram’s result is uncertain, check the account before retrying.</Text>}</div></Group>{post.status === "awaiting_review" && <Button size="xs" variant="default" onClick={() => { setRetryTarget(post); setConfirmAction("retry"); }}>Review and retry</Button>}</Group></Paper>)}</Stack> : <Text size="sm" c="dimmed" ta="center" py="xl">No standalone posts yet.</Text>}
        </Paper>
      </Tabs.Panel>
    </Tabs>
    <ConfirmActionModal opened={confirmAction === "publish"} onClose={() => setConfirmAction(null)} title="Publish Instagram post?" confirmLabel="Publish now" color="hiveSky" loading={saving} onConfirm={() => void runConfirmedAction()}>
      <Text>Hive will submit {selectedIds.length === 1 ? "this image as a post" : `these ${selectedIds.length} images as a carousel`} to @{account?.username}. Check each image description, the order, and caption before publishing.{selected.some((item) => item.sourcePublicationId) && ` The selected run${new Set(selected.filter((item) => item.sourcePublicationId).map((item) => item.sourcePublicationId)).size === 1 ? "" : "s"} will change to Succeeded after Instagram confirms the post.`}</Text>
    </ConfirmActionModal>
    <ConfirmActionModal opened={confirmAction === "delete-draft"} onClose={() => { setConfirmAction(null); setDeleteDraftTarget(null); }} title="Delete draft?" confirmLabel="Delete draft" loading={saving} onConfirm={() => void runConfirmedAction()}>
      <Text>The draft will be removed. The saved images will remain in Media Library.</Text>
    </ConfirmActionModal>
    <ConfirmActionModal opened={confirmAction === "retry"} onClose={() => { setConfirmAction(null); setRetryTarget(null); }} title="Retry Instagram post?" confirmLabel="Queue retry" color="hiveSky" loading={saving} onConfirm={() => void runConfirmedAction()}>
      <Text>If you are unsure whether Instagram received the previous attempt, check the account first to avoid publishing a duplicate.</Text>
    </ConfirmActionModal>
  </Stack>;
}
