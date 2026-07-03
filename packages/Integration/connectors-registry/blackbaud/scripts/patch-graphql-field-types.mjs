#!/usr/bin/env node
// Post-codegen patcher: connector sync-entity GraphQL resolvers live in MJAPI's tsx-compiled
// src/generated/generated.ts. esbuild/tsx does NOT emit `design:type` decorator metadata, so a bare
// `@Field()` / `@Field({nullable:true})` can't be inferred by TypeGraphQL → NoExplicitTypeError. Core
// entities avoid this by loading from tsc-BUILT packages. This adds the explicit `() => Type` to every
// bare @Field based on the property's TS type (handles `@Field()`, `@Field({...})`, and property forms
// `x: T;` / `x?: T;` / `x: T | null;`).
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = process.argv[2] || 'packages/MJAPI/src/generated/generated.ts';
const lines = readFileSync(FILE, 'utf-8').split('\n');
const TS_TO_GQL = { string: 'String', Date: 'Date', number: 'Number', boolean: 'Boolean' };
let patched = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const isFieldDecorator = /@Field\(/.test(line);
  const alreadyTyped = /@Field\(\(\)\s*=>/.test(line);
  if (!isFieldDecorator || alreadyTyped) continue;
  // find the property declaration (skip stacked decorators + blank lines)
  let gql = null;
  for (let j = i + 1; j < Math.min(i + 7, lines.length); j++) {
    const s = lines[j].trim();
    if (!s || s.startsWith('@')) continue;
    const m = s.match(/^[A-Za-z_$][\w$]*\??:\s*([A-Za-z_$][\w$]*)/);
    if (m) gql = TS_TO_GQL[m[1]] ?? 'String';
    break;
  }
  if (!gql) continue;
  if (/@Field\(\{/.test(line)) {
    lines[i] = line.replace(/@Field\(\{/, `@Field(() => ${gql}, {`);
    patched++;
  } else if (/@Field\(\s*\)/.test(line)) {
    lines[i] = line.replace(/@Field\(\s*\)/, `@Field(() => ${gql})`);
    patched++;
  }
}

writeFileSync(FILE, lines.join('\n'));
process.stdout.write(JSON.stringify({ file: FILE, patched }) + '\n');
