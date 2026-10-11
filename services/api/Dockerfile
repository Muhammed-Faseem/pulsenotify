# Stage 1: dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: final image
FROM node:20-alpine AS runtime
WORKDIR /app

# Security: run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

COPY --from=deps --chown=nodeuser:nodejs /app/node_modules ./node_modules
COPY --chown=nodeuser:nodejs src/ ./src/
COPY --chown=nodeuser:nodejs package.json ./

USER nodeuser

EXPOSE 3000
ENV NODE_ENV=production

# Use exec form — receives SIGTERM directly (not via shell)
CMD ["node", "src/index.js"]
