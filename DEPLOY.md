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

## Alternative: Hugging Face Spaces (free, no card, 16 GB RAM)

1. Create a Space at https://huggingface.co/new-space: SDK **Docker**, template **Blank**, visibility **Public**.
2. Space > Settings > Variables and secrets. Add secrets: `DATABASE_URL`, `JWT_SECRET`,
   `OPENAI_API_KEY`. Add variables: `FRONTEND_ORIGIN`, `OPENAI_CHAT_MODEL`, `OPENAI_EMBEDDING_MODEL`.
3. Push only the backend folder to the Space repo (it needs the Dockerfile at its root):
   ```bash
   git remote add hf https://huggingface.co/spaces/<user>/<space>
   git subtree push --prefix devhub-backend hf main
   ```
   Use a HF access token (write) as the password when prompted.
4. API URL: `https://<user>-<space>.hf.space`. Check `/health`.
