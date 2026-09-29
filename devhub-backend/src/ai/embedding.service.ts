import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { OPENAI } from './openai.provider';

@Injectable()
export class EmbeddingService {
  readonly model: string;

  constructor(
    @Inject(OPENAI) private readonly openai: OpenAI,
    config: ConfigService,
  ) {
    this.model =
      config.get<string>('OPENAI_EMBEDDING_MODEL') ?? 'text-embedding-3-small';
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const out: number[][] = [];
    // OpenAI accepts up to 2048 inputs per call; batch conservatively.
    for (let i = 0; i < texts.length; i += 100) {
      const res = await this.openai.embeddings.create({
        model: this.model,
        input: texts.slice(i, i + 100),
      });
      out.push(...res.data.map((d) => d.embedding));
    }
    return out;
  }

  async embedOne(text: string): Promise<number[]> {
    return (await this.embedMany([text]))[0];
  }
}
