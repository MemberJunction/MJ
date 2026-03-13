#!/usr/bin/env node
import 'dotenv/config';
import '@memberjunction/server-bootstrap/mj-class-registrations';
import { execute } from '@oclif/core';

await execute({ dir: import.meta.url });
