ARG TARGETPLATFORM=linux/amd64
FROM --platform=$TARGETPLATFORM eclipse-temurin:17.0.2_8-jre-focal

ARG FLYWAY_VERSION=11.20.0
ARG TARGETARCH

WORKDIR /flyway

ENV PATH=/opt/mssql-tools/bin:$PATH

# Install required packages
RUN apt-get update && apt-get install -y --no-install-recommends curl gnupg tar dialog openssh-server apt-transport-https locales gnupg2

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

# Copy package.json and package-lock.json from the root directory
COPY package.json turbo.json tsconfig.server.json ./
COPY packages/GeneratedActions/package.json ./packages/GeneratedActions/package.json
COPY packages/GeneratedEntities/package.json ./packages/GeneratedEntities/package.json
COPY packages/MJAPI/package.json ./packages/MJAPI/package.json

# Install dependencies using npm workspaces
RUN npm install

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

# Set the entrypoint for the container
ENTRYPOINT ["/entrypoint.sh"]
