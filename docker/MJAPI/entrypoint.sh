#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

cd /app

# Run migrations with the --tag parameter
mj migrate

# Run code generation
mj codegen

# Start the MJAPI application
node packages/MJAPI/dist/index.js
