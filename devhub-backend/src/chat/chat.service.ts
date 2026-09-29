import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from 'prisma/prisma.service';
import { OPENAI } from 'src/ai/openai.provider';
import { RetrievalService } from 'src/ai/retrieval.service';
import { ResourcesService } from 'src/resources/resources.service';
import { SpacesService } from 'src/spaces/spaces.service';
import { TOOL_DEFINITIONS, TOOL_SCHEMAS, ToolName } from './chat.tools';

export type ChatEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'tool_result'; name: string; ok: boolean }
  | {
      type: 'sources';
      sources: { resourceId: string; title: string; url: string | null }[];
    }
  | { type: 'done' }
  | { type: 'error'; message: string };

const MAX_TOOL_ROUNDS = 5;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly model: string;

  constructor(
    @Inject(OPENAI) private readonly openai: OpenAI,
    config: ConfigService,
    private readonly retrieval: RetrievalService,
    private readonly resources: ResourcesService,
    private readonly spaces: SpacesService,
    private readonly prisma: PrismaService,
  ) {
    this.model = config.get<string>('OPENAI_CHAT_MODEL') ?? 'gpt-4o-mini';
  }

  async *stream(
    userId: string,
    spaceId: string,
    history: { role: 'user' | 'assistant'; content: string }[],
  ): AsyncGenerator<ChatEvent> {
    const space = await this.spaces.ensureUserOwnsSpace(userId, spaceId);
    const sources = new Map<
      string,
      { resourceId: string; title: string; url: string | null }
    >();

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content:
          `You are DevHub, an assistant for the user's saved resources in the space "${space.name}" (id ${spaceId}). ` +
          'Always call search_resources before answering questions about their content, and answer only from retrieved excerpts. ' +
          'Cite sources by title. If nothing relevant is found, say so. Use add_resource_from_url only when explicitly asked to save a link.',
      },
      ...history,
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const stream = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        tools: TOOL_DEFINITIONS,
        stream: true,
      });

      let content = '';
      const calls: { id: string; name: string; args: string }[] = [];

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;
        if (delta.content) {
          content += delta.content;
          yield { type: 'token', text: delta.content };
        }
        for (const tc of delta.tool_calls ?? []) {
          const c = (calls[tc.index] ??= { id: '', name: '', args: '' });
          if (tc.id) c.id = tc.id;
          if (tc.function?.name) c.name += tc.function.name;
          if (tc.function?.arguments) c.args += tc.function.arguments;
        }
      }

      if (calls.length === 0) {
        if (sources.size) yield { type: 'sources', sources: [...sources.values()] };
        yield { type: 'done' };
        return;
      }

      messages.push({
        role: 'assistant',
        content: content || null,
        tool_calls: calls.map((c) => ({
          id: c.id,
          type: 'function' as const,
          function: { name: c.name, arguments: c.args },
        })),
      });

      for (const call of calls) {
        let result: unknown;
        let ok = true;
        try {
          const args = JSON.parse(call.args || '{}');
          yield { type: 'tool_call', name: call.name, args };
          result = await this.runTool(userId, spaceId, call.name, args, sources);
        } catch (e) {
          ok = false;
          // Zod / runtime errors are fed back so the model can correct itself.
          result = { error: e instanceof Error ? e.message : String(e) };
        }
        yield { type: 'tool_result', name: call.name, ok };
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    yield { type: 'error', message: 'Too many tool rounds' };
  }

  private async runTool(
    userId: string,
    currentSpaceId: string,
    name: string,
    rawArgs: unknown,
    sources: Map<string, { resourceId: string; title: string; url: string | null }>,
  ) {
    const schema = TOOL_SCHEMAS[name as ToolName];
    if (!schema) throw new Error(`Unknown tool: ${name}`);
    const args: any = schema.parse(rawArgs); // throws ZodError on invalid args

    switch (name as ToolName) {
      case 'search_resources': {
        const sid = args.spaceId ?? currentSpaceId;
        await this.spaces.ensureUserOwnsSpace(userId, sid);
        const hits = await this.retrieval.search(sid, args.query);
        for (const h of hits)
          sources.set(h.resourceId, {
            resourceId: h.resourceId,
            title: h.title,
            url: h.url,
          });
        return hits.map((h) => ({
          resourceId: h.resourceId,
          title: h.title,
          url: h.url,
          excerpt: h.content,
          score: Number(h.score.toFixed(3)),
        }));
      }
      case 'list_spaces': {
        const list = await this.spaces.findAllForUser(userId);
        return list.map((s) => ({ id: s.id, name: s.name }));
      }
      case 'summarize_resource': {
        const r = await this.resources.findOne(userId, args.resourceId);
        sources.set(r.id, { resourceId: r.id, title: r.title, url: r.url });
        return {
          title: r.title,
          url: r.url,
          summary: r.summary,
          tags: r.tags,
          preview: r.contentPreview,
        };
      }
      case 'add_resource_from_url': {
        const r = await this.resources.createFromUrl(userId, {
          spaceId: args.spaceId ?? currentSpaceId,
          url: args.url,
        });
        return { id: r.id, title: r.title, tags: r.tags, summary: r.summary };
      }
    }
  }
}
