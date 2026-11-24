#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Start the ssh service in the background for troubleshooting.
# SECURITY: sshd + the fixed "root:Docker!" password is Azure App Service's documented
# convention for reaching a custom container via the portal (App Service fronts port 2222
# and never exposes it publicly). Outside App Service that same daemon is a remote root
# shell for anyone who can reach port 2222, so only start it when we are actually on App
# Service (WEBSITE_INSTANCE_ID is injected by the platform) or when explicitly opted in.
# The root password is set here, inside the same gate, rather than baked into the image —
# the published image carries no usable root password unless sshd is actually started.
if [ -n "${WEBSITE_INSTANCE_ID:-}" ]; then
  # App Service's SSH feature requires exactly root:Docker! (platform-documented).
  echo "root:Docker!" | chpasswd
  /usr/sbin/sshd -D &
elif [ "${ENABLE_SSH:-}" = "true" ]; then
  # Outside App Service the "Docker!" password would be a universal, documented root
  # credential on every deployment that maps port 2222. Set a custom or random one-time
  # password before sshd starts.
  if [ -n "${SSH_ROOT_PASSWORD:-}" ]; then
    echo "root:${SSH_ROOT_PASSWORD}" | chpasswd
  else
    GENERATED_SSH_PW=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)
    echo "root:${GENERATED_SSH_PW}" | chpasswd
    echo "[entrypoint] ENABLE_SSH=true outside Azure App Service: root SSH password set to a one-time random value: ${GENERATED_SSH_PW}"
    echo "[entrypoint] Set SSH_ROOT_PASSWORD to choose it yourself, and keep port 2222 off public interfaces."
    unset GENERATED_SSH_PW
  fi
  /usr/sbin/sshd -D &
fi

cd /app

# Run migrations with the --tag parameter
mj migrate

# Run code generation
mj codegen

# Start the MJAPI application
pm2-runtime packages/MJAPI/dist/index.js
