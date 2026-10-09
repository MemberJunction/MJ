ARG TARGETPLATFORM=linux/amd64
FROM --platform=$TARGETPLATFORM eclipse-temurin:17.0.2_8-jre-focal

ARG FLYWAY_VERSION=11.20.0
ARG TARGETARCH

WORKDIR /flyway

ENV PATH=/opt/mssql-tools/bin:$PATH

# Install required packages (build-essential needed for native addons like isolated-vm)
RUN apt-get update && apt-get install -y --no-install-recommends curl gnupg tar dialog openssh-server apt-transport-https locales gnupg2 build-essential

# Install Node
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
RUN apt-get install -y nodejs

# ffmpeg for meeting avatars: an agent's bot decodes its live avatar (H.264 video, AAC voice) with it, found on the PATH
# (or at MJ_FFMPEG_PATH). A static LGPL build from BtbN/FFmpeg-Builds (glibc >= 2.28; focal has 2.31), pinned by
# release and asset and checked against its sha256; only the ffmpeg binary and its licence are kept. Pin the three
# values per architecture from the release's page and its checksums.sha256. Build with --build-arg INSTALL_FFMPEG=false
# to leave it out: meetings then stay audio only, and the room says why.
ARG INSTALL_FFMPEG=true
ARG FFMPEG_BTBN_RELEASE=PIN-BTBN-RELEASE-TAG
ARG FFMPEG_BTBN_ASSET_AMD64=PIN-ffmpeg-n7.1-linux64-lgpl-7.1.tar.xz
ARG FFMPEG_BTBN_SHA256_AMD64=PIN-SHA256
ARG FFMPEG_BTBN_ASSET_ARM64=PIN-ffmpeg-n7.1-linuxarm64-lgpl-7.1.tar.xz
ARG FFMPEG_BTBN_SHA256_ARM64=PIN-SHA256
RUN if [ "$INSTALL_FFMPEG" = "true" ]; then \
      set -e; \
      case "${TARGETARCH:-amd64}" in \
        amd64) asset="$FFMPEG_BTBN_ASSET_AMD64"; sha="$FFMPEG_BTBN_SHA256_AMD64" ;; \
        arm64) asset="$FFMPEG_BTBN_ASSET_ARM64"; sha="$FFMPEG_BTBN_SHA256_ARM64" ;; \
        *) echo "No pinned ffmpeg build for ${TARGETARCH}; build with --build-arg INSTALL_FFMPEG=false" >&2; exit 1 ;; \
      esac; \
      case "$FFMPEG_BTBN_RELEASE $asset $sha" in \
        *PIN-*) echo "Pin FFMPEG_BTBN_RELEASE, the asset and its sha256 (see the comment above), or build with --build-arg INSTALL_FFMPEG=false" >&2; exit 1 ;; \
      esac; \
      apt-get install -y --no-install-recommends xz-utils; \
      curl -fsSL "https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_BTBN_RELEASE}/${asset}" -o /tmp/ffmpeg.tar.xz; \
      echo "${sha}  /tmp/ffmpeg.tar.xz" | sha256sum -c -; \
      mkdir -p /opt/ffmpeg; \
      tar -xJf /tmp/ffmpeg.tar.xz -C /opt/ffmpeg --strip-components=1 --wildcards '*/bin/ffmpeg' '*/LICENSE.txt'; \
      rm -f /tmp/ffmpeg.tar.xz; \
      ln -s /opt/ffmpeg/bin/ffmpeg /usr/local/bin/ffmpeg; \
      ffmpeg -hide_banner -decoders | grep -q ' h264 '; \
      ffmpeg -hide_banner -decoders | grep -q ' aac '; \
    fi

# Install Microsoft SQL Server tools
RUN locale-gen "en_US.UTF-8" \
  && curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add - \
  && curl https://packages.microsoft.com/config/debian/11/prod.list | tee /etc/apt/sources.list.d/msprod.list \
  && apt-get update \
  && ACCEPT_EULA=Y apt-get install -y mssql-tools unixodbc-dev \
  && apt-get remove -y curl apt-transport-https \
  && rm -f /etc/apt/sources.list.d/msprod.list \
  && rm -rf /var/lib/apt/lists/*

# Set up SSH configuration
RUN mkdir /var/run/sshd \
  && echo "root:Docker!" | chpasswd

COPY docker/MJAPI/sshd_config /etc/ssh/
EXPOSE 2222

# Download correct Flyway tar file
RUN curl -fsSL https://repo1.maven.org/maven2/org/flywaydb/flyway-commandline/${FLYWAY_VERSION}/flyway-commandline-${FLYWAY_VERSION}-linux-x64.tar.gz -o flyway.tgz; \
         tar -xzf flyway.tgz --strip-components=1; \
         ln -s /flyway /root/.node-flyway

WORKDIR /app

# Install pm2 globally
RUN npm install -g pm2

# corepack activates the pnpm version pinned by package.json's packageManager field
RUN corepack enable

# Copy the workspace manifests from the root directory
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.server.json ./
COPY packages/GeneratedActions/package.json ./packages/GeneratedActions/package.json
COPY packages/GeneratedEntities/package.json ./packages/GeneratedEntities/package.json
COPY packages/MJAPI/package.json ./packages/MJAPI/package.json

# Install dependencies using pnpm workspaces
RUN pnpm install

# Remove build tools to reduce image size
RUN apt-get purge -y build-essential && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Headless Chromium for server-side rendering (Create Mermaid Diagram); without it that action
# returns BROWSER_UNAVAILABLE. Installed through the playwright-core the workspace resolved, so the
# browser revision is the one Playwright launches. Adds ~650 MB; build with
# --build-arg INSTALL_CHROMIUM=false to leave it out.
ARG INSTALL_CHROMIUM=true
RUN if [ "$INSTALL_CHROMIUM" = "true" ]; then \
      for cli in node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/cli.js; do \
        [ -e "$cli" ] || continue; node "$cli" install --with-deps --only-shell chromium; \
      done && rm -rf /var/lib/apt/lists/*; \
    fi

# Copy necessary files and directories for the build
COPY packages/GeneratedActions ./packages/GeneratedActions/
COPY packages/GeneratedEntities ./packages/GeneratedEntities/
COPY packages/MJAPI ./packages/MJAPI/


# Build the MJAPI application
RUN npm run build:api

COPY docker/MJAPI/docker.config.cjs ./mj.config.cjs
COPY migrations ./migrations
COPY ["[SQL Scripts]", "./[SQL Scripts]"]

# Install the MJCLI package globally
RUN npm install -g @memberjunction/cli

# Copy the entrypoint script
COPY docker/MJAPI/entrypoint.sh /entrypoint.sh

# Make the entrypoint script executable
RUN chmod +x /entrypoint.sh

# MJAPI serves GraphQL + /healthcheck on this port (docker.config.cjs `graphqlPort`,
# overridable via PORT/GRAPHQL_PORT).
EXPOSE 4000

# Container-level liveness: MJServer registers an unauthenticated /healthcheck before
# the auth middleware. curl is removed from this image earlier in the build, so probe
# with node's global fetch. start-period is generous because the entrypoint runs
# `mj migrate` + `mj codegen` against the target DB before the API starts listening.
HEALTHCHECK --interval=30s --timeout=10s --start-period=15m --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||process.env.GRAPHQL_PORT||4000)+'/healthcheck').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Set the entrypoint for the container
ENTRYPOINT ["/entrypoint.sh"]
