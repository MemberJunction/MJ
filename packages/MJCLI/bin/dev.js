#!/usr/bin/env node_modules/.bin/ts-node
require('dotenv').config()
;(async () => {
  const oclif = await import('@oclif/core')
  await oclif.execute({ development: true, dir: __dirname })
})()
