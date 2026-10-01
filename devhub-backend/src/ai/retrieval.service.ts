import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { EmbeddingService } from './embedding.service';

export const TOP_K = 5;

export interface RetrievedChunk {
  resourceId: string;
  title: string;
  url: string | null;
  content: string;
  score: number;
}

@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  /** Cosine-similarity search over the user's chunks, scoped to one space. */
  async search(
    spaceId: string,
    query: string,
    k = TOP_K,
  ): Promise<RetrievedChunk[]> {
    const vec = `[${(await this.embeddings.embedOne(query)).join(',')}]`;
    return this.prisma.$queryRaw<RetrievedChunk[]>(Prisma.sql`
      SELECT r."id" AS "resourceId", r."title", r."url", c."content",
             1 - (c."embedding" <=> ${vec}::vector) AS "score"
      FROM "ResourceChunk" c
      JOIN "Resource" r ON r."id" = c."resourceId"
      WHERE r."spaceId" = ${spaceId} AND c."embedding" IS NOT NULL
      ORDER BY c."embedding" <=> ${vec}::vector
      LIMIT ${k}
    `);
  }
}
