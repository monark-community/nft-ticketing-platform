// Settings for the test run. Nothing here is secret: the database is the local
// throwaway one from docker-compose.test.yml, and the keys only exist for tests.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://test_user:test_password@localhost:5433/nft_ticketing_test?schema=public';

export const TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: 'test-jwt-secret',
  JWT_EXPIRES_IN: '1h',
  PINATA_JWT: 'test-pinata-jwt',
  FRONTEND_URL: 'http://localhost:3000',
  // Keep the blockchain listener off unless a test sets these itself
  RPC_URL: '',
  CONTRACT_ADDRESS: '',
};

// Refuse to run against anything that isn't clearly a test database, since the
// suite wipes every table between tests.
export function assertTestDatabase(url: string): void {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to run tests against database "${name}". The database name must end in "_test".`);
  }
}
