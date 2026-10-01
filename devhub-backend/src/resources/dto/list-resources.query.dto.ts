// src/resources/dto/list-resources.query.dto.ts

import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListResourcesQueryDto {
  @IsString()
  spaceId: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  tags?: string;

  @IsOptional()
  @IsIn(['createdAt_desc', 'createdAt_asc', 'title_asc', 'title_desc'])
  sort?: 'createdAt_desc' | 'createdAt_asc' | 'title_asc' | 'title_desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
