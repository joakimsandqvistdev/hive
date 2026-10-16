import type { CustomNodeCatalogItem } from "./customNodeCatalog.js";
import type { WorkflowDefinition } from "./workflowDefinition.js";

export type WebhookTextInputTarget = {
  nodeId: string;
  label: string;
  jsonPath: string;
  defaultText: string;
};

function identifierSegment(label: string): string {
  const words = label.trim().replace(/([a-z0-9])([A-Z])/g, "$1 $2").match(/[A-Za-z0-9]+/g) ?? [];
  return words.map((word, index) => index === 0
    ? word[0]!.toLowerCase() + word.slice(1)
    : word[0]!.toUpperCase() + word.slice(1)).join("");
}

export function defaultWebhookIdentifier(label: string): string {
  return identifierSegment(label);
}

export function webhookIdentifierForNode(node: { label: string; parameters?: Record<string, unknown> }): string {
  const configured = node.parameters?.webhookIdentifier;
  return typeof configured === "string" ? configured.trim() : defaultWebhookIdentifier(node.label);
}

export function webhookPathIsValid(path: string): boolean {
  return path.length > 0
    && path.length <= 200
    && path.split(".").length <= 20
    && path.split(".").every((part) => /^[A-Za-z0-9_-]{1,80}$/.test(part));
}

export function collectWebhookTextInputs(
  definition: WorkflowDefinition,
  catalog: CustomNodeCatalogItem[],
): WebhookTextInputTarget[] {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const inputs: WebhookTextInputTarget[] = [];
  const visit = (current: WorkflowDefinition, nodePrefix: string, pathPrefix: string[], ancestry: Set<string>) => {
    for (const node of current.nodes) {
      if (node.kind === "input" && node.dataTypeId === "text") {
        const identifier = webhookIdentifierForNode(node);
        if (!identifier) continue;
        inputs.push({
          nodeId: `${nodePrefix}${node.id}`,
          label: node.label,
          jsonPath: [...pathPrefix, ...identifier.split(".")].join("."),
          defaultText: node.inputText,
        });
      } else if (node.kind === "custom") {
        const customNodeId = String(node.parameters?.customNodeId ?? "");
        const custom = byId.get(customNodeId);
        if (!custom || ancestry.has(customNodeId)) continue;
        const nextAncestry = new Set(ancestry);
        nextAncestry.add(customNodeId);
        visit(
          custom.definition as unknown as WorkflowDefinition,
          `${nodePrefix}${node.id}__`,
          [...pathPrefix, identifierSegment(node.label)].filter(Boolean),
          nextAncestry,
        );
      }
    }
  };
  visit(definition, "", [], new Set());
  return inputs;
}

export function webhookTextInputConflict(inputs: WebhookTextInputTarget[]): string | null {
  for (const input of inputs) {
    if (!webhookPathIsValid(input.jsonPath)) return `Webhook identifier “${input.jsonPath}” contains an invalid JSON path.`;
  }
  for (let leftIndex = 0; leftIndex < inputs.length; leftIndex += 1) {
    const left = inputs[leftIndex]!;
    const leftParts = left.jsonPath.split(".");
    for (let rightIndex = leftIndex + 1; rightIndex < inputs.length; rightIndex += 1) {
      const right = inputs[rightIndex]!;
      const rightParts = right.jsonPath.split(".");
      const commonLength = Math.min(leftParts.length, rightParts.length);
      const prefixMatches = leftParts.slice(0, commonLength).every((part, index) => part === rightParts[index]);
      if (prefixMatches) return left.jsonPath === right.jsonPath
        ? `Duplicate webhook identifier “${left.jsonPath}”.`
        : `Webhook identifiers “${left.jsonPath}” and “${right.jsonPath}” overlap.`;
    }
  }
  return null;
}

export function webhookTextInputContractChanged(
  storedMappings: Array<{ nodeId: string; source: string; path?: string }>,
  nextInputs: WebhookTextInputTarget[],
): boolean {
  const stored = storedMappings
    .filter((mapping) => mapping.source === "payload")
    .map(({ nodeId, path }) => `${nodeId}\0${path ?? ""}`)
    .sort();
  const next = nextInputs.map(({ nodeId, jsonPath }) => `${nodeId}\0${jsonPath}`).sort();
  return stored.length !== next.length || stored.some((mapping, index) => mapping !== next[index]);
}
