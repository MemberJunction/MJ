FROM node:24-bullseye

# Install essential native build dependencies and git
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    build-essential \
    procps \
    && rm -rf /var/lib/apt/lists/*

# The MemberJunction release this workspace was scaffolded for. `mj agent init` writes it to
# .env from its own version and docker-compose.yml passes it in, so the CLI inside the container
# is the same release as the one that created the workspace. Never install unpinned: that
# resolves npm's `latest` tag, which can be a different major line from the scaffolding CLI.
ARG MJ_VERSION
RUN if [ -z "$MJ_VERSION" ]; then \
      echo "ERROR: the MJ_VERSION build arg is required. Set MJ_VERSION in .env ('mj agent init' writes it)." >&2; \
      exit 1; \
    fi \
    && npm install -g "@memberjunction/cli@${MJ_VERSION}" pm2 pnpm

WORKDIR /workspace

EXPOSE 4000 4200
