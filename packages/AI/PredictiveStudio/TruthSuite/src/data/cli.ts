import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { DataCache } from './cache';
import { CATALOG, DatasetCatalog } from './catalog';
import { DatasetSeeds, type SeedSetName } from './seeds';

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const { values } = parseArgs({
  args,
  options: {
    set: { type: 'string' },
    only: { type: 'string' },
    stream: { type: 'boolean' },
  },
});

const set = (values.set || 'base') as SeedSetName;
if (set !== 'base' && set !== 't2' && set !== 'n400') {
  console.error(`Invalid --set ${set}; expected base | t2 | n400`);
  process.exit(1);
}

const entries = values.only ? CATALOG.filter((e) => e.Code === values.only) : CATALOG;
if (entries.length === 0) {
  console.error(`No dataset matches --only ${values.only}`);
  process.exit(1);
}

const dataRoot = DataCache.Root();
for (const entry of entries) {
  const t0 = performance.now();
  const seeds = DatasetSeeds.SeedSet(entry.Kind, entry.Code, set);
  const specHash = DatasetCatalog.EntrySpecHash(entry);
  const hashDir = path.join(dataRoot, entry.Kind, entry.Code, specHash.slice(0, 12));
  mkdirSync(hashDir, { recursive: true });
  const n400File = path.join(hashDir, 'n400.sha256');
  if (values.stream) rmSync(n400File, { force: true });

  for (const seed of seeds) {
    const dir = await DatasetCatalog.EnsureGenerated(entry, seed, dataRoot);
    if (values.stream) {
      const rowsSha = createHash('sha256').update(readFileSync(path.join(dir, 'rows.csv'))).digest('hex');
      const truthSha = createHash('sha256').update(readFileSync(path.join(dir, 'truth.csv'))).digest('hex');
      appendFileSync(n400File, `seed-${seed} rows=${rowsSha} truth=${truthSha}\n`);
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const sec = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(`${entry.Kind}/${entry.Code}: ${seeds.length} seed(s) in ${sec}s`);
}
