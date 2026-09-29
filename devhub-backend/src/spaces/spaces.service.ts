import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { CreateSpaceDto } from './dto/create-space.dto';

@Injectable()
export class SpacesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateSpaceDto) {
    return this.prisma.space.create({
      data: {
        name: dto.name,
        userId,
      },
    });
  }
  async findAllForUser(userId: string) {
    return this.prisma.space.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
  async ensureUserOwnsSpace(userId: string, spaceId: string) {
    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, userId },
    });
    if (!space) {
      throw new ForbiddenException('User does not have access to this space');
    }
    return space;
  }

  async update(userId: string, id: string, dto: CreateSpaceDto) {
    await this.ensureUserOwnsSpace(userId, id);
    return this.prisma.space.update({ where: { id }, data: { name: dto.name } });
  }

  async remove(userId: string, id: string) {
    await this.ensureUserOwnsSpace(userId, id);
    // Chunks cascade from Resource; remove resources first.
    await this.prisma.$transaction([
      this.prisma.resource.deleteMany({ where: { spaceId: id } }),
      this.prisma.space.delete({ where: { id } }),
    ]);
  }
}
