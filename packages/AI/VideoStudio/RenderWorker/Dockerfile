# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.server.json ./
COPY patches ./patches
COPY packages/AI/CorePlus/scripts ./packages/AI/CorePlus/scripts
COPY packages/AI/VideoStudio/Core ./packages/AI/VideoStudio/Core
COPY packages/AI/VideoStudio/RenderWorker ./packages/AI/VideoStudio/RenderWorker

RUN pnpm install --frozen-lockfile --config.allow-unused-patches=true --filter @memberjunction/video-studio-render-worker... \
  && pnpm --filter @memberjunction/video-studio-core run build \
  && pnpm --filter @memberjunction/video-studio-render-worker run build \
  && pnpm --filter @memberjunction/video-studio-render-worker --prod --legacy --config.allow-unused-patches=true deploy /app \
  && rm -rf /app/node_modules/@memberjunction/video-studio-core \
  && mkdir -p /app/node_modules/@memberjunction/video-studio-core \
  && cp -r /build/packages/AI/VideoStudio/Core/package.json /build/packages/AI/VideoStudio/Core/dist /app/node_modules/@memberjunction/video-studio-core/

FROM node:24-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ffmpeg \
    fonts-dejavu-core \
    fonts-liberation \
    fonts-noto-core \
    fonts-noto-color-emoji \
    ca-certificates \
    curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build --chown=node:node /app /app

ENV NODE_ENV=production \
    VIDEO_STUDIO_RENDER_HOST=0.0.0.0 \
    VIDEO_STUDIO_RENDER_PORT=8080 \
    CHROME_PATH=/usr/bin/chromium \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    HYPERFRAMES_FONT_CACHE_DIR=/tmp/hyperframes-fonts \
    TMPDIR=/tmp

USER node
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS ${VIDEO_STUDIO_RENDER_TOKEN:+-H "Authorization: Bearer ${VIDEO_STUDIO_RENDER_TOKEN}"} http://127.0.0.1:${VIDEO_STUDIO_RENDER_PORT}/health || exit 1

CMD ["node", "/app/dist/main.js"]
