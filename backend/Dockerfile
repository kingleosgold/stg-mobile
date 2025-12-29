# Stack Tracker Pro API - Privacy-First Container
# This container processes receipt images without storing any data

FROM node:20-alpine

# Security: Run as non-root user
RUN addgroup -g 1001 -S stacktracker && \
    adduser -S stacktracker -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY server.js ./
COPY data/ ./data/
COPY scrapers/ ./scrapers/

# Security: No writable volumes needed (we never store data)
# The app runs entirely in memory

# Switch to non-root user
USER stacktracker

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start server
CMD ["node", "server.js"]
