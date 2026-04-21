# Docker image for reproducible DBAutoDoc speedup smoke tests.
# Node 20 gives us built-in fetch; no external deps needed beyond dev tooling.

FROM node:20-slim

WORKDIR /app

# Install minimal tools for result post-processing.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-dev \
    jq \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package metadata first to leverage layer caching.
COPY package.json ./
RUN npm install --omit=dev

# Copy the test suite.
COPY smoke-tests ./smoke-tests
COPY run-tests.sh ./run-tests.sh
COPY chinook-state.json ./chinook-state.json
COPY chain-10-state.json ./chain-10-state.json
COPY enterprise-15-state.json ./enterprise-15-state.json

# Default command: run the full test matrix.
CMD ["./run-tests.sh", "all"]
