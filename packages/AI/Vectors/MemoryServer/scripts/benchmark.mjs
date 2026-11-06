#!/usr/bin/env node
/**
 * Before/after benchmark for in-memory vector search on a server.
 *
 * Compares, on random embeddings:
 *   - in-process JS (what every process got before this package existed)
 *   - FindNearest   with the server accelerator (native SIMD on the calling thread)
 *   - FindNearestAsync with the server accelerator (worker pool, native in the worker)
 *
 * and, for concurrent load, how long the event loop is blocked — the number that decides
 * whether one slow vector search delays every other request on the process.
 *
 * Usage (after `pnpm run build` in this package and in ../Memory):
 *   node scripts/benchmark.mjs [rows=20000] [dims=1536] [concurrent=32]
 */
import { BaseVectorAccelerator, SimpleVectorService } from '@memberjunction/ai-vectors-memory';
import { VectorWorkerPool } from '../dist/index.js';

const [rows = 20000, dims = 1536, concurrent = 32] = process.argv.slice(2).map(Number);

function randomVector() {
  const v = new Array(dims);
  for (let i = 0; i < dims; i++) v[i] = Math.random() * 2 - 1;
  return v;
}

function build(accelerator) {
  const service = new SimpleVectorService({ Precision: 'float32', Accelerator: accelerator });
  service.ReserveCapacity(rows, dims);
  for (let i = 0; i < rows; i++) service.AddVector(`k${i}`, randomVector(), { group: i % 8 });
  return service;
}

async function timeIt(fn, runs = 10) {
  await fn();
  const start = performance.now();
  for (let i = 0; i < runs; i++) await fn();
  return (performance.now() - start) / runs;
}

/**
 * Runs `concurrent` searches at once; reports wall time and the longest event-loop stall,
 * measured as the largest gap between ticks of a 1 ms interval timer — the delay any other
 * request on the process would have seen.
 */
async function underLoad(fn) {
  let last = performance.now();
  let maxStall = 0;
  const probe = setInterval(() => {
    const now = performance.now();
    maxStall = Math.max(maxStall, now - last);
    last = now;
  }, 1);
  await new Promise(resolve => setTimeout(resolve, 20)); // let the probe settle
  last = performance.now();
  const start = performance.now();
  await Promise.all(Array.from({ length: concurrent }, () => fn()));
  const wall = performance.now() - start;
  await new Promise(resolve => setTimeout(resolve, 20)); // let the probe observe a final stall
  clearInterval(probe);
  return { wall, maxStall };
}

const fmt = (ms) => `${ms.toFixed(1)} ms`;
const query = randomVector();
const filter = (m) => m.group === 3;

const inProcess = build(new BaseVectorAccelerator());
const accelerated = build(undefined); // resolves the registered server accelerator

console.log(`rows=${rows} dims=${dims} (float32), concurrency=${concurrent}\n`);
console.log('Single search latency (top 10)');
console.log(`  in-process JS                 ${fmt(await timeIt(() => inProcess.FindNearest(query, 10)))}`);
console.log(`  FindNearest  (native, sync)   ${fmt(await timeIt(() => accelerated.FindNearest(query, 10)))}`);
console.log(`  FindNearestAsync (worker)     ${fmt(await timeIt(() => accelerated.FindNearestAsync(query, 10)))}`);
console.log(`  filtered, in-process JS       ${fmt(await timeIt(() => inProcess.FindNearest(query, 10, undefined, 'cosine', filter)))}`);
console.log(`  filtered, FindNearestAsync    ${fmt(await timeIt(() => accelerated.FindNearestAsync(query, 10, undefined, 'cosine', filter)))}`);

console.log(`\n${concurrent} concurrent searches — wall time / longest event-loop stall`);
const before = await underLoad(async () => inProcess.FindNearest(query, 10));
console.log(`  in-process JS                 ${fmt(before.wall)} / ${fmt(before.maxStall)}`);
const sync = await underLoad(async () => accelerated.FindNearest(query, 10));
console.log(`  FindNearest  (native, sync)   ${fmt(sync.wall)} / ${fmt(sync.maxStall)}`);
const after = await underLoad(() => accelerated.FindNearestAsync(query, 10));
console.log(`  FindNearestAsync (worker)     ${fmt(after.wall)} / ${fmt(after.maxStall)}`);

await VectorWorkerPool.Instance.Shutdown();
