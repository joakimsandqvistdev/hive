# Hive

A full-stack starter using React, TypeScript, Node.js, Express, PostgreSQL, Drizzle ORM, and Docker Compose.

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

This creates `.env` if missing (with a random local database password), installs dependencies inside the app image, builds the app, starts PostgreSQL and the model runner, applies tracked database migrations, and starts the API, web app, and workflow worker. The worker also schedules due Jobs from PostgreSQL. It waits for service readiness, then returns to your terminal. Open [http://localhost:5173](http://localhost:5173).

To stop all Compose services belonging to this checkout's project:

```powershell
npm run local:stop
```

Stopping preserves the database volume, downloaded model cache, and generated pictures in `.data/artifacts`. Services launched separately with `npm run dev` or `worker:dev` remain controlled by their original terminals; stop those before switching to this launcher to avoid port conflicts. Do not run `docker compose down -v` to stop normally: it deletes persistent volumes.

- No host `npm install` is needed for these commands; dependencies are installed in Docker. The first image build needs internet access and can take several minutes. Rerun `npm run local` after code or `.env` changes to rebuild/recreate affected services. This runs the built app; use the development commands below for hot reload.
- Google credentials cannot be generated automatically. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env` using the sign-in setup below, then rerun `npm run local`. Existing `.env` files are preserved. Until configured, the public app works but Google sign-in is unavailable.
- NVIDIA acceleration is selected when `nvidia-smi` detects a GPU. Docker must also support NVIDIA passthrough. Force CPU with `npm run local -- --cpu`, or force GPU with `npm run local -- --gpu` (useful when host detection is unavailable).
- Ports 3001, 5173, 5432, and 8188 must be free. Keep the local web origin, browser API URL, and OAuth callback in `.env` aligned with these ports.
- Model weights must be downloaded explicitly from the Models view and require substantial disk/RAM. CPU inference can be very slow; service readiness does not verify model inference. See [the runner guide](services/runner/README.md).
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

For workflow execution and Jobs scheduling, also run `npm run worker:dev -w @hive/api` in another terminal and start the [model runner](services/runner/README.md). The development worker handles both queued runs and due Jobs.

## Google sign-in setup

Google sign-in uses an authorization-code flow handled by the API. The API validates Google's signed OpenID Connect ID token, keeps only a hashed, random session identifier in PostgreSQL, and sends the browser an HTTP-only session cookie. Google credentials stay on the server and must never use a `VITE_` variable.

1. In Google Cloud Console, create an OAuth client with application type **Web application**.
2. Add `http://localhost:3001/api/auth/google/callback` as an authorized redirect URI.
3. Add the client ID and secret to `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. Keep `GOOGLE_REDIRECT_URI` set to the exact callback URI above and rerun `npm run local` (or restart `npm run dev` when using hot reload).
5. Open the app, choose **Log in**, then **Continue with Google**.

For a deployed environment, register that environment's exact HTTPS callback URI and set `GOOGLE_REDIRECT_URI`, `WEB_ORIGIN`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` accordingly. Never commit `.env` or expose the client secret in frontend configuration.

The API exposes `GET /api/health`. The web page calls the API to show its database connection status.

For tracked schema changes, update `apps/api/src/schema.ts`, generate a migration with `npm run db:generate -w @hive/api`, then apply it with `npm run db:migrate -w @hive/api`.

Workflows combine typed Text/Image/Audio inputs, downloaded model nodes, and built-in **Processing** operations. **Text Overlay** composites connected text onto a connected image with configurable font, weight, color, placement, alignment, margin, and line spacing. It runs locally without an AI model or model download. Processing is designed to accommodate other algorithmic nodes, such as cropping and logic operations. Duplicate selected nodes to reuse their settings and input data without copying connections, or duplicate a workflow to create a separate copy of its nodes and connections; run and Job history is not copied. Connect matching datatypes, save, then run; runs can start manually or through a Job.

## Schedule workflow jobs

Sign in and open **Jobs** in the side navigation. Create a job by choosing a saved workflow, naming the job, and setting the first run time. A job can run once, repeat a chosen total number of times, or repeat indefinitely. Repeating jobs use intervals from one minute to 365 days, measured from when the previous run finishes.

Jobs queue only their current run. They do not create future run records in advance, and the next run is scheduled only after the previous run reaches a terminal state. This prevents overlapping runs from the same job. Pause a job to stop future queueing; an already queued or running run is allowed to finish. Removing a job cancels its queued run, lets an in-progress run finish, and preserves existing run history and generated media.

Each job run validates the workflow and checks model availability when it is queued. It snapshots the then-current workflow definition, so later workflow edits apply to later runs only. Failed or cancelled executions count toward a finite repeat limit; worker-level retries remain part of that individual run. If workflow validation or model availability prevents queueing, the job pauses in a failed state with an error; resume it after resolving the issue to retry.

The scheduler stores job definitions and next-run times in PostgreSQL. Keep the Hive worker running for jobs to be queued and executed. Jobs are local to the configured database and are not transferred by Git.
To stop PostgreSQL, run `docker compose down`. To also erase its local data, run `docker compose down -v`.
