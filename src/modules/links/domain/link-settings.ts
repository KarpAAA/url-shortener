import type { UrlRules } from './original-url';

/**
 * Facts about the deployment that the link rules depend on. Bound from configuration in
 * `links.module.ts`, so neither `application/` nor `read/` imports `config/`.
 */
export interface LinkSettings extends UrlRules {
  /** Origin short links are served from, without a trailing slash. */
  readonly publicBaseUrl: string;
}

export const LINK_SETTINGS = Symbol('LINK_SETTINGS');
