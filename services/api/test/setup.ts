import { afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma';

afterAll(async () => {
  await prisma.$disconnect();
});
