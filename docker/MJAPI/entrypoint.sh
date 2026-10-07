#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Start the ssh service in the background for troubleshooting.
# SECURITY: sshd + the fixed "root:Docker!" password is Azure App Service's documented
# convention for reaching a custom container via the portal (App Service fronts port 2222
# and never exposes it publicly). Outside App Service that same daemon is a remote root
# shell for anyone who can reach port 2222, so only start it when we are actually on App
# Service (WEBSITE_INSTANCE_ID is injected by the platform) or when explicitly opted in.
if [ -n "${WEBSITE_INSTANCE_ID:-}" ] || [ "${ENABLE_SSH:-}" = "true" ]; then
  /usr/sbin/sshd -D &
fi

cd /app

# Run migrations with the --tag parameter
mj migrate

# Run code generation
mj codegen

# Start the MJAPI application
pm2-runtime packages/MJAPI/dist/index.js
