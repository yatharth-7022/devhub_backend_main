import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUserPayload } from 'src/common/decorators/current-user.decorator';
import { ChatService } from './chat.service';
import { ChatRequestSchema } from './chat.tools';

@Controller('chat')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** Server-sent events: token | tool_call | tool_result | sources | done | error */
  @Post('stream')
  async stream(
    @CurrentUser() user: JwtUserPayload,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);
    let closed = false;
    res.on('close', () => (closed = true));

    try {
      for await (const ev of this.chat.stream(
        user.sub,
        parsed.data.spaceId,
        parsed.data.messages,
      )) {
        if (closed) break;
        send(ev);
      }
    } catch (e) {
      send({ type: 'error', message: e instanceof Error ? e.message : 'Chat failed' });
    }
    res.end();
  }
}
