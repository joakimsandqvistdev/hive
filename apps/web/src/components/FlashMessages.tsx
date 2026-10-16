import { ActionIcon, Group, Paper, Stack, Text } from "@mantine/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type FlashTone = "success" | "error" | "warning" | "neutral";
type FlashMessage = { id: string; tone: FlashTone; title: string; message: string; visible: boolean };
type FlashMessageOptions = { tone: FlashTone; title: string; message: string; durationMs?: number };
type FlashMessagesContextValue = { showFlash: (message: FlashMessageOptions) => void };

const FlashMessagesContext = createContext<FlashMessagesContextValue | null>(null);
const toneLabels: Record<FlashTone, string> = { success: "Success", error: "Error", warning: "Warning", neutral: "Update" };
const toneIcons: Record<FlashTone, string> = { success: "✓", error: "×", warning: "!", neutral: "i" };
const defaultDurations: Record<FlashTone, number> = { success: 5000, error: 8000, warning: 7000, neutral: 5000 };

export function FlashMessagesProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<FlashMessage[]>([]);
  const sequence = useRef(0);
  const expiryTimers = useRef(new Map<string, number>());
  const removalTimers = useRef(new Map<string, number>());

  const dismissFlash = useCallback((id: string) => {
    const expiry = expiryTimers.current.get(id);
    if (expiry !== undefined) window.clearTimeout(expiry);
    expiryTimers.current.delete(id);
    setMessages((current) => current.map((item) => item.id === id ? { ...item, visible: false } : item));
    if (!removalTimers.current.has(id)) {
      const removal = window.setTimeout(() => {
        setMessages((current) => current.filter((item) => item.id !== id));
        removalTimers.current.delete(id);
      }, 220);
      removalTimers.current.set(id, removal);
    }
  }, []);

  const showFlash = useCallback((options: FlashMessageOptions) => {
    const id = `${Date.now()}-${++sequence.current}`;
    setMessages((current) => [...current, { ...options, id, visible: true }]);
    const expiry = window.setTimeout(() => dismissFlash(id), options.durationMs ?? defaultDurations[options.tone]);
    expiryTimers.current.set(id, expiry);
  }, [dismissFlash]);

  useEffect(() => () => {
    for (const timer of expiryTimers.current.values()) window.clearTimeout(timer);
    for (const timer of removalTimers.current.values()) window.clearTimeout(timer);
  }, []);

  const contextValue = useMemo(() => ({ showFlash }), [showFlash]);
  return <FlashMessagesContext.Provider value={contextValue}>
    {children}
    {messages.length > 0 && <div className="hive-flash-region" aria-label="Notifications">
      <div className="hive-flash-stack">
        {messages.map((flash) => <div key={flash.id} className={`hive-flash-entry${flash.visible ? "" : " is-leaving"}`}>
          <Paper className={`hive-flash hive-flash-${flash.tone}`} withBorder radius="md" shadow="sm"
            role={flash.tone === "error" ? "alert" : "status"} aria-live={flash.tone === "error" ? "assertive" : "polite"}>
            <Group align="flex-start" justify="space-between" gap="sm" wrap="nowrap">
              <Group className="hive-flash-content" align="flex-start" gap="sm" wrap="nowrap">
                <span className="hive-flash-icon" aria-hidden="true">{toneIcons[flash.tone]}</span>
                <Stack gap={2}>
                  <Text className="hive-flash-type">{toneLabels[flash.tone]}</Text>
                  <Text size="sm" fw={700}>{flash.title}</Text>
                  <Text size="sm" c="dimmed">{flash.message}</Text>
                </Stack>
              </Group>
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Dismiss notification" onClick={() => dismissFlash(flash.id)}>
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
              </ActionIcon>
            </Group>
          </Paper>
        </div>)}
      </div>
    </div>}
  </FlashMessagesContext.Provider>;
}

export function useFlashMessages() {
  const context = useContext(FlashMessagesContext);
  if (!context) throw new Error("useFlashMessages must be used within FlashMessagesProvider.");
  return context;
}
