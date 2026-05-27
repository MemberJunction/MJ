# MemberJunction Agentic Test Runner — generalized regression-suite image.
#
# Published as `memberjunction/agentic-test-runner:v<MJServer-version>` (see
# .github/workflows/docker.yml). External adopters consume it directly:
#
#   docker run --rm memberjunction/agentic-test-runner init generic-web
#   docker run --rm \
#       -v $(pwd)/test-results:/app/test-results \
#       -v $(pwd)/my-app-tests:/app/byo-metadata \
#       -e MJ_TEST_VAR_baseUrl=https://my-app.example.com \
#       -e TEST_SUITE_NAME="My App Suite" \
#       memberjunction/agentic-test-runner
#
# This image is the GENERIC half — no MJ-specific socat shim, no Dockerfile
# overlay for a particular Explorer deployment. The MJ regression compose
# (docker/regression/Dockerfile.test-runner) overlays its own entrypoint on
# top of this base.

FROM mcr.microsoft.com/playwright:v1.58.1-noble

# socat: required for any test that needs an in-container "localhost" alias.
# Kept here so MJ-specific overlays don't have to re-install it. Cheap (~1MB).
# unzip: needed to unpack the SqlPackage standalone build (bacpac import path).
RUN apt-get update \
    && apt-get install -y --no-install-recommends socat ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*

# SqlPackage (bacpac import — used by the `import-bacpac` dispatcher subcommand
# and scripts/import-bacpac.cjs). x64 standalone build only; the bacpac
# importer service is pinned to linux/amd64 in the standalone compose, so this
# arch-guard keeps the multi-arch build clean (the arm64 leg simply skips it).
RUN ARCH="$(dpkg --print-architecture)"; \
    if [ "$ARCH" = "amd64" ]; then \
      curl -fsSL -o /tmp/sqlpackage.zip https://aka.ms/sqlpackage-linux \
      && mkdir -p /opt/sqlpackage \
      && unzip -q /tmp/sqlpackage.zip -d /opt/sqlpackage \
      && chmod +x /opt/sqlpackage/sqlpackage \
      && ln -s /opt/sqlpackage/sqlpackage /usr/local/bin/sqlpackage \
      && rm /tmp/sqlpackage.zip; \
    else \
      echo "sqlpackage skipped on $ARCH (bacpac import runs under the amd64 pin)"; \
    fi

WORKDIR /app

# ── Step 1: package manifests for workspace install ─────────────────────────
COPY package.json package-lock.json turbo.json tsconfig.angular.json tsconfig.server.json ./

# ── Step 2: monorepo source (test driver pulls from many packages) ──────────
COPY packages/ ./packages/
COPY metadata/ ./metadata/

# ── Step 3: install + build ─────────────────────────────────────────────────
RUN npm install
RUN npx turbo build --concurrency=2 --filter="@memberjunction*"

# ── Step 4: default MJ config (overlays can replace) ────────────────────────
COPY docker/MJAPI/docker.config.cjs ./mj.config.cjs

# ── Step 4b: regression scripts (target loader, report generators, bacpac
# importer, shared lib). The dispatcher's `run --target` / `import-bacpac` /
# `export` subcommands invoke these from /app/docker/regression/scripts. ──────
COPY docker/regression/scripts/ ./docker/regression/scripts/

# ── Step 5: ComputerUseTestDriver bootstrap (@RegisterClass fires) ──────────
RUN echo "import '@memberjunction/computer-use-engine';" > /app/bootstrap.mjs

# ── Step 6: Bundle the example scaffolds + dispatcher scripts ───────────────
# Examples are how `init <name>` ships starter directories to adopters without
# them having to clone the monorepo. Dispatcher is the entrypoint that routes
# `init|run|exec` subcommands.
COPY docker/regression/examples/ ./examples/
COPY docker/agentic-test-runner/dispatcher.sh /usr/local/bin/agentic-test-runner
COPY docker/agentic-test-runner/init.sh /usr/local/bin/agentic-test-runner-init
RUN chmod +x /usr/local/bin/agentic-test-runner /usr/local/bin/agentic-test-runner-init

# ── Step 7: results dir + volumes ───────────────────────────────────────────
RUN mkdir -p /app/test-results
VOLUME ["/app/test-results"]

# Dispatcher entrypoint — handles `init <name>`, `run`, or `--help`.
# When invoked with no args, defaults to running the MJ Explorer suite for
# parity with the legacy test-runner image.
ENTRYPOINT ["/usr/local/bin/agentic-test-runner"]
CMD ["run"]
