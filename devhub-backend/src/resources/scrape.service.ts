import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Injectable, Logger } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import * as cheerio from 'cheerio';
import { assertPublicUrl } from 'src/common/ssrf';

const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 20_000;

@Injectable()
export class ScrapeService {
  private readonly logger = new Logger(ScrapeService.name);
  private readonly splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  /** Fetch with manual redirects so every hop is checked against SSRF rules. */
  private async fetchHtml(url: string): Promise<string> {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicUrl(current);
      const res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DevHubBot/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) throw new Error('Redirect without location');
        current = new URL(loc, current).toString();
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get('content-type') ?? '';
      if (!/text\/html|application\/xhtml|text\/plain/.test(type)) {
        throw new Error(`Unsupported content type: ${type || 'unknown'}`);
      }
      // Cap body size while reading.
      const reader = res.body!.getReader();
      const parts: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) {
          await reader.cancel();
          break;
        }
        parts.push(value);
      }
      return Buffer.concat(parts).toString('utf8');
    }
    throw new Error('Too many redirects');
  }

  async scrapeAndProcess(url: string): Promise<{
    title: string;
    contentPreview: string;
    text: string;
  }> {
    try {
      const html = await this.fetchHtml(url);
      const $ = cheerio.load(html);
      $('script, style, noscript, nav, footer, header, aside, svg, iframe').remove();

      const title =
        $('title').first().text().trim() ||
        $('h1').first().text().trim() ||
        'Untitled';
      const text = ($('main').text() || $('article').text() || $('body').text())
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n\n')
        .trim();

      if (!text) throw new Error('No readable content found');

      const chunks = await this.splitter.splitDocuments([
        new Document({ pageContent: text, metadata: { source: url } }),
      ]);
      const contentPreview = chunks
        .slice(0, 3)
        .map((c) => c.pageContent)
        .join('\n\n');

      return { title: title.slice(0, 100), contentPreview, text };
    } catch (error) {
      this.logger.error(`Scrape failed for ${url}:`, error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to scrape ${url}: ${message}`);
    }
  }
}
