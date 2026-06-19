#!/bin/bash
export DOTENV_CONFIG_PATH=/Users/madhavsubramaniyam/Projects/MJ/MJ-unified/packages/Integration/connectors/test/logs/.env.pg
cd /Users/madhavsubramaniyam/Projects/MJ/MJ-unified/packages/MJAPI
exec node --experimental-specifier-resolution=node --import ./register.js -r dotenv/config ./src/index.ts
