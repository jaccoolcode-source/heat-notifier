FROM node:22-alpine

WORKDIR /app

# Install dependencies first (layer cached unless package files change)
COPY package*.json ./
RUN npm ci --only=production

# Application code
COPY server.js ./
COPY public/ ./public/

# Data directory — will be overridden by the bind mount at runtime,
# but needs to exist in the image so the server can start without a volume.
RUN mkdir -p data

EXPOSE 3000

CMD ["node", "server.js"]
