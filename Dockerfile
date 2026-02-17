# Base image
FROM node:20-alpine AS builder

WORKDIR /app

# Install native dependencies for Canvas
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    pkgconfig \
    pixman-dev \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    librsvg-dev

# 1. Copy root package files
COPY package.json package-lock.json* ./

# 2. Copy workspace packages
COPY packages/core/package.json ./packages/core/
COPY apps/bot/package.json ./apps/bot/

# 3. Install dependencies (from root)
RUN npm install

# 4. Copy source code
COPY packages/core ./packages/core
COPY apps/bot ./apps/bot

# 5. Build Core
WORKDIR /app/packages/core
RUN npm run build

# 6. Build Bot
WORKDIR /app/apps/bot
RUN npm run build

WORKDIR /app
RUN npm prune --omit=dev --workspace=@nyaru/bot --include-workspace-root && \
    npm cache clean --force

# --- Runtime Stage ---
FROM node:20-alpine AS runtime

WORKDIR /app

# Install runtime native dependencies AND build tools (keeping them as requested)
RUN apk add --no-cache \
    pixman \
    cairo \
    pango \
    jpeg \
    librsvg \
    dumb-init \
    python3 \
    make \
    g++ \
    pkgconfig \
    pixman-dev \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    librsvg-dev

# Create user first
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy files with ownership (much faster than chown -R)
COPY --chown=nodejs:nodejs package.json package-lock.json* ./
COPY --chown=nodejs:nodejs packages/core/package.json ./packages/core/
COPY --chown=nodejs:nodejs apps/bot/package.json ./apps/bot/

# Copy built files with ownership
COPY --chown=nodejs:nodejs --from=builder /app/packages/core/dist ./packages/core/dist
COPY --chown=nodejs:nodejs --from=builder /app/packages/core/package.json ./packages/core/
COPY --chown=nodejs:nodejs --from=builder /app/apps/bot/dist ./apps/bot/dist
COPY --chown=nodejs:nodejs --from=builder /app/apps/bot/package.json ./apps/bot/
COPY --chown=nodejs:nodejs --from=builder /app/node_modules ./node_modules

USER nodejs

WORKDIR /app/apps/bot

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
