import { execFileSync } from 'child_process';
import path from 'path';
import { TEST_DATABASE_URL, assertTestDatabase } from './testEnv';

// Runs once before the whole suite: applies the Prisma migrations to the test database.
export default function setup(): void {
  assertTestDatabase(TEST_DATABASE_URL);

  const prismaBin = path.resolve(__dirname, '../node_modules/.bin/prisma');
  try {
    execFileSync(prismaBin, ['migrate', 'deploy'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'pipe',
    });
  } catch (err: any) {
    const output = err.stdout?.toString() + err.stderr?.toString();
    throw new Error(
      `Could not migrate the test database. Is it running? Start it with "npm run test:db:up".\n\n${output}`
    );
  }
}
