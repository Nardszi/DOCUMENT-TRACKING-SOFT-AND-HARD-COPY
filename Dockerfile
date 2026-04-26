# ── Stage 1: Build the React frontend ────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy root workspace config and both package files
COPY package.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install all dependencies (workspaces)
RUN npm install --legacy-peer-deps

# Copy client source and build
COPY client/ ./client/
RUN npm run build --workspace=client

# ── Stage 2: Production server ────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Copy server package files and install production deps only
COPY server/package.json ./server/
RUN cd server && npm install --omit=dev --legacy-peer-deps

# Copy server source
COPY server/ ./server/

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/client/dist ./client/dist

# Create uploads directory
RUN mkdir -p ./server/uploads

# Expose port
EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "server/src/server.js"]
