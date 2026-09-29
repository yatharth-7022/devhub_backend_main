CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Resource" DROP COLUMN "pineconeId";
ALTER TABLE "Resource" ADD COLUMN "summary" TEXT;
ALTER TABLE "Resource" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'READY';

CREATE TABLE "ResourceChunk" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceChunk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResourceChunk_resourceId_idx" ON "ResourceChunk"("resourceId");
CREATE INDEX "ResourceChunk_embedding_idx" ON "ResourceChunk" USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "ResourceChunk" ADD CONSTRAINT "ResourceChunk_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
