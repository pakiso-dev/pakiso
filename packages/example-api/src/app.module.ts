import 'reflect-metadata';
import { CausalModule } from '@causal/nest';
import { Module } from '@nestjs/common';
import { OnboardingModule } from './onboarding/onboarding.module.js';
import { resolveExampleStorage } from './storage.js';

@Module({
  imports: [
    // Defaults to the zero-config InMemoryStorageAdapter; set
    // CAUSAL_DATABASE_URL to persist runs via @causal/storage-prisma/SQLite
    // instead (see src/storage.ts and README.md).
    CausalModule.forRootAsync({
      useFactory: async () => ({
        storage: await resolveExampleStorage(),
        // `dateOfBirth` is masked by `RedactResponseInterceptor` on top of the
        // module's built-in defaults (password, token, ssn, ...).
        redactFields: ['dateOfBirth'],
      }),
    }),
    OnboardingModule,
  ],
})
export class AppModule {}
