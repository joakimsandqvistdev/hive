import { useCallback, useEffect, useState } from "react";
import { Alert, Avatar, Button, Card, Group, Image, Loader, Select, Stack, Text, Title } from "@mantine/core";
import { apiFetch, apiUrl } from "../apiClient";
import { useFlashMessages } from "../components/FlashMessages";
import { ConfirmActionModal } from "../components/ConfirmActionModal";

type Account = { id: string; username: string; profileImageArtifactId: string | null };
type Asset = { id: string; displayName: string; mediaType: string; createdAt: string; runId: string | null };

export function AccountsPage() {
  const { showFlash } = useFlashMessages();
  const [account, setAccount] = useState<Account | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [accountResponse, assetResponse] = await Promise.all([apiFetch("/api/instagram/account"), apiFetch("/api/artifacts?dataTypeId=image")]);
      if (!accountResponse.ok || !assetResponse.ok) throw new Error("Could not load Instagram account settings.");
      const accountBody = await accountResponse.json() as { account: Account | null };
      const assetBody = await assetResponse.json() as { items: Asset[] };
      setAccount(accountBody.account); setSelectedAsset(accountBody.account?.profileImageArtifactId ?? null); setAssets(assetBody.items);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load account settings."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const connect = async () => {
    setError(null);
    try { const response = await apiFetch("/api/instagram/connect"); const body = await response.json() as { url?: string }; if (response.status === 503) throw new Error("Instagram Login is not configured. Add INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, and INSTAGRAM_TOKEN_ENCRYPTION_KEY to .env, then restart with npm run local."); if (!response.ok || !body.url) throw new Error("Could not start Instagram Login. Check the API logs and Meta app configuration."); window.location.assign(body.url); }
    catch (cause) { showFlash({ tone: "error", title: "Could not connect Instagram", message: cause instanceof Error ? cause.message : "Could not connect Instagram." }); }
  };
  const save = async () => {
    setSaving(true);
    try { const response = await apiFetch("/api/instagram/account", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileImageArtifactId: selectedAsset }) }); if (!response.ok) throw new Error("Could not save the profile picture selection."); showFlash({ tone: "success", title: "Profile picture selection saved", message: "Your Instagram profile picture selection was saved." }); }
    catch (cause) { showFlash({ tone: "error", title: "Could not save profile picture", message: cause instanceof Error ? cause.message : "Could not save the profile picture selection." }); }
    finally { setSaving(false); }
  };
  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const response = await apiFetch("/api/instagram/account", { method: "DELETE" });
      if (!response.ok) throw new Error(response.status === 409 ? "Resolve or delete this account’s publication history from Runs before disconnecting it." : "Could not disconnect Instagram.");
      setAccount(null); setDisconnectOpen(false); showFlash({ tone: "success", title: "Instagram disconnected", message: "The account was disconnected from Hive." });
    } catch (cause) { showFlash({ tone: "error", title: "Could not disconnect Instagram", message: cause instanceof Error ? cause.message : "Could not disconnect Instagram." }); }
    finally { setDisconnecting(false); }
  };
  const downloadSquareCrop = async () => {
    if (!selectedAsset) return;
    try {
      const response = await apiFetch(`/api/artifacts/${selectedAsset}/preview`);
      if (!response.ok) throw new Error("Could not open the selected image.");
      const objectUrl = URL.createObjectURL(await response.blob());
      const image = new window.Image(); image.src = objectUrl;
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Could not read the selected image.")); });
      const size = Math.min(image.naturalWidth, image.naturalHeight); const x = (image.naturalWidth - size) / 2; const y = (image.naturalHeight - size) / 2;
      const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = 1080;
      canvas.getContext("2d")!.drawImage(image, x, y, size, size, 0, 0, 1080, 1080);
      URL.revokeObjectURL(objectUrl);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not export profile image.")), "image/png"));
      const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "instagram-profile.png"; link.click(); URL.revokeObjectURL(url);
      showFlash({ tone: "success", title: "Profile image downloaded", message: "The square crop is ready to upload to Instagram." });
    } catch (cause) { showFlash({ tone: "error", title: "Could not prepare profile image", message: cause instanceof Error ? cause.message : "Could not prepare profile image." }); }
  };

  if (loading) return <Group justify="center" py="xl"><Loader /><Text>Loading accounts…</Text></Group>;
  return <Stack maw={900} mx="auto" w="100%">
    <Text c="dimmed">Connect a professional Instagram account for workflow publishing and prepare a profile picture from your Hive assets.</Text>
    {error && <Alert color="hiveError" title="Instagram settings unavailable">{error}</Alert>}
    {!account ? <Card withBorder><Stack><Text fw={600}>Instagram</Text><Text size="sm" c="dimmed">Connect one Business or Creator account to publish posts and Reels from workflows.</Text><Button w="fit-content" onClick={() => void connect()}>Connect Instagram</Button></Stack></Card> : <>
      <Card withBorder><Group justify="space-between"><Group><Avatar radius="xl">@</Avatar><div><Text fw={600}>@{account.username}</Text><Text size="sm" c="dimmed">Connected professional account</Text></div></Group><Button color="hiveError" variant="light" onClick={() => setDisconnectOpen(true)}>Disconnect</Button></Group></Card>
      <Card withBorder><Stack><div><Text fw={600}>Profile picture</Text><Text size="sm" c="dimmed">Choose an image already in your Hive assets. Hive prepares a centered square crop for download; upload it to Instagram manually.</Text></div>
        {selectedAsset && <Image src={apiUrl(`/api/artifacts/${selectedAsset}/preview`)} alt="Profile picture crop preview" w={128} h={128} fit="cover" radius={100} />}
        <Select label="Image asset" placeholder="Choose a generated or uploaded image" searchable clearable data={assets.map((asset) => ({ value: asset.id, label: `${asset.displayName}${asset.runId ? " · generated" : " · uploaded"}` }))} value={selectedAsset} onChange={setSelectedAsset} />
        <Group><Button variant="light" disabled={!selectedAsset} onClick={() => void downloadSquareCrop()}>Download square crop</Button><Button variant="light" onClick={() => void save()} loading={saving}>Save draft selection</Button></Group>
      </Stack></Card>
    </>}
    <ConfirmActionModal opened={disconnectOpen} onClose={() => { if (!disconnecting) setDisconnectOpen(false); }} title="Disconnect Instagram account?" confirmLabel="Disconnect account" loading={disconnecting} onConfirm={() => void disconnect()}>
      <Text size="sm">Disconnect @{account?.username}? Publishing nodes that use this account will need a different connected account.</Text>
    </ConfirmActionModal>
  </Stack>;
}
