import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { z } from 'zod';
import { OPENAI } from './openai.provider';

export const EnrichmentSchema = z.object({
  summary: z.string().min(20).max(600),
  tags: z
    .array(z.string().min(1).max(30).transform((t) => t.toLowerCase().trim()))
    .min(1)
    .max(6),
});
export type Enrichment = z.infer<typeof EnrichmentSchema>;

@Injectable()
export class EnrichService {
  private readonly logger = new Logger(EnrichService.name);
  private readonly model: string;

  constructor(
    @Inject(OPENAI) private readonly openai: OpenAI,
    config: ConfigService,
  ) {
    this.model = config.get<string>('OPENAI_CHAT_MODEL') ?? 'gpt-4o-mini';
  }

  /**
   * Ask the model for {summary, tags} as JSON and validate with Zod.
   * On validation failure, retry once feeding back the Zod errors;
   * if it still fails, return null (resource is saved without enrichment).
   */
  async enrich(title: string, text: string): Promise<Enrichment | null> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content:
          'You summarize saved web resources. Reply ONLY with JSON: {"summary": string (1-3 sentences), "tags": string[] (1-6 short lowercase topical tags)}.',
      },
      {
        role: 'user',
        content: `Title: ${title}\n\nContent:\n${text.slice(0, 6000)}`,
      },
    ];

    for (let attempt = 0; attempt < 2; attempt++) {
      let raw = '';
      try {
        const res = await this.openai.chat.completions.create({
          model: this.model,
          messages,
          response_format: { type: 'json_object' },
        });
        raw = res.choices[0]?.message?.content ?? '';
        const parsed = EnrichmentSchema.safeParse(JSON.parse(raw));
        if (parsed.success) return parsed.data;

        this.logger.warn(`Enrichment validation failed: ${parsed.error.message}`);
        messages.push(
          { role: 'assistant', content: raw },
          {
            role: 'user',
            content: `Your JSON was invalid: ${parsed.error.message}. Return corrected JSON only.`,
          },
        );
      } catch (err) {
        this.logger.warn(`Enrichment attempt ${attempt + 1} errored: ${err}`);
        if (attempt === 1) break;
        messages.push({
          role: 'user',
          content: 'That was not valid JSON. Return valid JSON only.',
        });
      }
    }
    return null;
  }
}
