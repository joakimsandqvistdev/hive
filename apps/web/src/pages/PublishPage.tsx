import { useCallback, useEffect, useState } from "react";
import { ActionIcon, Alert, Badge, Box, Button, Card, Group, Image, Loader, Pagination, Paper, SegmentedControl, SimpleGrid, Stack, Tabs, Text, Textarea, TextInput, Title } from "@mantine/core";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { apiFetch, apiUrl } from "../apiClient";
import { ArtifactThumbnail } from "../components/ArtifactThumbnail";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import { useFlashMessages } from "../components/FlashMessages";
import { PaginatedListSlots } from "../components/PaginatedPageSlots";
import { formatFileSize } from "../formatters";
import { useVisiblePolling } from "../hooks/useVisiblePolling";
import type { AppView } from "../navigation/navigationState";

type LibraryImage = { id: string; displayName: string; mediaType: string; byteSize: number; createdAt: string; publicationCaption?: string | null };
type InstagramAccount = { id: string; username: string };
type PublicationMedia = { artifactId: string; displayName: string; mediaType: string; position: number; altText: string; sourcePublicationId: string | null };
type Draft = { id: string; accountId: string; caption: string; updatedAt: string; media: (PublicationMedia & { byteSize?: number })[] };
type PostActivity = Draft & { status: "queued" | "publishing" | "published" | "awaiting_review"; errorSummary: string | null; publishedAt: string | null };
type AwaitingImage = { runId: string; sourcePublicationId: string; artifactId: string; displayName: string; mediaType: string; workflowName: string; caption?: string | null; createdAt: string };
type ReviewItem = AwaitingImage;
type SelectedMedia = { artifactId: string; displayName: string; mediaType: string; byteSize?: number; sourcePublicationId: string | null };
type PublishPageProps = { onNavigate: (view: AppView) => void };
const pageSize = 10;
const reviewPageSize = 10;

function ActivityThumbnail({ artifactId, alt, size = 42 }: { artifactId: string; alt: string; size?: number }) {
  return <ArtifactThumbnail artifactId={artifactId} alt={alt} size={size} />;
}

function SortablePublicationMedia({ item, index, altText, onAltTextChange, onRemove }: {
  item: SelectedMedia;
  index: number;
  altText: string;
  onAltTextChange: (artifactId: string, value: string) => void;
  onRemove: (item: SelectedMedia) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.artifactId });
  return <Paper ref={setNodeRef} withBorder p={8} radius="sm" style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 }}>
    <Group wrap="nowrap" gap="xs">
      <ActionIcon ref={setActivatorNodeRef} {...attributes} {...listeners} variant="subtle" color="gray" size="sm" aria-label={`Drag to reorder slide ${index + 1}`} style={{ cursor: "grab", touchAction: "none" }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
      </ActionIcon>
      <Text size="xs" c="dimmed" w={18} ta="center">{index + 1}</Text>
      <ArtifactThumbnail artifactId={item.artifactId} size={42} />
      <Text size="xs" fw={500} lineClamp={1} style={{ flex: 1 }}>{item.displayName}</Text>
      <ActionIcon variant="subtle" color="hiveError" size="sm" aria-label={`Remove ${item.displayName}`} onClick={() => onRemove(item)}>×</ActionIcon>
    </Group>
    <Textarea mt="xs" label={`Alt text for slide ${index + 1}`} placeholder="Describe this image for screen reader users" value={altText} onChange={(event) => onAltTextChange(item.artifactId, event.currentTarget.value)} maxLength={1000} autosize minRows={2} maxRows={4} description={`${altText.length} / 1,000 characters`} />
  </Paper>;
}

export function PublishPage({ onNavigate }: PublishPageProps) {
  const { showFlash } = useFlashMessages();
  const [account, setAccount] = useState<InstagramAccount | null>(null);
  const [items, setItems] = useState<LibraryImage[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activity, setActivity] = useState<PostActivity[]>([]);
  const [awaitingImages, setAwaitingImages] = useState<AwaitingImage[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [skippedReviewIds, setSkippedReviewIds] = useState<string[]>([]);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [mediaSource, setMediaSource] = useState("library");
  const [search, setSearch] = useState("");
  const [awaitingSearch, setAwaitingSearch] = useState("");
  const [page, setPage] = useState(1);
  const [awaitingPage, setAwaitingPage] = useState(1);
  const [draftsPage, setDraftsPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
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

  const refreshAwaiting = useCallback(async (draftId?: string | null) => {
    const params = new URLSearchParams();
    if (draftId) params.set("draftId", draftId);
    const response = await apiFetch(`/api/instagram/awaiting-publish${params.size ? `?${params}` : ""}`);
    if (!response.ok) throw new Error("Could not load runs awaiting publish.");
    const body = await response.json() as { items: AwaitingImage[] };
    setAwaitingImages(body.items);
  }, []);

  const refreshReview = useCallback(async () => {
    const response = await apiFetch("/api/instagram/awaiting-review");
    if (!response.ok) throw new Error("Could not load runs awaiting review.");
    const body = await response.json() as { items: ReviewItem[] };
    setReviewItems(body.items);
    return body.items;
  }, []);

  const markRunNotificationsRead = async (runId: string) => {
    const response = await apiFetch(`/api/notifications/runs/${runId}/read`, { method: "POST" });
    if (!response.ok) throw new Error("Could not mark this run’s activity notifications as read.");
    window.dispatchEvent(new Event("hive:notifications-refresh"));
  };

  const refreshReviewPass = async () => {
    setSkippedReviewIds([]);
    setActiveReviewId(null);
    setReviewPage(1);
    try {
      await refreshReview();
    } catch (error) { showFlash({ tone: "error", title: "Review queue", message: error instanceof Error ? error.message : "Could not load runs awaiting review." }); }
  };

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
    void refreshReview().catch((error) => { if (active) showFlash({ tone: "error", title: "Review queue", message: error instanceof Error ? error.message : "Could not load runs awaiting review." }); });
    return () => { active = false; };
  }, [refreshActivity, refreshAwaiting, refreshDrafts, refreshReview, showFlash]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void refreshImages().catch((error) => {
      if (active) showFlash({ tone: "error", title: "Media Library", message: error instanceof Error ? error.message : "Could not load saved images." });
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshImages, showFlash]);

  useVisiblePolling(() => { void refreshActivity().catch(() => {}); }, 5000, activeTab === "activity");
  useVisiblePolling(() => { void refreshAwaiting(activeDraftId).catch(() => {}); }, 5000, activeTab === "compose" && mediaSource === "awaiting");
  useVisiblePolling(() => { void refreshReview().catch(() => {}); }, 5000, activeTab === "review");

  const reviewQueue = reviewItems.filter((item) => !skippedReviewIds.includes(item.sourcePublicationId));
  const activeReview = reviewQueue.find((item) => item.sourcePublicationId === activeReviewId) ?? reviewQueue[0] ?? null;
  const reviewPageCount = Math.max(1, Math.ceil(reviewQueue.length / reviewPageSize));
  const currentReviewPage = Math.min(reviewPage, reviewPageCount);
  const visibleReviewItems = reviewQueue.slice((currentReviewPage - 1) * reviewPageSize, currentReviewPage * reviewPageSize);
  const filteredAwaitingImages = awaitingImages.filter((item) => {
    const query = awaitingSearch.trim().toLowerCase();
    return !query || `${item.displayName} ${item.workflowName} ${item.runId}`.toLowerCase().includes(query);
  });
  const awaitingPageCount = Math.max(1, Math.ceil(filteredAwaitingImages.length / pageSize));
  const currentAwaitingPage = Math.min(awaitingPage, awaitingPageCount);
  const visibleAwaitingImages = filteredAwaitingImages.slice((currentAwaitingPage - 1) * pageSize, currentAwaitingPage * pageSize);
  const draftsPageCount = Math.max(1, Math.ceil(drafts.length / pageSize));
  const currentDraftsPage = Math.min(draftsPage, draftsPageCount);
  const visibleDrafts = drafts.slice((currentDraftsPage - 1) * pageSize, currentDraftsPage * pageSize);
  const activityPageCount = Math.max(1, Math.ceil(activity.length / pageSize));
  const currentActivityPage = Math.min(activityPage, activityPageCount);
  const visibleActivity = activity.slice((currentActivityPage - 1) * pageSize, currentActivityPage * pageSize);
  const activeDraft = activeDraftId ? drafts.find((draft) => draft.id === activeDraftId) : undefined;
  const draftLibraryItems: LibraryImage[] = (activeDraft?.media ?? []).filter((item) => item.sourcePublicationId === null).map((item) => ({ id: item.artifactId, displayName: item.displayName, mediaType: item.mediaType, byteSize: item.byteSize ?? 0, createdAt: activeDraft!.updatedAt }));
  const visibleLibraryItems = [...draftLibraryItems, ...items.filter((item) => !draftLibraryItems.some((draftItem) => draftItem.id === item.id))];

  const skipReviewItem = async () => {
    if (!activeReview) return;
    setReviewSaving(true);
    try {
      await markRunNotificationsRead(activeReview.runId);
      const index = reviewQueue.findIndex((item) => item.sourcePublicationId === activeReview.sourcePublicationId);
      setSkippedReviewIds((current) => current.includes(activeReview.sourcePublicationId) ? current : [...current, activeReview.sourcePublicationId]);
      const nextIndex = reviewQueue.length ? (index + 1) % reviewQueue.length : -1;
      setActiveReviewId(reviewQueue[nextIndex]?.sourcePublicationId ?? null);
      if (nextIndex >= 0) setReviewPage(Math.floor(nextIndex / reviewPageSize) + 1);
    } finally { setReviewSaving(false); }
  };

  const completeReviewItem = async (item: ReviewItem, action: "approve" | "discard") => {
    setReviewSaving(true);
    try {
    const index = reviewQueue.findIndex((candidate) => candidate.sourcePublicationId === item.sourcePublicationId);
    const nextItem = reviewQueue.slice(index + 1).find((candidate) => candidate.sourcePublicationId !== item.sourcePublicationId) ??
      reviewQueue.find((candidate) => candidate.sourcePublicationId !== item.sourcePublicationId);
    const nextId = nextItem?.sourcePublicationId ?? null;
    const response = await apiFetch(`/api/instagram/publications/${item.sourcePublicationId}/${action}`, { method: "POST" });
    if (!response.ok) throw new Error(action === "approve" ? "Could not approve this run." : "Could not discard this run.");
    await markRunNotificationsRead(item.runId);
    setReviewItems((current) => current.filter((candidate) => candidate.sourcePublicationId !== item.sourcePublicationId));
    setAwaitingImages((current) => action === "discard" ? current.filter((candidate) => candidate.sourcePublicationId !== item.sourcePublicationId) : current);
    setSkippedReviewIds((current) => current.filter((id) => id !== item.sourcePublicationId));
    setActiveReviewId(nextId);
    if (nextItem) {
      const nextIndex = reviewQueue.findIndex((candidate) => candidate.sourcePublicationId === nextId);
      setReviewPage(Math.floor(Math.max(0, nextIndex - (nextIndex > index ? 1 : 0)) / reviewPageSize) + 1);
    }
    if (action === "discard") void refreshAwaiting().catch(() => {});
    showFlash({ tone: "success", title: action === "approve" ? "Run approved" : "Run discarded", message: action === "approve" ? "It remains available in Awaiting publish." : "The run is marked Succeeded and removed from publishing." });
    } finally { setReviewSaving(false); }
  };

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
    const existingIndex = selectedIds.indexOf(id);
    if (existingIndex >= 0) {
      const nextIds = selectedIds.filter((selectedId) => selectedId !== id);
      setSelectedIds(nextIds);
      setPreviewIndex((current) => {
        if (current === existingIndex) return nextIds.length ? Math.min(existingIndex, nextIds.length - 1) : 0;
        return existingIndex < current ? current - 1 : current;
      });
      return;
    }
    if (selectedIds.length >= 10) { showFlash({ tone: "warning", title: "Carousel limit", message: "Instagram posts can contain up to 10 images." }); return; }
    setSelectedIds([...selectedIds, id]);
    setPreviewIndex(selectedIds.length);
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
    await refreshAwaiting(body.publication.id);
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
        await refreshAwaiting(activeDraftId === deleteDraftTarget.id ? null : activeDraftId);
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
    void refreshAwaiting(draft.id).catch((error) => showFlash({ tone: "error", title: "Awaiting publish", message: error instanceof Error ? error.message : "Could not load runs awaiting publish." }));
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

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );
  const handleCarouselDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = selectedIds.indexOf(String(active.id));
    const to = selectedIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    reorderSelected(from, to);
  };

  const instagramPreview = <Paper withBorder p="md" radius="md">
    <Group justify="space-between" mb="sm"><Text fw={600}>Instagram preview</Text><Text size="xs" c="dimmed">{selected.length ? `Slide ${previewIndex + 1} of ${selected.length}` : "Select media to preview"}</Text></Group>
    {selected[previewIndex] ? <Stack align="center" gap="xs"><Paper withBorder radius="md" p="xs" w="min(100%, 330px)"><Group gap="xs" mb="xs"><div className="publish-preview-avatar" /><Text size="xs" fw={600}>@{account?.username ?? "your account"}</Text></Group><Image src={apiUrl(`/api/artifacts/${selected[previewIndex]!.artifactId}/preview`)} alt={`Slide ${previewIndex + 1}`} fit="contain" mah={360} radius="sm" /><Text size="xs" lineClamp={2} mt="xs"><strong>@{account?.username}</strong>　{caption || "Your caption will appear here."}</Text></Paper><Group><Button variant="subtle" size="xs" disabled={previewIndex === 0} onClick={() => setPreviewIndex((value) => value - 1)}>Previous</Button><Button variant="subtle" size="xs" disabled={previewIndex >= selected.length - 1} onClick={() => setPreviewIndex((value) => value + 1)}>Next slide</Button></Group></Stack> : <Text size="sm" c="dimmed" ta="center" py="xl">Choose one or more images to preview your Instagram post.</Text>}
  </Paper>;

  return <Stack className="workspace-page" gap="md">
    <Group className="page-header" justify="space-between" align="flex-end">
      <div><Title order={1} className="page-title">Publish</Title><Text size="sm" c="dimmed">Review workflow posts, then compose and publish Instagram media.</Text></div>
      <Button variant="default" onClick={() => setActiveTab("drafts")}>Drafts ({drafts.length})</Button>
    </Group>
    {!loading && !account && <Alert color="hiveWarning" title="Connect an Instagram account first">Connect your Instagram professional account to publish media from Hive.<Button ml="sm" variant="light" size="xs" onClick={() => onNavigate("accounts")}>Open Accounts</Button></Alert>}
    <Tabs value={activeTab} onChange={(value) => {
      if (value === "review" && activeTab !== "review") { setSkippedReviewIds([]); void refreshReview().catch((error) => showFlash({ tone: "error", title: "Review queue", message: error instanceof Error ? error.message : "Could not load runs awaiting review." })); }
      setActiveTab(value);
    }} keepMounted={false}>
      <Tabs.List><Tabs.Tab value="review">Review ({reviewQueue.length})</Tabs.Tab><Tabs.Tab value="compose">Create post</Tabs.Tab><Tabs.Tab value="drafts">Drafts ({drafts.length})</Tabs.Tab><Tabs.Tab value="activity">Activity</Tabs.Tab></Tabs.List>
      <Tabs.Panel value="review" pt="md">
        {reviewItems.length ? <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md" verticalSpacing="md" style={{ alignItems: "start" }}>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" mb="sm"><div><Text fw={600}>Awaiting review</Text><Text size="xs" c="dimmed">{reviewQueue.length} left in this pass</Text></div><Button variant="default" size="xs" onClick={refreshReviewPass}>Refresh</Button></Group>
            <PaginatedListSlots pageSize={reviewPageSize} minItemHeight={80} gap={8}>{visibleReviewItems.map((item) => {
              const isCurrent = activeReview?.sourcePublicationId === item.sourcePublicationId;
              return <Paper key={item.sourcePublicationId} withBorder p="xs" radius="sm" role="button" tabIndex={0} aria-pressed={isCurrent} onClick={() => setActiveReviewId(item.sourcePublicationId)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveReviewId(item.sourcePublicationId); } }} style={{ cursor: "pointer", borderColor: isCurrent ? "var(--mantine-color-hiveSky-6)" : undefined, background: isCurrent ? "var(--mantine-color-hiveSky-0)" : undefined }}>
              <Group wrap="nowrap" gap="sm" align="center"><ArtifactThumbnail artifactId={item.artifactId} alt={item.displayName} size={54} /><div style={{ minWidth: 0, flex: 1 }}><Text size="sm" fw={500} lineClamp={1}>{item.workflowName}</Text><Text size="xs" c="dimmed">Run {item.runId.slice(0, 8)}</Text><Text size="xs" c="dimmed" lineClamp={1}>{item.displayName}</Text></div>{isCurrent ? <Group gap={4} wrap="nowrap"><Button size="xs" variant="default" disabled={reviewSaving} onClick={() => { void skipReviewItem().catch((error) => showFlash({ tone: "error", title: "Review", message: error instanceof Error ? error.message : "Could not mark this run’s notifications as read." })); }}>Skip</Button><Button size="xs" color="hiveError" variant="light" loading={reviewSaving} onClick={() => { void completeReviewItem(item, "discard").catch((error) => showFlash({ tone: "error", title: "Review", message: error instanceof Error ? error.message : "Could not discard this run." })); }}>Discard</Button><Button size="xs" loading={reviewSaving} onClick={() => { void completeReviewItem(item, "approve").catch((error) => showFlash({ tone: "error", title: "Review", message: error instanceof Error ? error.message : "Could not approve this run." })); }}>Approve</Button></Group> : <Badge color="hiveWarning" variant="light">Next</Badge>}</Group>
            </Paper>; })}
            {reviewQueue.length === 0 && <Text size="sm" c="dimmed" ta="center" py="md">All runs in this pass were skipped. Refresh to show them again.</Text>}
            </PaginatedListSlots>
            {reviewQueue.length > reviewPageSize && <Group justify="space-between" mt="sm"><Text size="xs" c="dimmed">{(currentReviewPage - 1) * reviewPageSize + 1}–{Math.min(currentReviewPage * reviewPageSize, reviewQueue.length)} of {reviewQueue.length}</Text><Pagination size="sm" total={reviewPageCount} value={currentReviewPage} onChange={setReviewPage} /></Group>}
          </Paper>
          <Paper withBorder p="md" radius="md">
            {activeReview ? <Stack gap="md">
              <Group justify="space-between"><div><Text fw={600}>{activeReview.workflowName}</Text><Text size="xs" c="dimmed">Run {activeReview.runId} · Awaiting publish</Text></div><Badge color="hiveWarning" variant="light">Instagram post</Badge></Group>
              <Paper withBorder p="xs" radius="md" bg="gray.0"><Image src={apiUrl(`/api/artifacts/${activeReview.artifactId}/preview`)} alt={activeReview.displayName} fit="contain" mah={620} /></Paper>
              <div><Text size="sm" fw={600} mb={4}>Caption</Text><Paper withBorder p="sm" radius="sm"><Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{activeReview.caption || "No caption was added."}</Text></Paper></div>
            </Stack> : <Stack align="center" py="xl" gap="xs"><Text fw={600}>You’re caught up for now</Text><Text size="sm" c="dimmed">Skipped runs will appear again the next time you open Review.</Text></Stack>}
          </Paper>
        </SimpleGrid> : <Paper withBorder p="xl" radius="md"><Stack align="center" gap="xs"><Text fw={600}>No runs awaiting review</Text><Text size="sm" c="dimmed">Manual Instagram posts from workflow runs will appear here.</Text></Stack></Paper>}
      </Tabs.Panel>
      <Tabs.Panel value="compose" pt="md">
        {loading ? <Group justify="center" py="xl"><Loader size="sm" /></Group> : <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" mb="sm"><div><Text fw={600}>Choose media</Text><Text size="xs" c="dimmed">Select 1–10 images. Multiple images publish as a carousel.</Text></div><Badge variant="light" color="hiveSky">{selectedIds.length} selected</Badge></Group>
            <SegmentedControl fullWidth mb="sm" value={mediaSource} onChange={(value) => { setMediaSource(value); if (value === "awaiting") setAwaitingPage(1); }} data={[{ label: "Media Library", value: "library" }, { label: `Awaiting publish (${awaitingImages.length})`, value: "awaiting" }]} />
            {mediaSource === "library" ? <Stack gap="xs">
            <TextInput label="Search saved images" placeholder="Search by file name" value={search} onChange={(event) => { setSearch(event.currentTarget.value); setPage(1); }} />
            {items.length ? <PaginatedListSlots pageSize={pageSize} minItemHeight={70} gap={8}>
              {visibleLibraryItems.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                const order = selectedIds.indexOf(item.id);
                return <Card key={item.id} className={`publish-media-card${isSelected ? " is-selected" : ""}`} withBorder p={0} radius="sm" onClick={() => chooseLibraryImage(item)} role="checkbox" aria-checked={isSelected} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chooseLibraryImage(item); } }}>
                  <Group className="publish-media-card-row" wrap="nowrap" gap="sm" align="center"><ActivityThumbnail artifactId={item.id} alt={item.displayName} size={60} /><div className="publish-media-card-copy"><Text size="sm" fw={500} lineClamp={1}>{item.displayName}</Text><Text size="xs" c="dimmed">{item.byteSize ? formatFileSize(item.byteSize) : "Saved image"}</Text></div>{isSelected && <Badge variant="light" color="hiveSky" aria-label={`Selected as slide ${order + 1}`}>{order + 1}</Badge>}</Group>
                </Card>;
              })}
            </PaginatedListSlots> : <Text size="sm" c="dimmed" py="xl" ta="center">No saved images match. Save an image in Media Library to use it here.</Text>}
            <Group justify="space-between"><Text size="xs" c="dimmed">{total} saved images</Text><Pagination size="sm" total={Math.max(1, Math.ceil(total / pageSize))} value={page} onChange={setPage} disabled={total <= pageSize} /></Group>
            </Stack> : <Stack gap="xs">
              <TextInput label="Search awaiting publish" placeholder="Search file, workflow, or run ID" value={awaitingSearch} onChange={(event) => { setAwaitingSearch(event.currentTarget.value); setAwaitingPage(1); }} />
              <PaginatedListSlots pageSize={pageSize} minItemHeight={70} gap={8}>{filteredAwaitingImages.length ? visibleAwaitingImages.map((item) => {
                const isSelected = selectedIds.includes(item.artifactId);
                const order = selectedIds.indexOf(item.artifactId);
                return <Card key={item.sourcePublicationId} className={`publish-media-card${isSelected ? " is-selected" : ""}`} withBorder p={0} radius="sm" onClick={() => chooseAwaitingImage(item)} role="checkbox" aria-checked={isSelected} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chooseAwaitingImage(item); } }}>
                  <Group className="publish-media-card-row" wrap="nowrap" gap="sm" align="center"><ActivityThumbnail artifactId={item.artifactId} alt={item.displayName} size={60} /><div className="publish-media-card-copy"><Text size="sm" fw={500} lineClamp={1}>{item.displayName}</Text><Text size="xs" c="dimmed" lineClamp={1}>{item.workflowName} · Run {item.runId.slice(0, 8)}</Text></div><Group className="publish-media-row-badges" gap={6} wrap="nowrap"><Badge size="xs" color={item.sourcePublicationId && item.sourcePublicationId === activeDraft?.media.find((mediaItem) => mediaItem.artifactId === item.artifactId)?.sourcePublicationId ? "hiveSky" : "hiveWarning"} variant="light">{item.sourcePublicationId && activeDraft?.media.some((mediaItem) => mediaItem.sourcePublicationId === item.sourcePublicationId) ? "In this draft" : "Awaiting publish"}</Badge>{isSelected && <Badge variant="light" color="hiveSky" aria-label={`Selected as slide ${order + 1}`}>{order + 1}</Badge>}</Group></Group>
                </Card>;
              }) : <Text size="sm" c="dimmed" py="xl" ta="center">{awaitingImages.length ? "No awaiting publish runs match this search." : "No image runs are awaiting publish."}</Text>}</PaginatedListSlots>
              {filteredAwaitingImages.length > 0 && <Group justify="space-between" mt="sm"><Text size="xs" c="dimmed">{(currentAwaitingPage - 1) * pageSize + 1}–{Math.min(currentAwaitingPage * pageSize, filteredAwaitingImages.length)} of {filteredAwaitingImages.length} runs</Text><Pagination size="sm" total={awaitingPageCount} value={currentAwaitingPage} onChange={setAwaitingPage} disabled={filteredAwaitingImages.length <= pageSize} /></Group>}
              <Text size="xs" c="dimmed">Selected runs stay Awaiting publish until Instagram confirms success.</Text>
            </Stack>}
          </Paper>
          <Stack gap="md">
            {instagramPreview}
            <Paper withBorder p="md" radius="md">
              <Group justify="space-between" mb="sm"><Text fw={600}>Post details</Text>{activeDraftId && <Badge color="gray" variant="light">Draft</Badge>}</Group>
              <Stack gap="sm">
                <Group align="flex-end" wrap="nowrap"><TextInput label="Instagram account" value={account ? `@${account.username}` : "Not connected"} readOnly style={{ flex: 1 }} /><Button variant="default" onClick={() => onNavigate("accounts")}>Accounts</Button></Group>
                <div><Text size="sm" fw={500} mb={6}>Carousel order</Text>{selected.length ? <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleCarouselDragEnd}><SortableContext items={selected.map((item) => item.artifactId)} strategy={verticalListSortingStrategy}><Stack gap={6}>{selected.map((item, index) => <SortablePublicationMedia key={item.artifactId} item={item} index={index} altText={altTextById[item.artifactId] ?? ""} onAltTextChange={(artifactId, value) => setAltTextById((current) => ({ ...current, [artifactId]: value }))} onRemove={chooseImage} />)}</Stack></SortableContext></DndContext> : <Text size="xs" c="dimmed">Select images from Media Library or Awaiting publish.</Text>}</div>
                <Textarea label="Caption" value={caption ?? ""} onChange={updateCaption} maxLength={2200} autosize minRows={4} maxRows={8} description={`${(caption ?? "").length} / 2,200 characters · One caption for the whole post`} />
                <Group justify="space-between"><Button variant="default" loading={saving} disabled={!selectedIds.length || !account} onClick={() => { setSaving(true); void saveDraft().then(() => showFlash({ tone: "success", title: "Draft saved", message: "Your Instagram post draft is saved." })).catch((error) => showFlash({ tone: "error", title: "Draft", message: error instanceof Error ? error.message : "Could not save the draft." })).finally(() => setSaving(false)); }}>Save draft</Button><Button loading={saving} disabled={!selectedIds.length || !account} onClick={() => setConfirmAction("publish")}>Review and publish</Button></Group>
              </Stack>
            </Paper>
          </Stack>
        </SimpleGrid>}
      </Tabs.Panel>
      <Tabs.Panel value="drafts" pt="md">
        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb="md"><div><Text fw={600}>Saved drafts</Text><Text size="xs" c="dimmed">Continue editing a draft or remove it.</Text></div><Button onClick={() => { setActiveDraftId(null); setSelectedIds([]); setAltTextById({}); setCaption(""); setActiveTab("compose"); void refreshAwaiting().catch(() => {}); }}>New post</Button></Group>
          {loading ? <Loader size="sm" /> : <PaginatedListSlots pageSize={pageSize} minItemHeight={76} gap={8}>{drafts.length ? visibleDrafts.map((draft) => <Paper withBorder p="sm" radius="sm" key={draft.id}><Group justify="space-between" wrap="nowrap"><Group wrap="nowrap" gap="sm"><Group gap={4}>{draft.media.slice(0, 3).map((item) => <ArtifactThumbnail key={item.artifactId} artifactId={item.artifactId} size={44} />)}</Group><div><Text size="sm" fw={500}>{draft.media.length} image{draft.media.length === 1 ? "" : "s"} · @{account?.username ?? "Instagram"}</Text><Text size="xs" c="dimmed" lineClamp={1}>{draft.caption || "No caption"}</Text><Text size="xs" c="dimmed">Updated {new Date(draft.updatedAt).toLocaleString()}</Text></div></Group><Group gap="xs" wrap="nowrap"><Button variant="default" size="xs" onClick={() => openDraft(draft)}>Open</Button><ActionIcon variant="subtle" color="hiveError" aria-label="Delete draft" onClick={() => { setDeleteDraftTarget(draft); setConfirmAction("delete-draft"); }}>×</ActionIcon></Group></Group></Paper>) : <Text size="sm" c="dimmed" ta="center" py="xl">No saved drafts yet.</Text>}</PaginatedListSlots>}
          {drafts.length > 0 && <Group justify="space-between" mt="md"><Text size="xs" c="dimmed">{(currentDraftsPage - 1) * pageSize + 1}–{Math.min(currentDraftsPage * pageSize, drafts.length)} of {drafts.length} drafts</Text><Pagination size="sm" total={draftsPageCount} value={currentDraftsPage} onChange={setDraftsPage} disabled={drafts.length <= pageSize} /></Group>}
        </Paper>
      </Tabs.Panel>
      <Tabs.Panel value="activity" pt="md">
        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb="md"><div><Text fw={600}>Publishing activity</Text><Text size="xs" c="dimmed">Instagram posts composed from library images and runs awaiting publish.</Text></div><Button variant="default" onClick={() => void refreshActivity()}>Refresh</Button></Group>
          <PaginatedListSlots pageSize={pageSize} minItemHeight={92} gap={8}>{activity.length ? visibleActivity.map((post) => <Paper withBorder p="sm" radius="sm" key={post.id}><Group justify="space-between" align="start" wrap="nowrap"><Group align="start" wrap="nowrap" gap="sm" style={{ minWidth: 0, flex: 1 }}><Group wrap="nowrap" gap={4} style={{ flex: "0 0 auto" }}>{post.media.slice(0, 3).map((item) => <ActivityThumbnail key={item.artifactId} artifactId={item.artifactId} alt={item.displayName} />)}</Group><Box style={{ flex: 1, minWidth: 0 }}><Group gap="xs"><Text size="sm" fw={500}>{post.media.length} image{post.media.length === 1 ? "" : "s"}</Text><Badge color={post.status === "published" ? "hiveSuccess" : post.status === "awaiting_review" ? "hiveWarning" : "hiveSky"} variant="light">{post.status.replaceAll("_", " ")}</Badge></Group><Text size="xs" c="dimmed" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{post.caption || "No caption"}</Text>{post.errorSummary && <Text size="xs" c="hiveError">{post.errorSummary}</Text>}{post.status === "awaiting_review" && <Text size="xs" c="dimmed">If Instagram’s result is uncertain, check the account before retrying.</Text>}</Box></Group>{post.status === "awaiting_review" && <Button size="xs" variant="default" onClick={() => { setRetryTarget(post); setConfirmAction("retry"); }}>Review and retry</Button>}</Group></Paper>) : <Text size="sm" c="dimmed" ta="center" py="xl">No standalone posts yet.</Text>}</PaginatedListSlots>
          {activity.length > 0 && <Group justify="space-between" mt="md"><Text size="xs" c="dimmed">{(currentActivityPage - 1) * pageSize + 1}–{Math.min(currentActivityPage * pageSize, activity.length)} of {activity.length} posts</Text><Pagination size="sm" total={activityPageCount} value={currentActivityPage} onChange={setActivityPage} disabled={activity.length <= pageSize} /></Group>}
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
