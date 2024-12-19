#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Run migrations
mj migrate

# Run code generation
mj codegen

# Start the MJAPI application
npm run start:api
