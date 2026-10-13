import { useEffect, useState } from "react";
import type { AppView } from "../navigation/navigationState";
import { WorkflowEditor } from "./WorkflowEditor";
import { WorkflowLibrary } from "./WorkflowLibrary";

function editorIdFromHash() {
  return window.location.hash.match(/^#workflows\/([^/]+)$/)?.[1] ?? null;
}

export function WorkflowsPage({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const [workflowId, setWorkflowId] = useState<string | null>(editorIdFromHash);

  useEffect(() => {
    const syncHash = () => setWorkflowId(editorIdFromHash());
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  if (workflowId) {
    return <WorkflowEditor key={workflowId} workflowId={workflowId} onClose={() => { window.location.hash = "workflows"; }} onNavigate={onNavigate} />;
  }
  return <WorkflowLibrary onNavigate={onNavigate} />;
}
