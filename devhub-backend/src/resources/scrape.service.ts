import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Injectable, Logger } from '@nestjs/common';
import { chromium } from 'playwright';
import { Document } from '@langchain/core/documents';
import { assertPublicUrl } from 'src/common/ssrf';

@Injectable()
export class ScrapeService {
  private readonly logger = new Logger(ScrapeService.name);
  private readonly splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  async scrapeAndProcess(url: string): Promise<{
    title: string;
    contentPreview: string;
    text: string;
  }> {
    let browser;
    try {
      await assertPublicUrl(url);
      // Use Playwright to fetch and extract content
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      const page = await browser.newPage();
      // Re-check every request (redirects, iframes, subresources) against SSRF rules.
      await page.route('**/*', async (route) => {
        try {
          await assertPublicUrl(route.request().url());
          await route.continue();
        } catch {
          await route.abort();
        }
      });
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      const title = (await page.title()) || 'Untitled';

      // Extract text content directly from the page
      const text = await page.evaluate(() => document.body.innerText);

      // Create a LangChain document from the extracted text
      const docs = [
        new Document({
          pageContent: text,
          metadata: { source: url },
        }),
      ];

      if (docs.length === 0 || !docs[0].pageContent.trim()) {
        throw new Error('No readable content found');
      }

      const chunks = await this.splitter.splitDocuments(docs);
      const preview = chunks
        .slice(0, 3)
        .map((c) => c.pageContent)
        .join('\n\n');

      return {
        title,
        contentPreview: preview,
        text,
      };
    } catch (error) {
      this.logger.error(`Scrape failed for ${url}:`, error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to scrape ${url}: ${message}`);
    } finally {
      if (browser) await browser.close();
    }
  }
}
