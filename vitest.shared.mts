import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

import swc from 'unplugin-swc';

const root = import.meta.dirname;

export const alias = {
  '@config': resolve(root, 'src/config'),
  '@common': resolve(root, 'src/common'),
  '@shared': resolve(root, 'src/shared'),
  '@infra': resolve(root, 'src/infrastructure'),
  '@modules': resolve(root, 'src/modules'),
};

// esbuild does not emit decorator metadata, which Nest's DI needs
export const plugins = [
  swc.vite({
    jsc: {
      parser: { syntax: 'typescript', decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
      target: 'es2022',
      keepClassNames: true,
    },
    module: { type: 'es6' },
  }),
];

/** `.env.test`: fake values every suite runs with (config-env.md §4). */
export const testEnv = parseEnv(readFileSync(resolve(root, '.env.test'), 'utf8')) as Record<
  string,
  string
>;
