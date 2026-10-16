# Decision 0028: Reusable Custom Nodes

## Status

Accepted

## Context

Workflow authors need to reuse graph logic across workflows and other reusable definitions. Duplicating a graph makes later behavior changes inconsistent and makes shared logic difficult to maintain.

## Decision

- Store each Custom Node as an owner-scoped workflow definition, distinguished by `workflows.is_custom_node`.
- Store an explicit selection of internal input and output ports as the public interface, configured in the Custom Node editor. Give each exposed port a caller-facing label. A selected port may also have internal connections. For existing definitions without a saved selection, preserve the legacy interface of every unconnected input/output port until the definition is next saved.
- Allow Custom Nodes to be created in a blank editor or by importing a complete workflow. Import creates independent node and edge IDs; references to existing Custom Nodes remain shared.
- Duplicate a Custom Node by copying its complete graph and interface into an independent definition; references to nested Custom Nodes remain shared.
- Run a Custom Node directly for testing only when it has no exposed inputs. Nodes with public inputs are run by adding them to a workflow and connecting the required values.
- Permit nested Custom Nodes but reject cycles. Before queueing a workflow run, recursively expand its Custom Nodes into a single validated graph and persist that graph in the run snapshot. A queued run therefore keeps the behavior it had when it was created.
- When a Custom Node interface changes, mark its direct and transitive dependent workflows and Custom Nodes **Needs attention**. Recompute this state after definitions are repaired so it clears automatically when the dependency chain is valid again.
- When deleting a Custom Node, show direct and transitive usage counts and block deletion while any workflow or Custom Node references it. Remove or replace those references first. This prevents breaking active reusable definitions and avoids creating missing-node placeholders.

## Consequences

Custom Node behavior is shared for future runs without changing already queued run snapshots. Custom Node edits do not require duplicating graph logic in consumer workflows. Interface changes require affected definitions to be reviewed before running. The graph stored in a run is self-contained and uses ordinary input/model/processing/publishing node kinds. Explicit interface selection lets authors keep implementation-only ports private, publish chosen ports even when the graph connects them internally, and give those ports names tailored to the caller.
