# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    unzip \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

ENV PUPPETEER_CACHE_DIR=/opt/puppeteer-cache \
    DO_NOT_TRACK=1 \
    HYPERFRAMES_NO_TELEMETRY=1

WORKDIR /build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.server.json ./
COPY patches ./patches
COPY packages/AI/CorePlus/scripts ./packages/AI/CorePlus/scripts
COPY packages/AI/VideoStudio/Core ./packages/AI/VideoStudio/Core
COPY packages/AI/VideoStudio/RenderWorker ./packages/AI/VideoStudio/RenderWorker

RUN pnpm install --frozen-lockfile --config.allow-unused-patches=true --filter @memberjunction/video-studio-render-worker... \
  && pnpm --filter @memberjunction/video-studio-core run build \
  && pnpm --filter @memberjunction/video-studio-render-worker run build \
  && pnpm --filter @memberjunction/video-studio-render-worker run browser:install \
  && BROWSER_BIN="$(find /opt/puppeteer-cache -name chrome-headless-shell -type f | head -n 1)" \
  && test -n "$BROWSER_BIN" \
  && ln -sf "$BROWSER_BIN" /opt/puppeteer-cache/chrome-headless-shell-bin \
  && chmod -R a+rX /opt/puppeteer-cache \
  && pnpm --filter @memberjunction/video-studio-render-worker --prod --legacy --config.allow-unused-patches=true deploy /app \
  && rm -rf /app/node_modules/@memberjunction/video-studio-core \
  && mkdir -p /app/node_modules/@memberjunction/video-studio-core \
  && cp -r /build/packages/AI/VideoStudio/Core/package.json /build/packages/AI/VideoStudio/Core/dist /app/node_modules/@memberjunction/video-studio-core/ \
  && chmod -R a+rX /app

FROM node:24-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    fonts-dejavu-core \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-noto-core \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
  && rm -rf /var/lib/apt/lists/* \
  && printf '#!/bin/sh\nif [ "$1" = "infinity" ] && [ "$$" = "1" ]; then\n  exec node -e '\''process.on("SIGTERM",()=>process.exit(0));process.on("SIGINT",()=>process.exit(0));setInterval(()=>{},1<<30);'\''\nfi\nexec /bin/sleep "$@"\n' > /usr/local/bin/sleep \
  && chmod +x /usr/local/bin/sleep

WORKDIR /app
COPY --from=build /opt/puppeteer-cache /opt/puppeteer-cache
COPY --from=build --chown=node:node /app /app

ENV NODE_ENV=production \
    DO_NOT_TRACK=1 \
    HYPERFRAMES_NO_TELEMETRY=1 \
    VIDEO_STUDIO_RENDER_HOST=0.0.0.0 \
    VIDEO_STUDIO_RENDER_PORT=8080 \
    PUPPETEER_CACHE_DIR=/opt/puppeteer-cache \
    CHROME_PATH=/opt/puppeteer-cache/chrome-headless-shell-bin \
    PUPPETEER_EXECUTABLE_PATH=/opt/puppeteer-cache/chrome-headless-shell-bin \
    HYPERFRAMES_BROWSER_PATH=/opt/puppeteer-cache/chrome-headless-shell-bin \
    HYPERFRAMES_FONT_CACHE_DIR=/tmp/hyperframes-fonts \
    TMPDIR=/tmp

USER node
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS ${VIDEO_STUDIO_RENDER_TOKEN:+-H "Authorization: Bearer ${VIDEO_STUDIO_RENDER_TOKEN}"} http://127.0.0.1:${VIDEO_STUDIO_RENDER_PORT}/health || exit 1

CMD ["node", "/app/dist/main.js"]
