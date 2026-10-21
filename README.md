# Hive

Hive is a self-hosted application for building and running workflows with typed media and text inputs, downloadable AI models, and deterministic Processing operations. Overlay text on images with configurable Google Fonts, live previews, and saved defaults for new overlay nodes, or convert a still image into a 9:16 MP4 with optional soundtrack. Browse and upload images, audio, and MP4 video in the Media Library, reuse saved media in workflows, and preserve generated outputs beyond run deletion. Publish Instagram posts and Reels manually or automatically, schedule workflows as Jobs, or start them from signed webhook events. Review run progress and media, pause your own queued runs after current work finishes, and delete runs individually or in bulk by status; generated media is cleaned up with the run.

Built with React, TypeScript, Node.js, Express, PostgreSQL, Drizzle ORM, and Docker Compose.

## Clone the repository

```bash
git clone https://github.com/joakimsandqvistdev/hive.git
cd hive
```


The GitHub Actions workflow runs local-launcher tests, TypeScript checks, and the production build on pushes and pull requests to `main`.

## Requirements

- Node.js 22 or newer
- npm (included with Node.js)
- Docker Desktop with the Linux container engine running
- Git

## Run everything locally

With Node.js 22+, Docker Compose 2.24.4+ (included in recent Docker Desktop versions), and Docker running in Linux-container mode, run these commands from the repository root:

Hive installs `ionodes` from the public npm registry as a web workspace dependency. Docker and CI builds use the package-lock-pinned registry package; no submodule checkout or GitHub access to the ionodes repository is required.

```powershell
npm run local
```

This creates `.env` if missing (with a random local database password), installs dependencies inside the app image, builds the app, starts PostgreSQL and the model runner, applies tracked database migrations, and starts the API, web app, workflow worker, and independent run cleanup worker. The workflow worker executes runs and schedules due Jobs; the cleanup worker removes deleted runs and their eligible media without waiting for model inference to finish. It waits for service readiness, then returns to your terminal. Open [http://localhost:5173](http://localhost:5173).

To stop all Compose services belonging to this checkout's project:

```powershell
npm run local:stop
```

Stopping preserves the database volume, downloaded model cache, and generated pictures in `.data/artifacts`. Services launched separately with `npm run dev`, `worker:dev`, or `cleanup:dev` remain controlled by their original terminals; stop those before switching to this launcher to avoid port conflicts. Do not run `docker compose down -v` to stop normally: it deletes persistent volumes.

- No host `npm install` is needed for these commands; dependencies are installed in Docker. The first image build needs internet access and can take several minutes. Rerun `npm run local` after code or `.env` changes to rebuild/recreate affected services. This runs the built app; use the development commands below for hot reload.
- Install the ngrok agent and configure its authtoken once (`ngrok config add-authtoken ...`). `npm run local` starts or reuses an ngrok HTTP tunnel to port 3001; `npm run local:stop` stops a tunnel started by the launcher. Existing manually started ngrok sessions are reused and left running when Hive stops. The tunnel URL is passed to Hive for webhook URLs, Instagram media, and the Instagram OAuth callback. Register the displayed callback URL in Meta. Keep the ngrok process running while remote services need access.
- Google credentials cannot be generated automatically. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env` using the sign-in setup below, then rerun `npm run local`. Existing `.env` files are preserved. Until configured, the public app works but Google sign-in is unavailable.
- NVIDIA acceleration is selected when `nvidia-smi` detects a GPU. Docker must also support NVIDIA passthrough. Force CPU with `npm run local -- --cpu`, or force GPU with `npm run local -- --gpu` (useful when host detection is unavailable).
- Ports 3001, 5173, 5432, 8188, and ngrok's local inspector port 4040 must be free. Keep the local web origin and browser API URL in `.env` aligned with these ports.
- Model weights must be downloaded explicitly from the Models view and require substantial disk/RAM. Its Library tab shows available models and active downloads; Storage reports container-visible cache space and supports reviewed, one-model-at-a-time cache removal. Downloads can run concurrently, pause/resume individually, and recover after runner restarts without deleting workflow definitions. CPU inference can be very slow; service readiness does not verify model inference. See [the runner guide](services/runner/README.md).
- A fresh computer has a fresh database, artifact folder, and model cache; Git does not transfer these. If reusing an existing database volume, keep its original database password.
- The launcher applies migrations only to the Compose PostgreSQL service, even if `.env` contains a different `DATABASE_URL`. It does not migrate an external database. A failed startup may leave partial services running; use `npm run local:stop` before retrying if needed.

To develop `ionodes` itself, work in its standalone repository. Hive consumes the published npm release; install a new release in `apps/web` when it is ready.

Inspect service logs in Docker Desktop. All published ports in the local launcher are bound to localhost.

Launcher checks: `npm run test:local`.

## Start developing with hot reload

1. Start Docker Desktop and wait until its engine is running.
2. Install dependencies: `npm install`
3. Create your local environment file: `Copy-Item .env.example .env`
4. Start PostgreSQL: `npm run dev:db`
5. Apply tracked migrations: `npm run db:migrate -w @hive/api`
6. Start the API and web app: `npm run dev`
7. Open <http://localhost:5173>. The API runs at <http://localhost:3001>.

For workflow execution and Jobs scheduling, run `npm run worker:dev -w @hive/api` in another terminal and start the [model runner](services/runner/README.md). To process deleted runs independently during development, also run `npm run cleanup:dev -w @hive/api` in another terminal.

## Google sign-in setup

Google sign-in uses an authorization-code flow handled by the API. The API validates Google's signed OpenID Connect ID token, keeps only a hashed, random session identifier in PostgreSQL, and sends the browser an HTTP-only session cookie. Google credentials stay on the server and must never use a `VITE_` variable.

1. In Google Cloud Console, create an OAuth client with application type **Web application**.
2. Add `http://localhost:3001/api/auth/google/callback` as an authorized redirect URI.
3. Add the client ID and secret to `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. Keep `GOOGLE_REDIRECT_URI` set to the exact callback URI above and rerun `npm run local` (or restart `npm run dev` when using hot reload).
5. Open the app, choose **Log in**, then **Continue with Google**.

For a deployed environment, register that environment's exact HTTPS callback URI and set `GOOGLE_REDIRECT_URI`, `WEB_ORIGIN`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` accordingly. Never commit `.env` or expose the client secret in frontend configuration.

The API exposes `GET /api/health`. The web page calls the API to show its database connection status.

## Media Library and workflow media

Open **Media Library** from the side navigation to upload PNG/JPEG/WebP images (up to 10 MB), WAV/MP3/Ogg/FLAC audio (up to 25 MB), and MP4 videos (up to 50 MB), or to browse files generated by runs. Search across file names, formats, workflows, nodes, and webhooks; filter separately by media type and save state. Rename saved library files to make them easier to find, then search by file name in Image, Audio, and Video input selectors in workflow and custom node editors. The Storage tab shows tracked artifact sizes and offers a manual cleanup preview for unsaved run outputs older than 30 days and orphaned workflow uploads. Cleanup is permanent after confirmation and rechecks references before removal; run records are retained. Uploads made in the Media Library are saved there. In a workflow's node configuration, choose saved library media, upload media for that workflow, or import a public HTTP(S) media URL. Workflow uploads and URL imports are kept as a workflow-owned copy and are not automatically added to the library. To reuse generated output after its run is deleted, save it to the library first.

Run deletion removes generated media belonging to that run and uploaded input files that are no longer referenced. Media saved to the library is detached from the run and remains available. The library prevents deletion while media is in use by a workflow, run input, Instagram publication, or account profile image; remove the reference first. Uploaded MP4 files are limited to 50 MB. URL imports reject redirects and local/private network destinations. Compare two runs in the Run comparison workspace to inspect input, node status, configuration, text output, and artifact differences side by side; comparison is read-only and does not assign automatic regression scores.

Open **Publish** from the side navigation to review workflow posts awaiting publish, then compose Instagram posts from Media Library images or approved workflow images. Review runs one at a time with a large preview and caption; skip for this visit, approve while keeping the run publishable, or discard to mark it Succeeded and remove it from publishing. Select one image for a photo post or 2–10 images for a carousel, drag slides into order, add per-image alt text and a post caption, save a draft, preview the post, and publish it to the connected account. Runs selected from Awaiting publish remain pending until Instagram confirms the post, then move to Succeeded. Scheduling is not supported.

**Still Image Video** is a built-in Processing node. It takes a required image and optional audio input, then creates a 1080×1920 H.264 MP4 at 24 fps, using the full image with black padding instead of cropping. Set a whole-second duration from 3 to 900 seconds (default 10). The soundtrack can be attenuated from 100% to 0%, never amplified; short audio leaves silence for the rest of the video, and longer audio is trimmed. Generated video is limited to 50 MB. The app container installs FFmpeg to render it without an AI model.

## Instagram publishing setup

Instagram publishing requires a Meta developer app and one professional Instagram **Business** or **Creator** account. Hive uses Instagram Login (no Facebook Page is required) with the `instagram_business_basic` and `instagram_business_content_publish` permissions.

1. Create a Meta developer app at [Meta for Developers](https://developers.facebook.com/) and add the Instagram API product/use case with Instagram Login (also labeled Business Login for Instagram in some dashboards).
2. Add your own Instagram account as an app-role user/tester while the app is in development mode.
3. Run `npm run local`; it starts or reuses ngrok for API port `3001` and prints the callback URL. In **Instagram Business Login settings**, register that exact URL, including `/api/instagram/oauth/callback`. The webhook URL is separate and is not used for this login flow.
4. Set `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` in `.env` from the Meta app dashboard. Keep both server-side; never use `VITE_` variables or commit these values.
5. Generate a 32-byte base64 key for encrypted token storage:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

   Put the result in `INSTAGRAM_TOKEN_ENCRYPTION_KEY` and back it up securely. Existing saved tokens cannot be decrypted if this key changes.
6. For local runs, `npm run local` supplies the ngrok HTTPS URL for `INSTAGRAM_PUBLIC_API_URL` and prints the exact callback URL to register in Meta. Instagram must be able to fetch generated media from this address; a container-only address or `localhost` will not work. Keep the ngrok tunnel running while Instagram fetches media.
7. Rerun `npm run local` after adding these settings, then open **Accounts** and connect your professional account. Use **Reconnect Instagram** there to refresh Hive's access if Meta invalidates the saved token; this preserves publication history and only accepts the same Instagram account. Create an Instagram Post/Reel publishing node, select an account, and choose automatic publishing or manual review. With manual review, edit the caption in the run details before publishing, or discard the publication. Jobs continue scheduling after workflow generation finishes even if a publication is still pending.

In development mode, only app-role users and eligible testers can authorize. Before allowing general users to connect, request Meta App Review/Advanced Access for the permissions and satisfy any current business verification requirements. Instagram API access and review requirements are managed by Meta and can change.

For tracked schema changes, update `apps/api/src/schema.ts`, generate a migration with `npm run db:generate -w @hive/api`, then apply it with `npm run db:migrate -w @hive/api`.

Workflows combine typed Text/Image/Audio inputs, downloaded model nodes, and built-in **Processing** operations. In **Models**, the **Text-to-text models** category includes **Qwen3-0.6B** and **Qwen3-1.7B**. Their workflow nodes appear in the existing **Models** group and generate text from a connected text input using configurable instructions. Optional Prefix and Suffix settings wrap the generated output before it flows to later nodes or appears in run details. **Text Overlay** composites connected text onto a connected image with configurable typography, live preview, and an optional full-width background strip with adjustable color, opacity, and padding; it runs locally without an AI model. Duplicate selected nodes to reuse their settings and input data without copying connections, export a selected group of nodes and their internal connections as a new workflow, or import a complete workflow into the current editor as an independent copy with its nodes, connections, and layout. Exports and imports preserve saved Media Library references; workflow-only uploaded media must be selected or uploaded again in the destination workflow. Duplicate a workflow to copy its nodes and connections; run and Job history is not copied. Connect matching datatypes, save, then run; runs can start manually, through a Job, or continue to Instagram publishing. The notification bell records run failures, successful completions, and runs waiting for publishing; open a run from its notification or mark one or all notifications as read.

## Create reusable Custom Nodes

Open **Custom Nodes** from the side navigation to create a reusable workflow definition. Start with a blank editor, then import a complete workflow to copy its nodes, internal connections, and layout into the custom node. Duplicate a Custom Node to make an independent editable copy; references to nested Custom Nodes remain shared. Choose the custom node's public inputs and outputs with **Edit interface**, and give each exposed port a caller-facing name. Any port in its definition can be exposed, including ports that are already connected internally. Self-contained Custom Nodes with no exposed inputs can be run directly from the list or editor; nodes with inputs can be run within a workflow. Add it from the **Custom nodes** group in a workflow or another custom node; nested custom nodes cannot form cycles.

Editing a custom node updates the implementation used by every workflow that references it. If its exposed interface changes, dependent workflows and custom nodes are marked **Needs attention** and cannot run until repaired. Update an outdated custom node from its configuration panel; Hive reconnects ports only when their names and datatypes match exactly, and leaves unmatched connections disconnected. Deletion shows direct and transitive usage counts and is blocked until all references are removed.

## Schedule workflow jobs

Sign in and open **Jobs** in the side navigation. Create a job by choosing a saved workflow, naming the job, and setting the first run time. A job can run once, repeat a chosen total number of times, or repeat indefinitely. Repeating jobs use intervals from one minute to 365 days, measured from when workflow generation finishes. Pending Instagram review or publication does not block the next occurrence.

## Secure webhook triggers

Open **Webhook Manager** in the sidebar to create and manage signed inbound triggers for workflows. Search matches both webhook and workflow names; selecting a webhook opens its delivery history and management actions in a right-side details drawer. Text inputs map automatically using their stable **Webhook identifier**; edit the identifier in the selected input's configuration. Dotted paths such as `brief.captionPrompt` are supported, and clearing an identifier keeps that input private from webhooks. The creator shows an example JSON payload based on the mappings. Text inputs inside nested Custom Nodes are included, with each Custom Node instance name added as a JSON path prefix. A mapped input may be left blank in the saved definition for webhook requests; ordinary manual runs still require configured text. If a request omits a value, sends `null`, or sends an empty string, Hive uses the text configured on that input node. When no Text inputs are mapped, send an empty body or `{}` to run with the workflow's configured values; signed headers are still required. Duplicate or overlapping paths are rejected. Edits that would change a live trigger's mapping are blocked until you delete the trigger and update the external sender. Media inputs can bind to assets already saved in your Media Library. A trigger queues a normal run through the existing worker. Sample validation does not run the workflow; **Start test run** creates a real run and may cause external side effects such as Instagram publishing.

Webhook triggers require two server-side settings in `.env`:

- `WEBHOOK_PUBLIC_API_URL`: the public HTTPS API origin that reaches Hive, without a path such as `/api`. The `npm run local` launcher supplies the active ngrok URL automatically; remote senders cannot reach `localhost`.
- `WEBHOOK_SECRET_ENCRYPTION_KEY`: a separate 32-byte base64 key used to encrypt trigger secrets at rest. Generate it with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Keep it backed up and stable; changing it makes existing trigger secrets unreadable. Rotate the affected triggers after restoring a new key.

After setting both values, restart/rebuild Hive. Copy the signing secret when a trigger is created or rotated; Hive displays it once. Send `Content-Type: application/json`, `X-Hive-Timestamp` (Unix seconds), `X-Hive-Event-Id` (a stable unique ID for one source event), and `X-Hive-Signature` (`v1=<lowercase hex>`). Compute the signature as HMAC-SHA256 over the UTF-8 text `v1\n<TIMESTAMP>\n<EVENT_ID>\n<SHA256_HEX_OF_EXACT_RAW_BODY>`. Do not reformat the JSON after computing its digest. Timestamps must be within five minutes. The same event ID and body return the original run; the same ID with a different body is rejected. Use a new event ID only to intentionally create another run.

The v1 limits are 256 KiB per JSON body, nesting depth 10, and 10 requests per minute per trigger. Delivery metadata is retained for 30 days. Only Hive's documented HMAC format is supported; provider-native signature adapters are not included in v1.

Example sender using Node.js:

```js
import { createHash, createHmac, randomUUID } from "node:crypto";

const body = JSON.stringify({ caption: { text: "A new workflow input" } });
const timestamp = String(Math.floor(Date.now() / 1000));
const eventId = randomUUID();
const bodyDigest = createHash("sha256").update(body).digest("hex");
const signature = createHmac("sha256", signingSecret)
  .update(`v1\n${timestamp}\n${eventId}\n${bodyDigest}`)
  .digest("hex");

const response = await fetch(triggerUrl, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-hive-timestamp": timestamp,
    "x-hive-event-id": eventId,
    "x-hive-signature": `v1=${signature}`,
  },
  body,
});
```

Jobs queue only their current workflow run. They do not create future run records in advance, and the next run is scheduled after workflow execution finishes plus the configured interval. The previous run may still have an Instagram publication awaiting review or completion; its publication and media remain attached to that run while the job continues. Workflow executions from one job do not overlap. Pause a job to stop future queueing; an already queued or running run is allowed to finish. Removing a job cancels its queued run, lets an in-progress run finish, and preserves existing run history and generated media.

Each job run validates the workflow and checks model availability when it is queued. It snapshots the then-current workflow definition, so later workflow edits apply to later runs only. Failed or cancelled executions count toward a finite repeat limit; worker-level retries remain part of that individual run. If workflow validation or model availability prevents queueing, the job pauses in a failed state with an error; resume it after resolving the issue to retry.

The scheduler stores job definitions and next-run times in PostgreSQL. Keep the Hive worker running for jobs to be queued and executed. Jobs are local to the configured database and are not transferred by Git.
To stop PostgreSQL, run `docker compose down`. To also erase its local data, run `docker compose down -v`.
