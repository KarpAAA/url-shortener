import { type ConfigType, registerAs } from '@nestjs/config';

import { env } from './env';

export const appConfig = registerAs('app', () => {
  const publicBaseUrl = new URL(env().PUBLIC_BASE_URL);
  const ownHosts: readonly string[] = [publicBaseUrl.host];
  return {
    name: 'url-shortener',
    port: env().PORT,
    /** Origin without a trailing slash: `http://localhost:3000`. */
    publicBaseUrl: publicBaseUrl.origin,
    /** Hosts (with a non-default port) that identify this service; links to them are rejected. */
    ownHosts,
    trustProxyHops: env().TRUST_PROXY_HOPS,
    shutdownTimeoutMs: env().SHUTDOWN_TIMEOUT_MS,
  };
});

export type AppConfig = ConfigType<typeof appConfig>;
