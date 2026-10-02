FROM node:20-alpine

WORKDIR /app

# Install dumb-init to handle signals
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create a non-root user to run the application
# (mkdir .next so the /app/.next dev volume inherits nodejs ownership)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p /app/.next && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start Next.js development server
CMD ["npm", "run", "dev"]
