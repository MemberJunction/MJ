FROM node:24-bullseye

# Install essential native build dependencies and git
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    build-essential \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install MemberJunction CLI and process manager globally
RUN npm install -g @memberjunction/cli pm2 pnpm

WORKDIR /workspace

EXPOSE 4000 4200
