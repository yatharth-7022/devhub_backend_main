import { Module } from '@nestjs/common';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';
import { SpacesModule } from 'src/spaces/spaces.module';
import { PrismaService } from 'prisma/prisma.service';
import { AiModule } from 'src/ai/ai.module';
import { ScrapeService } from './scrape.service';

@Module({
  imports: [SpacesModule, AiModule],
  controllers: [ResourcesController],
  providers: [ResourcesService, PrismaService, ScrapeService],
  exports: [ResourcesService, ScrapeService],
})
export class ResourcesModule {}
