import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { ResourcesService } from './resources.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtUserPayload } from 'src/common/decorators/current-user.decorator';
import { ok, fail } from 'src/common/api-response';

import { CreateResourceDto } from './dto/create-resource.dto';
import { CreateFromUrlDto } from './dto/create-from-url.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { ListResourcesQueryDto } from './dto/list-resources.query.dto'; // NEW

@Controller('resources')
@UseGuards(AuthGuard('jwt'))
export class ResourcesController {
  constructor(private readonly resourceService: ResourcesService) {}

  @Post()
  async create(
    @CurrentUser() user: JwtUserPayload,
    @Body() createResourceDto: CreateResourceDto,
  ) {
    const resource = await this.resourceService.createForUser(
      user.sub,
      createResourceDto,
    );
    return ok(resource);
  }

  // ✅ REPLACED GET
  @Get()
  async list(
    @CurrentUser() user: JwtUserPayload,
    @Query() query: ListResourcesQueryDto,
  ) {
    const result = await this.resourceService.listForSpace(user.sub, query);
    return ok(result);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('from-url')
  async createFromUrl(
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: CreateFromUrlDto,
  ) {
    try {
      const resource = await this.resourceService.createFromUrl(user.sub, dto);
      return ok(resource);
    } catch (error) {
      return fail(error.message, 'SCRAPE_FAILED');
    }
  }

  @Get(':id')
  async findOne(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return ok(await this.resourceService.findOne(user.sub, id));
  }

  @Put(':id')
  async update(
    @CurrentUser() user: JwtUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateResourceDto,
  ) {
    return ok(await this.resourceService.update(user.sub, id, dto));
  }

  @Delete(':id')
  async remove(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    await this.resourceService.remove(user.sub, id);
    return ok(null);
  }
}
