import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { PakisoDashboardModule } from '@pakiso/dashboard';
import { PakisoModule } from '@pakiso/nest';
import { OnboardingModule } from './onboarding/onboarding.module.js';
import { resolveExampleStorage } from './storage.js';

@Module({
  imports: [
    // Defaults to the zero-config InMemoryStorageAdapter; set
    // PAKISO_DATABASE_URL to persist runs via @pakiso/storage-prisma/SQLite
    // instead (see src/storage.ts and README.md).
    PakisoModule.forRootAsync({
      useFactory: async () => ({
        storage: await resolveExampleStorage(),
        // `dateOfBirth` is masked by `RedactResponseInterceptor` on top of the
        // module's built-in defaults (password, token, ssn, ...).
        redactFields: ['dateOfBirth'],
      }),
    }),
    OnboardingModule,
    // Browse runs and their full event journals at /pakiso-dashboard — see
    // @pakiso/dashboard's README for the production auth/scope caveats.
    PakisoDashboardModule,
  ],
})
export class AppModule {}
