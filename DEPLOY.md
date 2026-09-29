# Deployment

Neon (Postgres + pgvector) -> Render (backend, Docker) -> Vercel (frontend).

1. **Neon**: create project, copy the pooled connection string (`?sslmode=require`).
   The migration runs `CREATE EXTENSION vector` automatically on first deploy.
2. **Render**: New > Blueprint from this repo (`render.yaml`). Set `DATABASE_URL`,
   `OPENAI_API_KEY`, `FRONTEND_ORIGIN` (fill after step 3). `JWT_SECRET` is generated.
   Health check: `/health`.
3. **Vercel**: import the `devhub-authflow` repo, set `VITE_API_BASE_URL` to the Render URL.
4. Put the Vercel URL into Render's `FRONTEND_ORIGIN` and redeploy.
5. Smoke test: register, add a URL, open Ask AI, confirm sources.

Local dev: `docker compose up -d` (pgvector image), copy `.env.example` to `.env`.
