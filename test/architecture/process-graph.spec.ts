// Reproduced from nest-conventions templates/test/architecture/process-graph.spec.ts, adapted
// to the single `api` process of this service (no worker, so no @Processor checks).
// Walks the Nest module metadata of the entrypoint without starting it. The lint rules catch
// the imports; this checks where the classes actually end up registered. The unit project
// supplies `.env.test`: ConfigModule.forRoot validates it while the graph is imported;
// nothing connects.
import { MODULE_METADATA } from '@nestjs/common/constants';
import { beforeAll, describe, expect, it } from 'vitest';

// relative: entrypoints have no alias, and test/ reaches them only here
import { ApiModule } from '../../src/entrypoints/api.module';

type Ctor = abstract new (...args: never[]) => unknown;

interface ModuleNode {
  name: string;
  controllers: Ctor[];
  providers: Ctor[];
  exports: unknown[];
}

const isCtor = (value: unknown): value is Ctor => typeof value === 'function';

const metadata = (key: string, target: object): unknown[] =>
  (Reflect.getMetadata(key, target) as unknown[] | undefined) ?? [];

/**
 * A class, `forwardRef(() => X)`, or a dynamic module `{ module, imports, providers }`
 * (already awaited: `ConfigModule.forRoot` returns a promise of one).
 */
function unwrapImport(entry: unknown): { module: Ctor; extra: Record<string, unknown[]> } | null {
  if (isCtor(entry)) return { module: entry, extra: {} };
  if (entry === null || typeof entry !== 'object') return null;
  if ('forwardRef' in entry && typeof entry.forwardRef === 'function') {
    return unwrapImport((entry.forwardRef as () => unknown)());
  }
  if ('module' in entry && isCtor(entry.module)) {
    const dynamic = entry as Record<string, unknown>;
    const list = (key: string): unknown[] => (Array.isArray(dynamic[key]) ? dynamic[key] : []);
    return {
      module: entry.module,
      extra: {
        imports: list('imports'),
        providers: list('providers'),
        controllers: list('controllers'),
      },
    };
  }
  return null;
}

/** `X` or `{ provide, useClass: X }`; value and factory providers carry no class. */
function providerClass(provider: unknown): Ctor | null {
  if (isCtor(provider)) return provider;
  if (provider !== null && typeof provider === 'object' && 'useClass' in provider) {
    return isCtor(provider.useClass) ? provider.useClass : null;
  }
  return null;
}

async function moduleGraph(root: Ctor): Promise<ModuleNode[]> {
  const nodes = new Map<Ctor, ModuleNode>();
  const visit = async (entry: unknown): Promise<void> => {
    const unwrapped = unwrapImport(await entry);
    if (!unwrapped) return;
    const { module, extra } = unwrapped;
    const firstVisit = !nodes.has(module);
    const node = nodes.get(module) ?? {
      name: module.name,
      controllers: [],
      providers: [],
      exports: metadata(MODULE_METADATA.EXPORTS, module),
    };
    nodes.set(module, node);

    const controllers = [
      ...(firstVisit ? metadata(MODULE_METADATA.CONTROLLERS, module) : []),
      ...(extra.controllers ?? []),
    ];
    const providers = [
      ...(firstVisit ? metadata(MODULE_METADATA.PROVIDERS, module) : []),
      ...(extra.providers ?? []),
    ];
    node.controllers.push(...controllers.filter(isCtor));
    node.providers.push(...providers.map(providerClass).filter((ctor) => ctor !== null));

    const imports = [
      ...(firstVisit ? metadata(MODULE_METADATA.IMPORTS, module) : []),
      ...(extra.imports ?? []),
    ];
    for (const imported of imports) await visit(imported);
  };
  await visit(root);
  return [...nodes.values()];
}

const controllersOf = (nodes: ModuleNode[]): string[] =>
  nodes.flatMap((node) => node.controllers.map((ctor) => ctor.name));

const nodeNamed = (nodes: ModuleNode[], name: string): ModuleNode | undefined =>
  nodes.find((node) => node.name === name);

let apiGraph: ModuleNode[];

beforeAll(async () => {
  apiGraph = await moduleGraph(ApiModule);
});

describe('R-48 api process', () => {
  it('declares controllers only in *HttpModule', () => {
    const offenders = apiGraph
      .filter((node) => node.controllers.length > 0 && !node.name.endsWith('HttpModule'))
      .map((node) => node.name);

    expect(offenders).toEqual([]);
  });

  it('serves the controllers of every module (the walk is not vacuous)', () => {
    expect(controllersOf(apiGraph).sort()).toEqual(['HealthController', 'LinksController']);
  });

  it('reaches the core module through its transport module', () => {
    expect(apiGraph.map((node) => node.name)).toEqual(
      expect.arrayContaining([
        'SharedModule',
        'HealthHttpModule',
        'LinksHttpModule',
        'LinksModule',
      ]),
    );
  });

  it('keeps the core module inert: no controller, and it exports only what its transport calls', () => {
    const core = nodeNamed(apiGraph, 'LinksModule');

    expect(core?.controllers).toEqual([]);
    expect(core?.exports.map((exported) => (exported as Ctor).name).sort()).toEqual([
      'LinksQueryService',
      'ResolveLinkService',
      'ShortenUrlService',
    ]);
  });

  it('keeps the entrypoint module a list of imports and nothing else', () => {
    const entry = nodeNamed(apiGraph, 'ApiModule');

    expect(entry?.controllers).toEqual([]);
    expect(entry?.providers).toEqual([]);
    expect(entry?.exports).toEqual([]);
  });
});
