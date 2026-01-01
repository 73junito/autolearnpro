# Multi-stage Dockerfile for the MCP server (smaller final image)
# Builder stage: install deps and compile TypeScript
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install full deps for build
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# Copy source and build
COPY . .
RUN npm run build

# Production stage: copy runtime assets only
FROM node:20-alpine AS runtime
WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Copy built output from builder
COPY --from=builder /app/build ./build

# Use non-root user for safety
RUN addgroup -S appgroup && adduser -S appuser -G appgroup || true
USER appuser

# MCP servers use stdio — no ports exposed
CMD ["node", "build/index.js"]
