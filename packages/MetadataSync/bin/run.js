#!/usr/bin/env node
require('dotenv').config()
;(async () => {
  const oclif = await import('@oclif/core')
  await oclif.execute({development: false, dir: __dirname})
})()