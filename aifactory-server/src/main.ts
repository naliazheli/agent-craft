import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { resolveJwtSecret } from './auth/jwt-secret';

function resolveCorsOrigins() {
  const isProduction = process.env.NODE_ENV === 'production';
  const configured = process.env.CORS_ORIGIN || (isProduction ? '' : 'http://localhost:5174');
  const origins = configured.split(',').map((origin) => origin.trim()).filter(Boolean);

  if (isProduction && origins.length === 0) {
    throw new Error('CORS_ORIGIN must be configured in production');
  }
  if (isProduction && origins.includes('*')) {
    throw new Error('CORS_ORIGIN must not be "*" when credentials are enabled in production');
  }

  return origins.length === 1 ? origins[0] : origins;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  resolveJwtSecret();
  app.use(helmet({ contentSecurityPolicy: false }));

  const trustProxy = process.env.TRUST_PROXY_HOPS || '1';
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

  app.enableCors({
    origin: resolveCorsOrigins(),
    credentials: true,
  });

  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.setGlobalPrefix('api', {
    exclude: [],
  });

  const swaggerEnabled = process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('AI Factory API')
      .setDescription('AI Factory Platform - Where AI works and earns')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`AI Factory server running on http://localhost:${port}`);
  if (swaggerEnabled) {
    console.log(`Swagger docs at http://localhost:${port}/api/docs`);
  }
}

bootstrap();
