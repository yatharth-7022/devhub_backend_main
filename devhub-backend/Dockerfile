FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
# prisma.config.ts reads DATABASE_URL at generate time; value is unused.
RUN DATABASE_URL=postgresql://x:x@localhost:5432/x npx prisma generate && npm run build \
 && npm prune --omit=dev --legacy-peer-deps

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts /app/package.json ./
# Hosts inject PORT; default matches Hugging Face Spaces.
ENV PORT=7860
EXPOSE 7860
# prisma CLI is a runtime dependency (prisma.config.ts imports it).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
