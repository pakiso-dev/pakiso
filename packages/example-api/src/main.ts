import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Pakiso Example API')
    .setDescription(
      'Interactive docs for the user-onboarding workflow demonstrating ' +
        '@pakiso/nest: durable steps, attestation gates (email verification, ' +
        'compliance approval), and the REST control plane for starting runs ' +
        'and signaling suspended gates.',
    )
    .setVersion('0.1.0')
    .addTag('onboarding')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`Pakiso onboarding example API listening on http://localhost:${port}`);
  console.log(`Swagger UI available at http://localhost:${port}/docs`);
}

bootstrap();
