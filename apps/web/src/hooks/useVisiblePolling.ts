import { useEffect, useRef } from "react";

/** Poll only while the owning page is mounted and the browser tab is visible. */
export function useVisiblePolling(callback: () => void | Promise<void>, intervalMs: number, enabled = true) {
  const callbackRef = useRef(callback);
  useEffect(() => { callbackRef.current = callback; }, [callback]);
  useEffect(() => {
    if (!enabled) return;
    let inFlight = false;
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible" || inFlight) return;
      inFlight = true;
      void Promise.resolve(callbackRef.current()).finally(() => { inFlight = false; });
    };
    const timer = window.setInterval(refreshWhenVisible, intervalMs);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [enabled, intervalMs]);
}
