# Docker Guide for NFTokenPass

This repository currently uses a simple, development-first Docker setup.

## What is included

- `docker-compose.yml` for running all services together
- `services/api/Dockerfile` for the API container
- `services/web/Dockerfile` for the web container
- `.dockerignore` to keep build contexts small
- `.env.docker.example` as an environment template

## Services

`docker-compose.yml` defines:

- `db` → PostgreSQL 15 (`localhost:5432`)
- `api` → backend service (`localhost:3001`)
- `web` → frontend service (`localhost:3000`)

## Prerequisites

- Docker (Desktop or Engine)
- Docker Compose

Verify:

```bash
docker --version
docker-compose --version
```

## Quick start

1. Copy environment file:

```bash
cp .env.docker.example .env
```

2. Build and start all services:

```bash
docker-compose up --build
```

The API waits for PostgreSQL to become healthy, applies the committed Prisma migrations, and then starts the development server.

## Database schema workflow

`services/api/prisma/schema.prisma` is the source of truth for the database model. After changing it, run these commands from `services/api`:

```bash
npx prisma format
npx prisma validate
npx prisma generate
```

For the current initial migration, before it has been deployed anywhere, regenerate its SQL from the schema:

```bash
npx prisma migrate diff \
	--from-empty \
	--to-schema-datamodel prisma/schema.prisma \
	--script > prisma/migrations/20260406135518_init/migration.sql
```

After the initial migration has been applied, create a new migration for each later schema change:

```bash
npx prisma migrate dev --name describe_the_change
```

Apply committed migrations in deployment environments with:

```bash
npx prisma migrate deploy
```

Do not edit an applied migration or reuse an old migration folder for a new change. For local development, seed the database with:

```bash
npm run db:seed
```

To reset a disposable local database and apply migrations again, run:

```bash
docker-compose down -v
docker-compose up --build
```

3. Check status and logs:

```bash
docker-compose ps
docker-compose logs -f
```

4. Open services:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Postgres: `localhost:5432`

## Common commands

```bash
# Stop containers
docker-compose down

# Stop and remove volumes (deletes DB data)
docker-compose down -v

# Rebuild images
docker-compose build --no-cache

# Service logs
docker-compose logs -f api
docker-compose logs -f web
docker-compose logs -f db

# Enter running containers
docker-compose exec api sh
docker-compose exec web sh
```

## Notes on current setup

- The API and web Dockerfiles are intentionally simple because both services are still early-stage.
- Compose is the primary workflow; no root Dockerfile is required for day-to-day usage.
- As the project matures, we can add a separate optimized deploy configuration if needed.

## Troubleshooting

- Port conflict: update published ports in `docker-compose.yml`.
- Containers not starting: run `docker-compose logs <service>`.
- Fresh reset: `docker-compose down -v && docker-compose up --build`.
