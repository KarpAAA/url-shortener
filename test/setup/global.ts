import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';

import { seedTestData } from '../seed/seed-test';

import { POSTGRES_IMAGE, TEMPLATE_DATABASE } from './constants';
import { runPrisma } from './prisma-cli';

import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Connection URL of the container's maintenance database (`postgres`). */
    postgresAdminUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

const withDatabase = (url: string, database: string): string => {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.href;
};

/**
 * One Postgres container per run. A template database is migrated and seeded once; every
 * test file then clones it (`CREATE DATABASE … TEMPLATE`), so files run in parallel and
 * never share state (testing.md §3).
 */
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase('postgres')
    .withUsername('test')
    .withPassword('test')
    .start();
  const adminUrl = container.getConnectionUri();

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${TEMPLATE_DATABASE}`);
  await admin.end();

  const templateUrl = withDatabase(adminUrl, TEMPLATE_DATABASE);
  const migration = await runPrisma(['migrate', 'deploy'], templateUrl);
  if (migration.exitCode !== 0) throw new Error(`migrations failed:\n${migration.output}`);
  await seedTestData(templateUrl);

  project.provide('postgresAdminUrl', adminUrl);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
