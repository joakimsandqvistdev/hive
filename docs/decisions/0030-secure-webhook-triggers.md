# Secure webhook workflow triggers

Hive supports owner-scoped inbound webhook triggers for saved workflows. An enabled trigger accepts JSON over HTTPS, authenticates it with a per-trigger HMAC-SHA256 secret, maps supported values to workflow inputs, and queues a normal run. Execution remains in the existing worker and uses the ordinary immutable run snapshot, notification, publication, and media cleanup lifecycle.

## Request contract

- The caller sends a JSON object, `X-Hive-Timestamp`, a unique `X-Hive-Event-Id`, and `X-Hive-Signature: v1=<hex>`.
- The signed UTF-8 string is `v1\n<timestamp>\n<event-id>\n<lowercase SHA-256 hex digest of the exact raw body bytes>`. Verify the HMAC in constant time and require a timestamp within five minutes.
- Event IDs are required. A repeated ID and identical body returns the original delivery/run; reuse with a different body returns 409. Send a new event ID to intentionally queue another run.
- V1 maps JSON scalar fields to Text inputs and permits fixed saved Media Library assets for media inputs. It does not accept file bytes, arbitrary artifact IDs, caller-provided media URLs, or provider-native signature formats.
- Text input JSON paths are generated from a shared, stable Webhook identifier stored on each Text input node. The identifier defaults from the node's name and can be edited; dotted paths such as `brief.captionPrompt` are supported. Clearing it excludes that input from the webhook contract and duplicate-path checks.
- Text inputs inside Custom Nodes are included recursively. Each Custom Node instance name prefixes its contained inputs, so two instances can reuse the same internal identifiers while mapping to separate paths. Nested instances add each instance name as another path segment.
- If a payload value is absent, `null`, or an empty string, the configured Text input value is used. Other JSON scalar values are converted to text. Object and array values are invalid for Text inputs.
- A Text input with a non-empty Webhook identifier may be blank in a saved workflow or Custom Node so the request can supply it. A normal manual or Job run still requires configured text; a webhook run must resolve every required input after applying request values and configured defaults.
- When a workflow has no mapped Text inputs, an empty request body or `{}` runs it with configured workflow input values and any fixed saved-media mappings. Authentication headers remain required. If mapped Text inputs exist, omitted values still use their configured defaults and the run is rejected if a required input remains empty.
- Workflow and Custom Node saves reject duplicate or parent/child-overlapping JSON paths. If an enabled or paused, non-deleted trigger would map an input to a different path or target after an edit, the edit is blocked. Delete the trigger, update the external sender, and create a replacement trigger to change that contract.
- Limits: 256 KiB body, JSON depth 10, and 10 requests/minute per trigger. Delivery metadata is retained for 30 days; raw request bodies and signatures are not stored.

## Secret and ownership rules

- Generate a 32-byte signing secret and show it only on creation or rotation.
- Encrypt the secret at rest with a separate 32-byte base64 `WEBHOOK_SECRET_ENCRYPTION_KEY`. This key must remain stable and be backed up. A one-way hash is insufficient because the API must compute an HMAC.
- Trigger management and workflow/media mappings are owner-scoped. The database keeps a composite workflow/owner foreign key so a trigger cannot be attached to another user's workflow.
- Disabling/deleting or rotating a trigger immediately prevents old requests from queuing. Deleting a trigger is a soft delete so its delivery metadata may expire normally; deleting its workflow cascades the trigger and its delivery history.
- Deleting a run clears the delivery's run reference while retaining the delivery record until the 30-day retention cleanup.

## Validation and execution

- Payload preview is validation-only. A separately confirmed test-run action queues a normal run and warns that external side effects, including Instagram publishing, may occur.
- Valid signed requests that fail input/workflow validation are recorded as rejected deliveries. Invalid signatures are not persisted. Accepted run creation and its delivery record commit atomically.
- `WEBHOOK_PUBLIC_API_URL` supplies the public HTTPS API origin used in generated endpoints; localhost is not reachable by remote senders.
