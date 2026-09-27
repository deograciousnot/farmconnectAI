# One container for Render: the built web app, the Node API and the Python AI service.
FROM node:20-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Node dependencies first, so they're cached between deploys.
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci

# Python dependencies in their own virtualenv.
COPY ai-service/requirements.txt ai-service/requirements.txt
RUN python3 -m venv /app/ai-service/.venv \
 && /app/ai-service/.venv/bin/pip install --no-cache-dir -r ai-service/requirements.txt

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    AI_SERVICE_URL=http://127.0.0.1:8000
# Render sets PORT; the Node server listens on it and serves the app, the API and /health.
CMD ["sh", "scripts/start.sh"]
