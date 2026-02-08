FROM node:24-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    ripgrep \
    curl \
    zsh \
    fzf \
    gnupg2 \
    apt-transport-https \
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

# Install Angular CLI globally
RUN npm install -g @angular/cli

# Install Playwright with Chromium and all system dependencies
RUN npx playwright install --with-deps chromium

# Install Claude Code globally (latest for Opus 4.6+ support)
RUN npm install -g @anthropic-ai/claude-code@latest

# Install MemberJunction CLI globally
RUN npm install -g @memberjunction/cli

# Install oh-my-zsh
RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended

# Set up zsh config with aliases and shortcuts
COPY .zshrc /root/.zshrc

# Pre-configure Claude Code permissions for common dev commands
# (Named volume will preserve this on first run, then persist user changes)
RUN mkdir -p /root/.claude
COPY claude-settings.json /root/.claude/settings.json

# Copy entrypoint (handles auto-updates)
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set zsh as default shell
ENV SHELL=/bin/zsh

WORKDIR /workspace

ENTRYPOINT ["/entrypoint.sh"]
