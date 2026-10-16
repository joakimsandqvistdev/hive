export type WebhookDelivery = {
  id: string;
  eventId: string;
  outcome: "accepted" | "rejected";
  statusCode: number;
  errorCode: string | null;
  runId: string | null;
  receivedAt: string;
};

export type WebhookTrigger = {
  id: string;
  workflowId: string;
  workflowName: string;
  name: string;
  enabled: boolean;
  hasSecret: boolean;
  endpointUrl: string | null;
  createdAt: string;
  updatedAt: string;
  lastDelivery: WebhookDelivery | null;
};
