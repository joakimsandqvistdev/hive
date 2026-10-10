# Hive

A full-stack starter using React, TypeScript, Node.js, Express, PostgreSQL, Drizzle ORM, and Docker Compose.

The GitHub Actions workflow runs the TypeScript checks and production build on pushes and pull requests to `main`.

## Requirements

- Node.js 22 LTS (already installed on this computer)
- npm (included with Node.js)
- Docker Desktop with the Linux container engine running
- Git (already installed)

## Start developing

1. Start Docker Desktop and wait until its engine is running.
2. Install dependencies: `npm install`
3. Create your local environment file: `Copy-Item .env.example .env`
4. Start PostgreSQL: `npm run dev:db`
5. Create the starter table: `npm run db:push`
6. Start the API and web app: `npm run dev`
7. Open <http://localhost:5173>. The API runs at <http://localhost:3001>.

## Google sign-in setup

Google sign-in uses an authorization-code flow handled by the API. The API validates Google's signed OpenID Connect ID token, keeps only a hashed, random session identifier in PostgreSQL, and sends the browser an HTTP-only session cookie. Google credentials stay on the server and must never use a `VITE_` variable.

1. In Google Cloud Console, create an OAuth client with application type **Web application**.
2. Add `http://localhost:3001/api/auth/google/callback` as an authorized redirect URI.
3. Add the client ID and secret to `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. Keep `GOOGLE_REDIRECT_URI` set to the exact callback URI above and restart `npm run dev`.
5. Open the app, choose **Log in**, then **Continue with Google**.

For a deployed environment, register that environment's exact HTTPS callback URI and set `GOOGLE_REDIRECT_URI`, `WEB_ORIGIN`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` accordingly. Never commit `.env` or expose the client secret in frontend configuration.

The API exposes `GET /api/health`. The web page calls the API to show its database connection status.

For tracked schema changes, update `apps/api/src/schema.ts`, generate a migration with `npm run db:generate -w @hive/api`, then apply it with `npm run db:migrate -w @hive/api`.

The optional sample-agent seed requires an existing signed-in user. Set `AGENT_SEED_USER_EMAIL` to that user's account email, then run `npm run db:seed:agents -w @hive/api`. It adds one sample for each modality and leaves existing samples unchanged.

To stop PostgreSQL, run `docker compose down`. To also erase its local data, run `docker compose down -v`.
