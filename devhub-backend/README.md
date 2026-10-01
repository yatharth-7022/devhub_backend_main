---
title: DevHub Backend
emoji: 📚
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# DevHub backend

NestJS API: auth, spaces, resources, pgvector RAG, streaming AI chat.
See `../DEPLOY.md` for deployment and `.env.example` for configuration.

```bash
npm install
cp .env.example .env
npx prisma migrate deploy
npm run start:dev
```
