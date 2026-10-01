import { type Env, parseEnv } from './env.schema';

let cached: Env | undefined;

/** The validated environment. The only place in `src/` that reads `process.env`. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** `ConfigModule.forRoot({ validate })`: fails the boot with every invalid key listed. */
export function validateEnv(raw: Record<string, unknown>): Env {
  cached = parseEnv(raw);
  return cached;
}
