/** The same major version as docker-compose.yml and CI. */
export const POSTGRES_IMAGE = 'postgres:18-alpine';

/** Migrated and seeded once per run; every test file clones it. */
export const TEMPLATE_DATABASE = 'test_template';
