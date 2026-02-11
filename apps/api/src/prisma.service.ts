import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }

  async enableShutdownHooks(app: INestApplication) {
    // TS a veces tipa $on como "never" en Prisma v5 + ciertas configs.
    // Runtime funciona, así que hacemos cast seguro.
    (this as any).$on('beforeExit', async () => {
      await app.close();
    });
  }
}
