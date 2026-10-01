import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export const OPENAI = 'OPENAI_CLIENT';

export const openAiProvider = {
  provide: OPENAI,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new OpenAI({ apiKey: config.get<string>('OPENAI_API_KEY') }),
};
