import { execFile } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const PRISMA_CLI = resolve(ROOT, 'node_modules/prisma/build/index.js');

export interface PrismaRun {
  readonly exitCode: number;
  readonly output: string;
}

/**
 * Runs the Prisma CLI against the given database, exactly as the deploy pipeline does.
 * Resolves with the exit code instead of rejecting, so a test can assert on it.
 */
export function runPrisma(args: readonly string[], databaseUrl: string): Promise<PrismaRun> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      process.execPath,
      [PRISMA_CLI, ...args],
      { cwd: ROOT, env: { ...process.env, DATABASE_URL: databaseUrl } },
      (error, stdout, stderr) => {
        const output = `${stdout}\n${stderr}`;
        if (error && typeof error.code !== 'number') {
          reject(new Error(`prisma ${args.join(' ')} could not run: ${output}`, { cause: error }));
          return;
        }
        resolvePromise({ exitCode: typeof error?.code === 'number' ? error.code : 0, output });
      },
    );
  });
}
