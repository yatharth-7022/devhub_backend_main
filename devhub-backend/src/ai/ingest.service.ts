import { Injectable, Logger } from '@nestjs/common';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { EmbeddingService } from './embedding.service';

export const CHUNK_SIZE = 1000;
export const CHUNK_OVERLAP = 200;

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);
  private readonly splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  /** Chunk text, embed each chunk, store in pgvector. Replaces existing chunks. */
  async indexResource(resourceId: string, title: string, text: string) {
    const body = text.trim();
    if (!body) return 0;

    // Prefix title so every chunk carries document context.
    const chunks = (await this.splitter.splitText(body)).map(
      (c) => `${title}\n\n${c}`,
    );
    const vectors = await this.embeddings.embedMany(chunks);

    await this.prisma.$transaction(async (tx) => {
      await tx.resourceChunk.deleteMany({ where: { resourceId } });
      for (let i = 0; i < chunks.length; i++) {
        const vec = `[${vectors[i].join(',')}]`;
        await tx.$executeRaw(
          Prisma.sql`INSERT INTO "ResourceChunk" ("id","resourceId","chunkIndex","content","embedding")
                     VALUES (gen_random_uuid()::text, ${resourceId}, ${i}, ${chunks[i]}, ${vec}::vector)`,
        );
      }
    });
    this.logger.log(`Indexed ${chunks.length} chunks for resource ${resourceId}`);
    return chunks.length;
  }
}
