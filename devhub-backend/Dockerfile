# Playwright base image ships Chromium + system deps; tag must match the playwright npm version.
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
# prisma.config.ts reads DATABASE_URL at generate time; value is unused.
RUN DATABASE_URL=postgresql://x:x@localhost:5432/x npx prisma generate && npm run build \
 && npm prune --omit=dev --legacy-peer-deps

FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts /app/package.json ./
EXPOSE 4000
# Migrate, then serve. prisma CLI is a runtime dependency (prisma.config.ts imports it).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
