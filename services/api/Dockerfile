FROM node:18-alpine

WORKDIR /app

# Install dumb-init to handle signals
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml* ./

# Install dependencies
RUN npm install -g pnpm && \
    pnpm install

# Copy source code
COPY . .

# Create a non-root user to run the application
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3001

ENTRYPOINT ["/usr/sbin/dumb-init", "--"]

# Run the API dev script defined in package.json
CMD ["pnpm", "dev"]
