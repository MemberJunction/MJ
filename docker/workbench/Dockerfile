FROM node:24-bookworm

# Install system dependencies (includes xvfb for headless browser fallback)
RUN apt-get update && apt-get install -y \
    git \
    ripgrep \
    curl \
    zsh \
    fzf \
    jq \
    gnupg2 \
    apt-transport-https \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install MS SQL Server command-line tools (Debian 12 / Bookworm)
RUN curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y msodbcsql18 mssql-tools18 unixodbc-dev \
    && rm -rf /var/lib/apt/lists/*

# Add sqlcmd to PATH
ENV PATH="$PATH:/opt/mssql-tools18/bin"

# Install Angular CLI and Turbo globally
RUN npm install -g @angular/cli turbo

# Install Playwright CLI first, then install Chromium using the CLI's bundled
# Playwright version so the browser revision matches what playwright-cli expects.
RUN npm install -g @playwright/cli@latest
RUN cd /usr/local/lib/node_modules/@playwright/cli && npx playwright install --with-deps chromium

# Install Claude Code globally (latest for Opus 4.6+ support)
RUN npm install -g @anthropic-ai/claude-code@latest

# Install MemberJunction CLI globally
RUN npm install -g @memberjunction/cli

# Install Flyway CLI (architecture-aware: bundled JRE on x64, platform-independent + system JRE on ARM64)
ARG FLYWAY_VERSION=10.20.1
RUN ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then \
         apt-get update && apt-get install -y --no-install-recommends default-jre-headless && rm -rf /var/lib/apt/lists/* \
         && FLYWAY_SUFFIX="" ; \
       else \
         FLYWAY_SUFFIX="-linux-x64" ; \
       fi \
    && curl -fsSL "https://repo1.maven.org/maven2/org/flywaydb/flyway-commandline/${FLYWAY_VERSION}/flyway-commandline-${FLYWAY_VERSION}${FLYWAY_SUFFIX}.tar.gz" -o /tmp/flyway.tar.gz \
    && tar -xzf /tmp/flyway.tar.gz -C /opt \
    && ln -s "/opt/flyway-${FLYWAY_VERSION}/flyway" /usr/local/bin/flyway \
    && rm /tmp/flyway.tar.gz

# Install oh-my-zsh
RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended

# Set up zsh config with aliases and shortcuts
COPY .zshrc /root/.zshrc

# Pre-configure Claude Code permissions for common dev commands
# (Named volume will preserve this on first run, then persist user changes)
RUN mkdir -p /root/.claude
COPY claude-settings.json /root/.claude/settings.json

# Copy scripts
COPY entrypoint.sh /entrypoint.sh
COPY db-bootstrap.sh /usr/local/bin/db-bootstrap
COPY auth-setup.sh /usr/local/bin/auth-setup
RUN chmod +x /entrypoint.sh /usr/local/bin/db-bootstrap /usr/local/bin/auth-setup

# Set zsh as default shell
ENV SHELL=/bin/zsh

WORKDIR /workspace

ENTRYPOINT ["/entrypoint.sh"]
