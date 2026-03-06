#!/usr/bin/env tsx
import 'dotenv/config';
import { execute } from '@oclif/core';

await execute({ development: true, dir: import.meta.url });
