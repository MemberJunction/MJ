#!/bin/bash
export DOTENV_CONFIG_PATH=/Users/madhavsubramaniyam/Projects/MJ/MJ-unified/.env
export DB_TRUST_SERVER_CERTIFICATE=1
cd /Users/madhavsubramaniyam/Projects/MJ/MJ-unified/packages/MJAPI
exec node --experimental-specifier-resolution=node --import ./register.js -r dotenv/config ./src/index.ts
