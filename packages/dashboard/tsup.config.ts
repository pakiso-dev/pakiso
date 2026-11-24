import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node18',
  external: ['@causal/nest', '@nestjs/common', '@nestjs/core', 'reflect-metadata', 'rxjs'],
});
