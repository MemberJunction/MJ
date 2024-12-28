#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Start the ssh service in the background for troubleshooting
/usr/sbin/sshd -D &

cd /app

# Run migrations with the --tag parameter
mj migrate

# Run code generation
mj codegen

# Start the MJAPI application
pm2-runtime packages/MJAPI/dist/index.js
