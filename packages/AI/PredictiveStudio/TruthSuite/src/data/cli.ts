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
  },
});

const setArg = values.set || 'base';
if (setArg !== 'base' && setArg !== 't2' && setArg !== 'n400') {
  console.error(`Invalid --set ${setArg}; expected base | t2 | n400`);
  process.exit(1);
}
const set: SeedSetName = setArg;

const entries = values.only ? CATALOG.filter((e) => e.Code === values.only) : CATALOG;
if (entries.length === 0) {
  console.error(`No dataset matches --only ${values.only}`);
  process.exit(1);
}

const dataRoot = DataCache.Root();
for (const entry of entries) {
  const t0 = performance.now();
  const seeds = DatasetSeeds.SeedSet(entry.Kind, entry.Code, set);
  for (const seed of seeds) {
    await DatasetCatalog.EnsureGenerated(entry, seed, dataRoot);
  }
  const sec = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(`${entry.Kind}/${entry.Code}: ${seeds.length} seed(s) in ${sec}s`);
}
