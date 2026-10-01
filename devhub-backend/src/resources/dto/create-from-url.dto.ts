import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreateFromUrlDto {
  @IsString()
  @IsNotEmpty()
  spaceId: string;

  @IsUrl({ require_protocol: true })
  url: string;
}
