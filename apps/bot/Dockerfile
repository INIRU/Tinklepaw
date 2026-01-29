FROM node:20-alpine AS builder

WORKDIR /app

# Install canvas dependencies
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

# Copy bot package files
COPY package*.json ./

# Copy core package (workspace dependency)
COPY ../../packages/core/package.json ./packages/core/package.json
COPY ../../packages/core/src ./packages/core/src

# Install dependencies
RUN npm install

# Copy bot source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runtime

WORKDIR /app

# Install canvas dependencies for runtime
RUN apk add --no-cache \
    pixman \
    cairo \
    pango \
    jpeg \
    librsvg \
    dumb-init

# Copy bot package files
COPY package*.json ./

# Copy core package
COPY ../../packages/core/package.json ./packages/core/package.json

# Install only production dependencies
RUN npm install --omit=dev && \
    npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Copy core source (since it's workspace dependency, we need it at runtime)
COPY --from=builder /app/packages/core ./packages/core

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start bot
CMD ["node", "dist/index.js"]
