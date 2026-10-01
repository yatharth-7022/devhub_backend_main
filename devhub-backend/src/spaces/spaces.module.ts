import { Module } from '@nestjs/common';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';
import { PrismaService } from 'prisma/prisma.service';

@Module({
  controllers: [SpacesController],
  providers: [SpacesService, PrismaService],
  exports: [SpacesService],
})
export class SpacesModule {}
