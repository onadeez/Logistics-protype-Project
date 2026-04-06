# ─────────────────────────────────────────────
# Dockerfile for Zoho Catalyst AppSail
# ─────────────────────────────────────────────

FROM node:18-alpine

# Install OpenSSH client for SFTP dependency
RUN apk add --no-cache openssh-client

WORKDIR /app

# Install dependencies first (layer cache optimization)
COPY package*.json ./
RUN npm ci --only=production

# Copy application source
COPY . .

# AppSail listens on port 9000 by default
EXPOSE 9000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:9000/api/health || exit 1

CMD ["node", "index.js"]