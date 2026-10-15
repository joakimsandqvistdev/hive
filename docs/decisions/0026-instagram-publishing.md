# Instagram publishing through workflow nodes

## Decision

Instagram publishing is modeled as workflow nodes in a new Publishing category. The first node types are Instagram Post (image + caption) and Instagram Reel (video + caption). Each node selects the user's connected professional Instagram account and chooses automatic publication or manual review after generation. Reel settings include whether to share the Reel to the feed.

Manual and failed automatic publications hold their run in `awaiting_publish`. The run remains non-terminal until the user publishes or discards the publication. Repeating Jobs measure their next interval from that terminal resolution, so they cannot advance while a publication is unresolved.

Instagram account connections use Meta's Instagram Login OAuth flow. Server-side access tokens are encrypted with AES-256-GCM. Meta fetches output media through a time-limited signed HTTPS URL. Credentials, encryption keys, and public API URL are configured outside source control.

The Accounts page supports one professional account per Hive user. It can retain a chosen Hive image asset for profile-picture preparation and download a centered square crop. This is a local convenience; Hive does not apply profile changes through Instagram's API.

## Consequences

- Only the first connected Business/Creator account is supported per Hive user.
- Instagram publishing and OAuth require app credentials. Publishing also requires a public HTTPS media URL reachable by Meta.
- Manual review gives users a chance to edit captions; failed automatic publication also returns to this review state and keeps the Job paused at the current run.
- Unresolved publications cannot be deleted with their run. Run cleanup explicitly deletes publication records for eligible runs. Accounts with retained publication history cannot be disconnected until those run records are removed.
- Meta may require App Review and Advanced Access before accounts outside the app's development roles can connect.
