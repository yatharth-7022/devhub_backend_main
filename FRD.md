# DevHub — Functional Requirements Document (FRD)

| | |
|---|---|
| **Product** | DevHub — AI-powered personal knowledge hub for saved web resources |
| **Version** | 1.0 (reflects `development` branch as of 2026-09-29) |
| **Scope** | Backend API (`devhub-backend`). Frontend lives in a separate repo (`devhub-authflow`, Vite/React) and is referenced only as a consumer of this API. |
| **Status** | Draft for review |

---

## 1. Purpose

DevHub lets a person save links and notes into organised collections ("Spaces"), automatically understand them (summary + tags), and later *ask questions* about everything they saved in natural language, getting answers grounded in — and cited to — their own material.

## 2. Problem Statement

Developers and knowledge workers collect large numbers of articles, docs, and references. Existing tools (browser bookmarks, read-later apps, note apps) fail in predictable ways:

| Problem | Effect |
|---|---|
| Bookmarks store only a URL + title | Cannot remember *why* a link was saved or what it says |
| Manual tagging/summarising is tedious | Users stop doing it; library becomes an unsearchable dump |
| Keyword search only matches exact words | "how do I cache DB queries" misses a page titled "Redis patterns" |
| General chatbots don't know the user's saved material | Answers are generic, uncited, and may hallucinate |
| Saved pages rot or are hard to re-read | Knowledge is saved but never reused |

**DevHub's answer:** on save, it fetches the page, generates a summary and tags with an LLM, splits the text into chunks and stores vector embeddings. A chat assistant then performs semantic retrieval over the user's own library (RAG) and answers with citations to the saved resources.

## 3. Goals and Non-Goals

### Goals
- G1. Capture a resource with one action (paste a URL).
- G2. Zero-effort organisation: auto summary + auto tags.
- G3. Find things by meaning, not just keywords.
- G4. Conversational Q&A over the user's own library with source citations.
- G5. Strict per-user data isolation.
- G6. Safe to expose publicly (SSRF protection, rate limiting, JWT auth).

### Non-Goals (v1)
- Team sharing / collaboration on Spaces.
- Browser extension or mobile apps.
- PDF / file upload ingestion (URL and manual text only).
- Persistent chat history (client sends history each request).
- Background job queue (ingestion is synchronous within the request).

## 4. Users and Personas

| Persona | Need |
|---|---|
| **Developer / researcher** (primary) | Collect docs, blog posts, references per project; recall them quickly |
| **Student** | Organise course material by subject; ask "what did I save about X?" |

Single role: authenticated **User**. No admin role in v1.

## 5. System Overview

```
 Browser (Vercel, React)
        │  HTTPS + JWT (Bearer)
        ▼
 NestJS API (Render, Docker + Chromium)
   ├─ Auth / Users
   ├─ Spaces
   ├─ Resources ──► Scrape (Playwright, SSRF-guarded)
   │               ├─► Enrich (OpenAI chat → summary + tags, Zod-validated)
   │               └─► Ingest (chunk → embed → pgvector)
   └─ Chat (SSE) ──► Tool loop: search / list / summarise / add
        │                        └─► Retrieval (cosine similarity over pgvector)
        ▼
 PostgreSQL + pgvector (Neon)        OpenAI API (chat + embeddings)
```

**Tech stack:** NestJS, Prisma, PostgreSQL + `pgvector`, Passport (local + JWT), bcryptjs, class-validator, Zod, `@nestjs/throttler`, Playwright (Chromium), LangChain text splitters, OpenAI SDK (`gpt-4o-mini`, `text-embedding-3-small`, 1536-dim vectors).

## 6. Data Model

| Entity | Key fields | Notes |
|---|---|---|
| **User** | `id`, `email` (unique), `password` (bcrypt hash), `name?`, `createdAt` | |
| **Space** | `id`, `name`, `userId`, `createdAt` | A named collection owned by one user |
| **Resource** | `id`, `spaceId`, `title`, `url?`, `contentPreview?`, `tags[]`, `summary?`, `status`, `createdAt` | `status`: `PROCESSING` \| `READY` \| `FAILED` (default `READY`) |
| **ResourceChunk** | `id`, `resourceId`, `chunkIndex`, `content`, `embedding vector(1536)?`, `createdAt` | Cascade-deleted with Resource; indexed on `resourceId` |

Ownership chain: `User → Space → Resource → ResourceChunk`. Every access check resolves back to `User`.

## 7. Functional Requirements

Priority: **M** = must, **S** = should.

### 7.1 Authentication & Accounts

| ID | Requirement | Pri |
|---|---|---|
| FR-AUTH-1 | A visitor can register with email, password, optional name. Password is stored as a bcrypt hash (cost 12). | M |
| FR-AUTH-2 | Registration immediately returns `{ user, access_token }` (auto-login). | M |
| FR-AUTH-3 | A user can log in with email + password and receive `{ user{id,email,name}, access_token }`. | M |
| FR-AUTH-4 | Invalid credentials are rejected (401). | M |
| FR-AUTH-5 | `GET /auth/me` returns the authenticated user's profile from the JWT. | M |
| FR-AUTH-6 | All non-auth endpoints require `Authorization: Bearer <JWT>`. | M |
| FR-AUTH-7 | Server refuses to start if `JWT_SECRET` is unset. | M |

### 7.2 Spaces

| ID | Requirement | Pri |
|---|---|---|
| FR-SPC-1 | User can create a Space with a name. | M |
| FR-SPC-2 | User can list only their own Spaces. | M |
| FR-SPC-3 | User can rename a Space they own. | M |
| FR-SPC-4 | User can delete a Space they own. | M |
| FR-SPC-5 | Operations on a Space owned by another user are denied. | M |

### 7.3 Resources — Capture

| ID | Requirement | Pri |
|---|---|---|
| FR-RES-1 | **Add from URL** (`POST /resources/from-url {spaceId, url}`): server fetches the page in a headless browser (30 s timeout, waits for network idle), extracts title and visible text. | M |
| FR-RES-2 | The first ~3 chunks of extracted text are stored as `contentPreview`. | M |
| FR-RES-3 | Extracted text is sent (first 6,000 chars) to the LLM to produce a 1–3 sentence `summary` and 1–6 lowercase `tags`. | M |
| FR-RES-4 | LLM output is validated against a Zod schema (summary 20–600 chars; 1–6 tags ≤30 chars). On failure the model is re-prompted once with the validation error; if still invalid the resource is saved **without** enrichment (no hard failure). | M |
| FR-RES-5 | Full text is chunked (1,000 chars, 200 overlap), each chunk prefixed with the title, embedded, and stored in pgvector. Re-indexing replaces existing chunks atomically (transaction). | M |
| FR-RES-6 | Indexing failure must not lose the saved resource; it is logged and the resource remains. | M |
| FR-RES-7 | Pages with no readable content are rejected with error code `SCRAPE_FAILED`. | M |
| FR-RES-8 | **Manual add** (`POST /resources`): user supplies title (≤100), optional URL, optional preview (≤2000), optional tags. Preview text is indexed for search. | M |

### 7.4 Resources — Browse, Search, Manage

| ID | Requirement | Pri |
|---|---|---|
| FR-RES-9 | `GET /resources` lists resources of one Space with pagination (`page` ≥1, `limit` 1–100, default 20) and returns `{items, page, limit, total, hasNextPage}`. | M |
| FR-RES-10 | Sorting: `createdAt_desc` (default), `createdAt_asc`, `title_asc`, `title_desc`. | M |
| FR-RES-11 | Tag filter (`tags=a,b`): resource must contain **all** listed tags. | M |
| FR-RES-12 | Keyword search (`q`): PostgreSQL full-text search (`websearch_to_tsquery`, English) over title + URL + preview; combinable with tag filter and pagination. | M |
| FR-RES-13 | `GET /resources/:id` returns one owned resource. | M |
| FR-RES-14 | `PUT /resources/:id` updates title, URL, preview, tags; re-indexes when title or preview changes. | M |
| FR-RES-15 | `DELETE /resources/:id` removes the resource and cascades its chunks. | M |
| FR-RES-16 | Resource in a Space the caller does not own returns not-found/forbidden. | M |

### 7.5 AI Chat ("Ask AI")

| ID | Requirement | Pri |
|---|---|---|
| FR-CHAT-1 | `POST /chat/stream {spaceId, messages[1..40]}` streams the answer as **Server-Sent Events**. Each message ≤ 8,000 chars; role `user`\|`assistant`. | M |
| FR-CHAT-2 | Event types: `token`, `tool_call`, `tool_result`, `sources`, `done`, `error`. | M |
| FR-CHAT-3 | The assistant is instructed to call `search_resources` before answering content questions, answer **only** from retrieved excerpts, cite by title, and say so when nothing relevant is found. | M |
| FR-CHAT-4 | Tools available to the model: `search_resources(query, spaceId?)`, `list_spaces()`, `summarize_resource(resourceId)`, `add_resource_from_url(url, spaceId?)`. | M |
| FR-CHAT-5 | `add_resource_from_url` is used only when the user explicitly asks to save a link. | M |
| FR-CHAT-6 | Tool arguments are validated with Zod; validation/runtime errors are fed back to the model so it can self-correct. | M |
| FR-CHAT-7 | Retrieval: embed the query, return top-5 chunks by cosine similarity within one Space; each tool call verifies the user owns that Space. | M |
| FR-CHAT-8 | Max 5 model↔tool rounds per request; then emit `error: "Too many tool rounds"`. | M |
| FR-CHAT-9 | Final `sources` event lists distinct `{resourceId, title, url}` used in the answer. | M |
| FR-CHAT-10 | Server stops generating if the client disconnects. | S |

### 7.6 Operations

| ID | Requirement | Pri |
|---|---|---|
| FR-OPS-1 | `GET /health` → `{status:"ok"}`, exempt from rate limiting (used by Render health check). | M |
| FR-OPS-2 | Request logging middleware on all routes. | S |
| FR-OPS-3 | Responses use a uniform envelope (`ok(data)` / `fail(message, code)`) for Spaces/Resources. | S |

## 8. Non-Functional Requirements

### 8.1 Security
- **NFR-SEC-1 Isolation:** every Space/Resource/Chat operation verifies ownership by the JWT subject.
- **NFR-SEC-2 SSRF protection:** scraper accepts only `http(s)`; rejects `localhost`, private/loopback/link-local/CGNAT/multicast ranges (IPv4 and IPv6, incl. IPv4-mapped); resolves DNS and rejects if *any* address is private; **re-validates every browser request** (redirects, iframes, subresources).
- **NFR-SEC-3 Input validation:** global `ValidationPipe` with `whitelist` + `transform`; Zod for AI I/O.
- **NFR-SEC-4 CORS:** allow-list from `FRONTEND_ORIGIN`.
- **NFR-SEC-5 Secrets** (JWT, DB URL, OpenAI key) only via environment variables.

### 8.2 Performance & Cost Control
- **Rate limits:** global 120 req/min; `POST /resources/from-url` 10/min; `POST /chat/stream` 15/min (per client).
- Embeddings batched 100 per API call.
- Enrichment input capped at 6,000 chars; chat history capped at 40 messages.

### 8.3 Reliability
- AI enrichment and indexing are best-effort; capture never fails solely because OpenAI failed (except scraping itself).
- Chunk replacement is transactional.

### 8.4 Deployment
- Neon (Postgres + pgvector; migration runs `CREATE EXTENSION vector`) → Render (Docker, ≥1 GB RAM for Chromium) → Vercel (frontend). Config: `render.yaml`, `DEPLOY.md`.
- Env: `PORT`, `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`, `OPENAI_EMBEDDING_MODEL`, `FRONTEND_ORIGIN`.

### 8.5 Testing
- Jest unit specs for auth, users, spaces, resources, chat tools; e2e scaffold present.

## 9. Key User Flows

**F1 — Save a link**
1. User pastes URL in a Space → `POST /resources/from-url`.
2. Server validates URL (SSRF) → scrapes → LLM summary/tags → chunk + embed → store.
3. UI shows the new card with summary and tags.

**F2 — Ask a question**
1. User opens "Ask AI" in a Space, types a question.
2. Model calls `search_resources` → top-5 chunks returned.
3. Answer streams token-by-token; `sources` event shows cited resources.

**F3 — Save from chat**
User: "save https://… to this space" → model calls `add_resource_from_url` → resource created and confirmed in chat.

## 10. API Summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | – | Create account + token |
| POST | `/auth/login` | – | Log in |
| GET | `/auth/me` | JWT | Current user |
| POST/GET/PUT/DELETE | `/spaces`, `/spaces/:id` | JWT | Space CRUD |
| POST | `/resources` | JWT | Manual add |
| POST | `/resources/from-url` | JWT | Scrape + enrich + index |
| GET | `/resources?spaceId=&q=&tags=&sort=&page=&limit=` | JWT | List/search |
| GET/PUT/DELETE | `/resources/:id` | JWT | Read/update/delete |
| POST | `/chat/stream` | JWT | SSE RAG chat |
| GET | `/health` | – | Liveness |

## 11. Known Gaps and Risks (found in code review)

| # | Finding | Severity | Recommendation |
|---|---|---|---|
| 1 | `POST /users` is unauthenticated and appears to create a user **without hashing the password** (hashing happens only in `AuthService.register`). | **High** | Remove the route or route it through `AuthService.register`. |
| 2 | `Resource.status` (`PROCESSING/READY/FAILED`) exists but is never set; ingestion is synchronous. | Medium | Move enrich+index to a background job and use the status field, or remove it. |
| 3 | Keyword search results are ordered by `createdAt`, not relevance rank; no GIN index on the tsvector. | Medium | `ORDER BY ts_rank`, add GIN index. |
| 4 | No vector index (HNSW/IVFFlat) on `embedding`; search is a sequential scan. | Medium | Add HNSW index before library grows. |
| 5 | Manual resources index only `contentPreview` (≤2000 chars); manual resources with no preview aren't searchable by AI. | Low | Allow body text on manual add. |
| 6 | Playwright launches a new Chromium per request with `--no-sandbox`; memory heavy. | Medium | Reuse a browser, cap concurrency. |
| 7 | Chat history is client-supplied and not persisted. | Low | Add `Conversation`/`Message` tables if history is required. |
| 8 | No email verification, password reset, or refresh tokens. | Medium | Add before public launch. |
| 9 | Deleting a Space with resources: relations have no `onDelete: Cascade` — delete may fail on FK. | Medium | Add cascade or delete children explicitly. |
| 10 | `contentPreview` chunks are duplicated (scrape splits, then ingest splits again). | Low | Reuse a single splitter. |

## 12. Future Scope
Background ingestion queue with status polling; PDF/file upload; browser extension "Save to DevHub"; shareable/collaborative Spaces; hybrid (keyword + vector) search with reranking; saved chat threads; re-summarise / re-index actions; usage quotas per user.

## 13. Acceptance Criteria (v1)
- A new user can register, create a Space, add a public URL, and see summary + tags within one request (~ <45 s).
- Private/internal URLs (`http://localhost`, `169.254.169.254`, RFC1918 hosts, redirects to them) are rejected.
- User A can never read, modify, search, or chat over User B's data.
- Asking a question about a saved page streams an answer that cites that page under `sources`; asking about something not saved yields a "nothing relevant found" style reply.
- Exceeding rate limits returns 429.
- `/health` returns 200 on deployed instance.
