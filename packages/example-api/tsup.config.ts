import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  target: 'node20',
  external: [
    '@pakiso/storage-prisma',
    '@nestjs/common',
    '@nestjs/core',
    '@nestjs/platform-express',
    '@nestjs/swagger',
    '@prisma/client',
    'class-transformer',
    'class-validator',
    'reflect-metadata',
    'rxjs',
  ],
});
