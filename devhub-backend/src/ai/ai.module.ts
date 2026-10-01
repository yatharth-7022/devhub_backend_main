import { Module } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { openAiProvider, OPENAI } from './openai.provider';
import { EmbeddingService } from './embedding.service';
import { IngestService } from './ingest.service';
import { RetrievalService } from './retrieval.service';
import { EnrichService } from './enrich.service';

@Module({
  providers: [
    PrismaService,
    openAiProvider,
    EmbeddingService,
    IngestService,
    RetrievalService,
    EnrichService,
  ],
  exports: [OPENAI, EmbeddingService, IngestService, RetrievalService, EnrichService],
})
export class AiModule {}
