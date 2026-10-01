import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

import type { INestApplication } from '@nestjs/common';

export const DOCS_PATH = 'docs';
export const DOCS_JSON_PATH = 'docs-json';

const DESCRIPTION = [
  'Shortens URLs, redirects short codes to their destination and reports visit counts.',
  '',
  'Every error is an RFC 9457 `application/problem+json` document. Branch on its `code`;',
  '`detail` is for humans. Every response carries `x-correlation-id`.',
].join('\n');

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('URL shortener')
    .setDescription(DESCRIPTION)
    .setVersion('1.0.0')
    .build();
  return SwaggerModule.createDocument(app, config, {
    // generated clients get `shortenUrl()`, not `LinksController_shortenUrl()`
    operationIdFactory: (_controllerKey, methodKey) => methodKey,
  });
}

/** Swagger UI at `/docs`, the document at `/docs-json`. */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(DOCS_PATH, app, buildOpenApiDocument(app), {
    jsonDocumentUrl: DOCS_JSON_PATH,
  });
}
