import { ActionIcon, Button, Group, Loader, Popover, ScrollArea, Stack, Text } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../apiClient";

type RunNotification = {
  id: string;
  runId: string;
  type: "run_failed" | "run_succeeded" | "run_awaiting_publish";
  workflowName: string;
  message: string;
  createdAt: string;
};

type NotificationsResponse = { items: RunNotification[]; unreadCount: number };

const notificationTone = {
  run_failed: { label: "Failed", dot: "failed" },
  run_succeeded: { label: "Succeeded", dot: "success" },
  run_awaiting_publish: { label: "Awaiting publishing", dot: "awaiting" },
} as const;

function BellIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 13h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function formatNotificationDate(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

export function NotificationsBell() {
  const [opened, setOpened] = useState(false);
  const [items, setItems] = useState<RunNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch("/api/notifications");
      if (!response.ok) throw new Error("Could not load notifications.");
      const body = await response.json() as NotificationsResponse;
      setItems(body.items);
      setUnreadCount(body.unreadCount);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load notifications.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    window.addEventListener("focus", refresh);
    const refreshOnReviewAction = () => { void refresh(); };
    window.addEventListener("hive:notifications-refresh", refreshOnReviewAction);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener("hive:notifications-refresh", refreshOnReviewAction); };
  }, [refresh]);

  const markRead = async (notification: RunNotification, openRun: boolean) => {
    setBusyId(notification.id);
    setError(null);
    try {
      const response = await apiFetch(`/api/notifications/${notification.id}/read`, { method: "POST" });
      if (!response.ok) throw new Error(response.status === 404 ? "This notification is no longer available." : "Could not mark the notification as read.");
      setItems((current) => current.filter((item) => item.id !== notification.id));
      setUnreadCount((current) => Math.max(0, current - 1));
      if (openRun) {
        setOpened(false);
        window.location.hash = `runs/${notification.runId}`;
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the notification."); }
    finally { setBusyId(null); }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    setError(null);
    try {
      const response = await apiFetch("/api/notifications/read-all", { method: "POST" });
      if (!response.ok) throw new Error("Could not mark notifications as read.");
      setItems([]);
      setUnreadCount(0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not mark notifications as read."); }
    finally { setMarkingAll(false); }
  };

  return <Popover opened={opened} onChange={setOpened} position="bottom-end" withArrow shadow="md" withinPortal>
    <Popover.Target>
      <ActionIcon className="notification-bell" variant="subtle" color="gray" size={44} aria-label={`Notifications, ${unreadCount} unread`} aria-expanded={opened} onClick={() => {
        const next = !opened;
        setOpened(next);
        if (next) { setLoading(true); void refresh(); }
      }}>
        <BellIcon />
        {unreadCount > 0 && <span className="notification-bell-count" aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </ActionIcon>
    </Popover.Target>
    <Popover.Dropdown className="notification-dropdown" w={460} maw="calc(100vw - 24px)">
      <Stack gap={0}>
        <Group className="notification-header" justify="space-between" align="center" wrap="nowrap">
          <div><Text fw={650} size="sm">Activity</Text><Text size="xs" c="dimmed">{unreadCount} unread notifications</Text></div>
          <Button variant="subtle" size="xs" disabled={unreadCount === 0 || markingAll} loading={markingAll} onClick={() => void markAllRead()}>Mark all as read</Button>
        </Group>
        {error && <Text className="notification-error" size="xs" c="hiveError.8" role="alert">{error}</Text>}
        {loading && items.length === 0 ? <Group justify="center" py="lg"><Loader size="sm" /></Group>
          : items.length === 0 ? <Text size="sm" c="dimmed" ta="center" py="lg">You’re all caught up.</Text>
            : <ScrollArea.Autosize mah={440} type="auto" offsetScrollbars>
              <div className="notification-list">
                {items.map((notification) => {
                  const tone = notificationTone[notification.type];
                  return <div key={notification.id} className="notification-row">
                    <span className={`notification-status-dot notification-status-${tone.dot}`} aria-hidden="true" />
                    <div className="notification-row-content">
                      <Group className="notification-row-heading" justify="space-between" wrap="nowrap" gap="xs">
                        <Text className="notification-workflow-name" size="xs" fw={600} lineClamp={1}>{notification.workflowName}</Text>
                        <Text className="notification-time" size="xs" c="dimmed">{formatNotificationDate(notification.createdAt)}</Text>
                      </Group>
                      <Text className="notification-summary" size="xs" c="dimmed" lineClamp={2}><span className="sr-only">{tone.label}: </span>{notification.message}</Text>
                      <Group className="notification-row-actions" justify="flex-end" gap="xs">
                        <Button variant="subtle" size="xs" loading={busyId === notification.id} disabled={busyId !== null} onClick={() => void markRead(notification, false)}>Mark read</Button>
                        <Button variant="subtle" size="xs" color="hiveSky" loading={busyId === notification.id} disabled={busyId !== null} onClick={() => void markRead(notification, true)}>View run</Button>
                      </Group>
                    </div>
                  </div>;
                })}
              </div>
            </ScrollArea.Autosize>}
      </Stack>
    </Popover.Dropdown>
  </Popover>;
}
