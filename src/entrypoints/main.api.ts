import 'reflect-metadata';

import { ApiModule } from './api.module';
import { bootstrap } from './bootstrap';

bootstrap(ApiModule).catch((err: unknown) => {
  // the logger may not exist yet (invalid configuration): this is the one direct write
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
