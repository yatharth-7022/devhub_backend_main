import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { SpacesService } from 'src/spaces/spaces.service';
import { CreateResourceDto } from './dto/create-resource.dto';
import { ScrapeService } from './scrape.service';
import { CreateFromUrlDto } from './dto/create-from-url.dto';
import { ListResourcesQueryDto } from './dto/list-resources.query.dto';
import { PageResult } from 'src/common/pagination';
import { Prisma } from '@prisma/client';
import { IngestService } from 'src/ai/ingest.service';
import { EnrichService } from 'src/ai/enrich.service';
import { UpdateResourceDto } from './dto/update-resource.dto';

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spacesService: SpacesService,
    private readonly scrapeService: ScrapeService,
    private readonly ingest: IngestService,
    private readonly enrich: EnrichService,
  ) {}

  private readonly logger = new Logger(ResourcesService.name);

  /** Index failures must not lose the saved resource. */
  private async safeIndex(id: string, title: string, text?: string | null) {
    try {
      if (text) await this.ingest.indexResource(id, title, text);
    } catch (e) {
      this.logger.error(`Indexing failed for ${id}: ${e}`);
    }
  }


  async createForUser(userId: string, dto: CreateResourceDto) {
    // Ensure the space belongs to the user
    await this.spacesService.ensureUserOwnsSpace(userId, dto.spaceId);
    const resource = await this.prisma.resource.create({
      data: {
        spaceId: dto.spaceId,
        title: dto.title,
        url: dto.url,
        contentPreview: dto.contentPreview,
        tags: dto.tags,
      },
    });
    await this.safeIndex(
      resource.id,
      resource.title,
      dto.contentPreview,
    );
    return resource;
  }
  async createFromUrl(userId: string, dto: CreateFromUrlDto) {
    // Ensure the space belongs to the user
    await this.spacesService.ensureUserOwnsSpace(userId, dto.spaceId);

    const { title, contentPreview, text } =
      await this.scrapeService.scrapeAndProcess(dto.url);
    const enrichment = await this.enrich.enrich(title, text).catch(() => null);

    const resource = await this.prisma.resource.create({
      data: {
        spaceId: dto.spaceId,
        title,
        url: dto.url,
        contentPreview,
        tags: enrichment?.tags ?? [],
        summary: enrichment?.summary,
      },
    });
    await this.safeIndex(resource.id, title, text);
    return resource;
  }
  async findBySpaceForUser(userId: string, spaceId: string) {
    // Ensure the space belongs to the user
    await this.spacesService.ensureUserOwnsSpace(userId, spaceId);
    const resources = await this.prisma.resource.findMany({
      where: {
        spaceId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return resources;
  }
  async listForSpace(
    userId: string,
    query: ListResourcesQueryDto,
  ): Promise<PageResult<any>> {
    const {
      spaceId,
      q,
      tags,
      sort = 'createdAt_desc',
      page = 1,
      limit = 20,
    } = query;

    await this.spacesService.ensureUserOwnsSpace(userId, spaceId);

    const skip = (page - 1) * limit;
    const tagList = (tags ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const orderBy =
      sort === 'createdAt_asc'
        ? ({ createdAt: 'asc' } as const)
        : sort === 'title_asc'
          ? ({ title: 'asc' } as const)
          : sort === 'title_desc'
            ? ({ title: 'desc' } as const)
            : ({ createdAt: 'desc' } as const);

    if (!q?.trim()) {
      const where: Prisma.ResourceWhereInput = {
        spaceId,
        ...(tagList.length ? { tags: { hasEvery: tagList } } : {}),
      };

      const [total, items] = await Promise.all([
        this.prisma.resource.count({ where }),
        this.prisma.resource.findMany({
          where,
          orderBy,
          skip,
          take: limit,
        }),
      ]);

      return {
        items,
        page,
        limit,
        total,
        hasNextPage: skip + items.length < total,
      };
    }

    // Search query exists => Postgres FTS fallback (raw SQL)
    // Uses websearch_to_tsquery for a Google-like search syntax.
    // See Postgres docs for text search functions. [web:62]
    const search = q.trim();

    const tagFilterSql =
      tagList.length > 0
        ? Prisma.sql` AND "tags" @> ${tagList}::text[] `
        : Prisma.empty;

    // Total
    const totalRows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "Resource"
      WHERE "spaceId" = ${spaceId}
        ${tagFilterSql}
        AND (
          to_tsvector('english', COALESCE("title",'') || ' ' || COALESCE("url",'') || ' ' || COALESCE("contentPreview",''))
          @@ websearch_to_tsquery('english', ${search})
        )
    `;

    const total = Number(totalRows[0]?.count ?? 0n);

    // Items (ranked)
    const items = await this.prisma.$queryRaw<any[]>`
      SELECT *
      FROM "Resource"
      WHERE "spaceId" = ${spaceId}
        ${tagFilterSql}
        AND (
          to_tsvector('english', COALESCE("title",'') || ' ' || COALESCE("url",'') || ' ' || COALESCE("contentPreview",''))
          @@ websearch_to_tsquery('english', ${search})
        )
      ORDER BY "createdAt" DESC
      OFFSET ${skip}
      LIMIT ${limit}
    `;

    return {
      items,
      page,
      limit,
      total,
      hasNextPage: skip + items.length < total,
    };
  }

  private async getOwned(userId: string, id: string) {
    const resource = await this.prisma.resource.findUnique({ where: { id } });
    if (!resource) throw new NotFoundException('Resource not found');
    await this.spacesService.ensureUserOwnsSpace(userId, resource.spaceId);
    return resource;
  }

  async findOne(userId: string, id: string) {
    return this.getOwned(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateResourceDto) {
    const existing = await this.getOwned(userId, id);
    const updated = await this.prisma.resource.update({
      where: { id },
      data: {
        title: dto.title,
        url: dto.url,
        contentPreview: dto.contentPreview,
        tags: dto.tags,
      },
    });
    if (dto.contentPreview !== undefined || dto.title !== undefined) {
      await this.safeIndex(
        id,
        updated.title,
        updated.contentPreview ?? existing.contentPreview,
      );
    }
    return updated;
  }

  async remove(userId: string, id: string) {
    await this.getOwned(userId, id);
    await this.prisma.resource.delete({ where: { id } }); // chunks cascade
  }
}
