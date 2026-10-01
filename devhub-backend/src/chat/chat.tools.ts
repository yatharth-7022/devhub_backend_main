import { z } from 'zod';
import OpenAI from 'openai';

export const searchResourcesArgs = z.object({
  query: z.string().min(1).describe('Natural-language search query'),
  spaceId: z.string().optional().describe('Defaults to the current space'),
});
export const listSpacesArgs = z.object({});
export const summarizeResourceArgs = z.object({
  resourceId: z.string().min(1),
});
export const addResourceArgs = z.object({
  url: z.string().url(),
  spaceId: z.string().optional().describe('Defaults to the current space'),
});

export const TOOL_SCHEMAS = {
  search_resources: searchResourcesArgs,
  list_spaces: listSpacesArgs,
  summarize_resource: summarizeResourceArgs,
  add_resource_from_url: addResourceArgs,
} as const;
export type ToolName = keyof typeof TOOL_SCHEMAS;

export const TOOL_DEFINITIONS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_resources',
      description:
        "Semantic search over the user's saved resources. Use for any question about their content.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          spaceId: { type: 'string' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_spaces',
      description: "List the user's spaces (id and name).",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'summarize_resource',
      description: 'Get the stored summary, tags and preview of one resource.',
      parameters: {
        type: 'object',
        properties: { resourceId: { type: 'string' } },
        required: ['resourceId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_resource_from_url',
      description:
        'Scrape a URL and save it as a resource (auto-summarized, tagged and indexed).',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' }, spaceId: { type: 'string' } },
        required: ['url'],
      },
    },
  },
];

export const ChatRequestSchema = z.object({
  spaceId: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(40),
});
