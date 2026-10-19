# API tests

Tests use [Vitest](https://vitest.dev) and [supertest](https://github.com/ladjs/supertest), and run against a separate Postgres database so they never touch the dev database.

```bash
npm run test:db:up     # start the test database (Docker, port 5433)
npm test               # run the suite
npm run test:watch     # re-run on changes
npm run test:db:down   # stop the test database
```

- The test database keeps its data in memory, so it's empty every time it starts. Migrations are applied automatically before the tests run.
- Every table is emptied between tests. As a safety check, the suite refuses to run unless the database name ends in `_test`.
- To use a different Postgres instead of Docker, set `TEST_DATABASE_URL` (the database name must still end in `_test`).
- External services aren't called: Pinata and the blockchain provider are mocked.

Helpers live in `test/helpers`: `db.ts` has `resetDb` and factories for users, events and ticket types, and `auth.ts` builds a login cookie for a given wallet and role.
