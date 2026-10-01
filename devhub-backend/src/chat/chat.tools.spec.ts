import { ChatRequestSchema, TOOL_SCHEMAS } from './chat.tools';
import { EnrichmentSchema } from '../ai/enrich.service';

describe('zod schemas', () => {
  it('rejects empty chat messages', () => {
    expect(
      ChatRequestSchema.safeParse({ spaceId: 's', messages: [] }).success,
    ).toBe(false);
  });

  it('accepts a valid chat request', () => {
    expect(
      ChatRequestSchema.safeParse({
        spaceId: 's',
        messages: [{ role: 'user', content: 'hi' }],
      }).success,
    ).toBe(true);
  });

  it('rejects bad tool args', () => {
    expect(
      TOOL_SCHEMAS.add_resource_from_url.safeParse({ url: 'nope' }).success,
    ).toBe(false);
    expect(TOOL_SCHEMAS.search_resources.safeParse({}).success).toBe(false);
  });

  it('normalizes enrichment tags and rejects empty tag list', () => {
    const ok = EnrichmentSchema.parse({
      summary: 'A reasonably long summary of the page.',
      tags: [' React '],
    });
    expect(ok.tags).toEqual(['react']);
    expect(
      EnrichmentSchema.safeParse({ summary: 'x'.repeat(30), tags: [] }).success,
    ).toBe(false);
  });
});
