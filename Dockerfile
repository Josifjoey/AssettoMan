# Stage 1: Build React frontend
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
# dist/ now contains index.html + assets/

# Stage 2: Production runtime
FROM node:20-alpine AS runtime
WORKDIR /app

# Built frontend is served by the Express server from public/
COPY --from=builder /app/dist ./public

# Server production dependencies only
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Server source
COPY package.json ./package.json
COPY server/src/ ./server/src/

# Data (SQLite db, server files, mods, uploads) is volume-mounted in production
RUN mkdir -p /app/server/data

ENV NODE_ENV=production
ENV PORT=3010
ENV DATA_DIR=/app/server/data
EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3010/ready >/dev/null || exit 1

CMD ["node", "server/src/index.js"]
