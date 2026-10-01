import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';

import { createTestDatabase, type TestDatabase } from './db';

import type { NestExpressApplication } from '@nestjs/platform-express';
import type TestAgent from 'supertest/lib/agent';

export interface TestApp {
  readonly app: NestExpressApplication;
  readonly http: TestAgent;
  readonly db: TestDatabase;
  close(): Promise<void>;
}

export interface TestAppOptions {
  /** Environment overrides for this file, on top of `.env.test`. */
  readonly env?: Readonly<Record<string, string>>;
  /** Replace providers, e.g. the code generator with a scripted fake. */
  readonly override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

/**
 * The whole `api` process on a database of its own: the real module graph, the real
 * pipeline (`configureApiApp`), real Postgres. One per test file.
 *
 * The entrypoint is imported dynamically: configuration is validated when the module graph
 * is loaded, so the environment of this file must be in place first.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const db = await createTestDatabase();
  Object.assign(process.env, options.env, { DATABASE_URL: db.url });

  const { ApiModule } = await import('../../src/entrypoints/api.module');
  const { API_APP_OPTIONS, configureApiApp } = await import('../../src/entrypoints/bootstrap');

  const builder = Test.createTestingModule({ imports: [ApiModule] });
  const moduleRef = await (options.override?.(builder) ?? builder).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>(API_APP_OPTIONS);
  configureApiApp(app);
  // a listening server: supertest then reuses its port instead of binding one per request
  await app.listen(0);

  return {
    app,
    http: request(app.getHttpServer()),
    db,
    async close() {
      await app.close();
      await db.drop();
    },
  };
}
