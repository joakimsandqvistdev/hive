import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../auth";

type ModelStatusResponse = { models?: Array<{ id: string; status: string }> };

export function useDownloadedModels() {
  const [status, setStatus] = useState<"checking" | "ready" | "unavailable">("checking");
  const [modelIds, setModelIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setStatus("checking");
    try {
      const response = await fetch(`${API_BASE}/api/models`, { credentials: "include" });
      if (!response.ok) throw new Error("model_status_unavailable");
      const body = await response.json() as ModelStatusResponse;
      setModelIds(new Set((body.models ?? []).filter((model) => model.status === "downloaded").map((model) => model.id)));
      setStatus("ready");
    } catch {
      setModelIds(new Set());
      setStatus("unavailable");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { status, modelIds, refresh };
}
