import { Module } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { AiModule } from 'src/ai/ai.module';
import { ResourcesModule } from 'src/resources/resources.module';
import { SpacesModule } from 'src/spaces/spaces.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [AiModule, ResourcesModule, SpacesModule],
  controllers: [ChatController],
  providers: [ChatService, PrismaService],
})
export class ChatModule {}
