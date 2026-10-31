FROM node:20-alpine

WORKDIR /app

# Install dumb-init to handle signals and openssl for Prisma engines
RUN apk add --no-cache dumb-init openssl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Generate Prisma Client for the image's platform (ignores host node_modules via .dockerignore)
RUN npx prisma generate

# Create a non-root user to run the application
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3001

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Regenerate the Prisma client on every start: node_modules lives in its own volume and keeps the
# client from when it was created, so after a schema change it wouldn't know the new fields.
# Then apply committed migrations and start the API.
CMD ["sh", "-c", "npx prisma generate && npm run db:migrate:deploy && npm run dev"]
