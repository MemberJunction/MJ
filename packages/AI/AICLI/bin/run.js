#!/usr/bin/env node

const oclif = require('@oclif/core')

oclif.run().then(oclif.flush).catch(oclif.Errors.handle)