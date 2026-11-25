import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Pakiso Example API')
    .setDescription(
      'Interactive docs for two workflows demonstrating @pakiso/nest: a ' +
        'user-onboarding workflow (durable steps, email-verification and ' +
        'compliance-approval attestation gates) and a support-refund agent ' +
        'workflow (an LLM-driven agent whose refund tool call pauses for a ' +
        "human's sign-off above an auto-approve limit) — plus the REST " +
        'control plane for starting runs and signaling suspended gates.',
    )
    .setVersion('0.1.0')
    .addTag('onboarding')
    .addTag('refund-agent')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`Pakiso onboarding example API listening on http://localhost:${port}`);
  console.log(`Swagger UI available at http://localhost:${port}/docs`);
}

bootstrap();
