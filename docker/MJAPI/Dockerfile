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
