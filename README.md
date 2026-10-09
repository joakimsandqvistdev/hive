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

The API exposes `GET /api/health`. The web page calls the API to show its database connection status.

For tracked schema changes, update `apps/api/src/schema.ts`, generate a migration with `npm run db:generate -w @hive/api`, then apply it with `npm run db:migrate -w @hive/api`.

To stop PostgreSQL, run `docker compose down`. To also erase its local data, run `docker compose down -v`.
