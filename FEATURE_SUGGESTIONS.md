# Feature Suggestion: Instagram Comment Response Workflows

## Summary

Let a connected Instagram professional account start a Hive workflow when someone comments on one of its posts or reels. The workflow can inspect the comment and related media, generate or choose a response, and either queue the response for approval or publish a reply through Instagram.

This would let account owners automate useful, on-brand responses while keeping control over what is posted publicly.

## Suggested user flow

1. In **Accounts**, the user opens a connected Instagram account and enables comment events.
2. The user creates a workflow with an **Instagram Comment** trigger and selects the account, event filters, and response mode.
3. The workflow receives comment context and runs its normal processing steps, such as text generation, moderation, or routing.
4. An **Instagram Comment Reply** publishing step receives the comment ID and reply text.
5. In **Manual review** mode, the proposed reply appears in Hive for editing and approval. In **Automatic** mode, Hive publishes it after validation.

## Trigger inputs

Expose stable, documented text values to the workflow, such as:

- `comment.text`
- `comment.id`
- `comment.author_username`
- `comment.timestamp`
- `media.id`
- `media.caption`
- `media.permalink`
- `account.id`

Only include fields that Meta actually supplies or that Hive can safely retrieve. Keep access tokens and other account credentials out of workflow inputs, run logs, and generated prompts by default.

## Configuration

The trigger should support:

- Selecting one connected Instagram account.
- Listening to comments on all eligible media or filtering to selected media where supported.
- Optional keyword or phrase filters, with clear include/exclude behavior.
- Excluding comments from the connected account and ignoring events that Hive has already processed.
- Choosing **Manual review** or **Automatic reply**.
- Optional minimum confidence/moderation checks before automatic publication.

The reply step should require a comment ID and reply text, validate Instagram's current limits before sending, and report a clear status to the run.

## Safety and reliability

- Verify Meta webhook signatures and subscribe only to the required comment fields.
- Make webhook processing idempotent so Meta retries do not create duplicate runs or replies.
- Persist event IDs and reply attempts; distinguish retryable failures from uncertain outcomes that need review.
- Prevent reply loops by ignoring comments authored by the connected account and events caused by Hive's own replies.
- Add per-account rate limiting and a pause/disable control for comment automation.
- Default new workflows to **Manual review**. Require an explicit user action to enable automatic replies.
- Keep a moderation/approval history and make it possible to stop an automatic workflow quickly.
- If a reply may have succeeded but Hive did not receive confirmation, mark it as needing review rather than retrying blindly.

## Product integration

- Show comment-trigger workflows and their health on the connected Instagram account's details.
- Add comment-trigger runs to **Runs**, including the original comment context, generated reply, and publication result.
- Reuse the existing run inspector and flash notifications where they fit.
- Keep comment monitoring separate from scheduled jobs: each accepted comment event starts a run, subject to account-level throttling and workflow availability.

## API and eligibility check before implementation

Before committing to this feature, verify the current Meta API support, app mode/review requirements, permissions, webhook subscription setup, reply endpoint behavior, and limits for the exact Instagram account login/API configuration Hive uses. Make these requirements visible in the account connection setup. If Meta does not permit a capability for the connected account or app, disable that mode with an actionable explanation rather than silently accepting a workflow that cannot run.

## Suggested implementation phases

1. **Comment intake:** Meta webhook subscription, signature verification, event deduplication, account association, and a run trigger with manual review only.
2. **Reply workflow step:** Add the Instagram Comment Reply publishing step and persist reply outcomes.
3. **Automatic replies:** Add opt-in automation, moderation gates, rate limits, pause controls, and operational visibility after manual review is reliable.

## Open product decisions

- Should automatic replies be allowed for all comments, or only after a moderation/classification node approves them?
- Should Hive support only public replies initially, or also any private reply capability Meta makes available?
- Should manual review have an expiration policy for old unanswered comments?
