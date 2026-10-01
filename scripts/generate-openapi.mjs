// Writes the OpenAPI document to a file, or (--check) fails when the committed file differs
// from what the code produces — so a contract change is visible as a diff in review.
// Runs on the compiled output: `pnpm build` first. Needs no database: the module graph is
// created in preview mode, where providers are not instantiated.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);

// Configuration is validated when the module graph is loaded; the document does not depend on it.
process.env.NODE_ENV ??= 'production';
process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
process.env.DATABASE_URL ??= 'postgresql://unused:unused@localhost:5432/unused';

require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { ApiModule } = require('../dist/entrypoints/api.module.js');
const { buildOpenApiDocument } = require('../dist/common/swagger/setup-swagger.js');

const args = process.argv.slice(2);
const check = args.includes('--check');
const file = args.find((arg) => !arg.startsWith('--'));
if (!file) {
  console.error('usage: generate-openapi.mjs [--check] <file>');
  process.exit(2);
}

const app = await NestFactory.create(ApiModule, { preview: true, logger: false });
const generated = `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`;
await app.close();

if (!check) {
  writeFileSync(file, generated);
  console.log(`wrote ${file}`);
} else if (readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== generated) {
  console.error(`${file} is out of date: run "pnpm build && pnpm openapi:generate" and commit it`);
  process.exit(1);
} else {
  console.log(`${file} is up to date`);
}
