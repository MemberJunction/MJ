#!/usr/bin/env node

// Load environment variables from .env file in current working directory
require('dotenv').config()

// Load AI providers to prevent tree shaking
const { LoadAIProviders } = require('@memberjunction/ai-provider-bundle');
LoadAIProviders();

const oclif = require('@oclif/core')

oclif.run().then(oclif.flush).catch(oclif.Errors.handle)
