ARG TARGETPLATFORM=linux/amd64
FROM --platform=$TARGETPLATFORM openjdk:17-slim

ARG FLYWAY_VERSION=9.0.0
ARG TARGETARCH

WORKDIR /flyway

RUN apt-get update && apt-get install -y curl gnupg tar

# Download correct Flyway tar file
RUN curl -fsSL https://repo1.maven.org/maven2/org/flywaydb/flyway-commandline/${FLYWAY_VERSION}/flyway-commandline-${FLYWAY_VERSION}-linux-x64.tar.gz -o flyway.tgz; \
         tar -xzf flyway.tgz --strip-components=1; \
         ln -s /flyway /root/.node-flyway

WORKDIR /app

# Install Node
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Install pm2 globally
RUN npm install -g pm2

# Copy package.json and package-lock.json from the root directory
COPY package.json turbo.json ./
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
