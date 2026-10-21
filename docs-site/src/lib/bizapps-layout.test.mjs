import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_DEFAULTS, layoutMap } from './bizapps-layout.mjs';

const edge = (from, to, implied = false) => ({ from, to, implied });

test('layoutMap: one column per layer, nodes stacked without overlap', () => {
  const layout = layoutMap({ layers: [['a'], ['b', 'c', 'd']], edges: [edge('a', 'b'), edge('a', 'c'), edge('a', 'd')] });
  const o = LAYOUT_DEFAULTS;
  assert.equal(layout.width, o.padding * 2 + 2 * o.nodeWidth + o.columnGap);
  const column = layout.nodes.filter((n) => n.layer === 1).sort((x, y) => x.y - y.y);
  for (let i = 1; i < column.length; i++) assert.ok(column[i].y >= column[i - 1].y + o.nodeHeight + o.rowGap - 0.01);
  assert.ok(layout.nodes.every((n) => n.y >= o.padding + o.headerHeight - 0.01));
  assert.ok(layout.nodes.every((n) => n.y + n.height <= layout.height));
});

test('layoutMap: implied edges are not drawn', () => {
  const layout = layoutMap({ layers: [['a'], ['b'], ['c']], edges: [edge('a', 'b'), edge('b', 'c'), edge('a', 'c', true)] });
  assert.deepEqual(layout.edges.map((e) => `${e.from}>${e.to}`), ['a>b', 'b>c']);
});

test('layoutMap: an edge that skips a column runs straight across it', () => {
  const layout = layoutMap({ layers: [['a', 'x'], ['b', 'y'], ['c']], edges: [edge('a', 'b'), edge('b', 'c'), edge('x', 'c'), edge('x', 'y')] });
  const skip = layout.edges.find((e) => e.from === 'x' && e.to === 'c');
  // Out of x, a straight run across column 1, into c: exactly one straight segment.
  assert.equal((skip.d.match(/ L/g) ?? []).length, 1);
  const { nodeWidth, columnGap, padding } = LAYOUT_DEFAULTS;
  const across = skip.d.match(/ L([\d.]+) /);
  assert.equal(Number(across[1]), padding + (nodeWidth + columnGap) + nodeWidth);
});

test('layoutMap: rows are ordered to remove avoidable crossings', () => {
  // Given in the worst order: a->d and b->c cross unless one column is flipped.
  const layout = layoutMap({ layers: [['a', 'b'], ['c', 'd']], edges: [edge('a', 'd'), edge('b', 'c')] });
  assert.equal(layout.crossings, 0);
});

test('layoutMap: deterministic', () => {
  const catalog = { layers: [['a', 'b'], ['c', 'd', 'e']], edges: [edge('a', 'e'), edge('b', 'c'), edge('a', 'd')] };
  assert.deepEqual(layoutMap(catalog), layoutMap(catalog));
});

test('layoutMap: paths leave the source right edge and enter the target left edge', () => {
  const layout = layoutMap({ layers: [['a'], ['b']], edges: [edge('a', 'b')] });
  const [a, b] = ['a', 'b'].map((id) => layout.nodes.find((n) => n.id === id));
  const start = layout.edges[0].d.match(/^M([\d.]+) /);
  const end = layout.edges[0].d.match(/([\d.]+) [\d.]+$/);
  assert.equal(Number(start[1]), a.x + a.width);
  assert.equal(Number(end[1]), b.x);
});
