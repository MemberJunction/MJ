/**
 * Layout for the BizApps dependency map: a layered (Sugiyama-style) drawing,
 * computed at build time so the page ships plain SVG with no layout library.
 *
 *   1. Layers come from the catalog: an app sits one column right of its
 *      highest dependency, so foundations are on the left.
 *   2. An edge that skips a column is routed through an invisible waypoint in
 *      each column it crosses, so it travels between nodes, never through one.
 *   3. Rows are ordered by repeated barycenter sweeps, keeping the ordering
 *      with the fewest crossings.
 *   4. Each column is placed near the middle of its neighbours, then spaced so
 *      nothing overlaps.
 *
 * Pure: catalog in, coordinates and SVG path data out. Only direct (non-implied)
 * edges are drawn; see buildEdges in scripts/lib/bizapps-catalog.mjs.
 */

export const LAYOUT_DEFAULTS = {
  nodeWidth: 172,
  nodeHeight: 52,
  columnGap: 44,
  rowGap: 12,
  waypointHeight: 6,
  padding: 18,
  headerHeight: 34,
  sweeps: 12,
  placementPasses: 4,
};

/**
 * @param {{ layers: string[][], edges: Array<{ from: string, to: string, implied: boolean }> }} catalog
 * @param {Partial<typeof LAYOUT_DEFAULTS>} [options]
 */
export function layoutMap(catalog, options = {}) {
  const o = { ...LAYOUT_DEFAULTS, ...options };
  const layerOf = new Map();
  catalog.layers.forEach((ids, layer) => ids.forEach((id) => layerOf.set(id, layer)));
  const edges = catalog.edges.filter((e) => !e.implied && layerOf.has(e.from) && layerOf.has(e.to));

  const { columns, links, chains } = buildLayeredGraph(catalog.layers, edges, layerOf);
  orderColumns(columns, links, o.sweeps);
  const height = placeColumns(columns, links, o);

  const columnX = (layer) => o.padding + layer * (o.nodeWidth + o.columnGap);
  const nodes = [];
  const slotById = new Map();
  columns.forEach((column, layer) => {
    for (const slot of column) {
      slot.x = columnX(layer);
      slotById.set(slot.key, slot);
      if (!slot.waypoint) nodes.push({ id: slot.key, layer, x: slot.x, y: slot.y, width: o.nodeWidth, height: o.nodeHeight });
    }
  });

  return {
    width: o.padding * 2 + columns.length * o.nodeWidth + Math.max(0, columns.length - 1) * o.columnGap,
    height,
    columns: columns.map((_, layer) => ({ layer, x: columnX(layer), width: o.nodeWidth })),
    nodes,
    edges: chains.map((chain) => ({ from: chain.from, to: chain.to, d: edgePath(chain.keys.map((k) => slotById.get(k)), o) })),
    crossings: totalCrossings(columns, links),
  };
}

/** Columns of slots (real nodes and waypoints) plus the links between adjacent columns. */
function buildLayeredGraph(layers, edges, layerOf) {
  const columns = layers.map((ids) => ids.map((id) => ({ key: id, waypoint: false })));
  const links = [];
  const chains = [];
  for (const edge of edges) {
    const start = layerOf.get(edge.from);
    const end = layerOf.get(edge.to);
    const keys = [edge.from];
    for (let layer = start + 1; layer < end; layer++) {
      const key = `${edge.from}->${edge.to}@${layer}`;
      columns[layer].push({ key, waypoint: true });
      keys.push(key);
    }
    keys.push(edge.to);
    for (let i = 0; i + 1 < keys.length; i++) links.push({ from: keys[i], to: keys[i + 1] });
    chains.push({ from: edge.from, to: edge.to, keys });
  }
  return { columns, links, chains };
}

/** Barycenter sweeps, down then up, keeping the ordering with the fewest crossings. */
function orderColumns(columns, links, sweeps) {
  const preds = groupBy(links, 'to', 'from');
  const succs = groupBy(links, 'from', 'to');
  let best = snapshot(columns);
  let bestCrossings = totalCrossings(columns, links);
  for (let sweep = 0; sweep < sweeps && bestCrossings > 0; sweep++) {
    const down = sweep % 2 === 0;
    const range = down ? [...columns.keys()].slice(1) : [...columns.keys()].slice(0, -1).reverse();
    for (const layer of range) {
      const neighbours = down ? preds : succs;
      const reference = indexOf(columns[down ? layer - 1 : layer + 1]);
      sortByBarycenter(columns[layer], neighbours, reference);
    }
    const crossings = totalCrossings(columns, links);
    if (crossings < bestCrossings) {
      bestCrossings = crossings;
      best = snapshot(columns);
    }
  }
  best.forEach((column, layer) => columns[layer].splice(0, columns[layer].length, ...column));
}

function sortByBarycenter(column, neighbours, reference) {
  const keyed = column.map((slot, index) => {
    const positions = (neighbours.get(slot.key) ?? []).map((k) => reference.get(k)).filter((p) => p !== undefined);
    const barycenter = positions.length > 0 ? positions.reduce((a, b) => a + b, 0) / positions.length : index;
    return { slot, barycenter, index };
  });
  keyed.sort((a, b) => a.barycenter - b.barycenter || a.index - b.index);
  column.splice(0, column.length, ...keyed.map((k) => k.slot));
}

/** Crossings between each pair of adjacent columns: count inverted link pairs. */
function totalCrossings(columns, links) {
  const position = new Map();
  const layerOfKey = new Map();
  columns.forEach((column, layer) => column.forEach((slot, index) => {
    position.set(slot.key, index);
    layerOfKey.set(slot.key, layer);
  }));
  const byLayer = new Map();
  for (const link of links) {
    const layer = layerOfKey.get(link.from);
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer).push([position.get(link.from), position.get(link.to)]);
  }
  let crossings = 0;
  for (const pairs of byLayer.values()) {
    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        const [a1, b1] = pairs[i];
        const [a2, b2] = pairs[j];
        if ((a1 - a2) * (b1 - b2) < 0) crossings++;
      }
    }
  }
  return crossings;
}

/**
 * Vertical placement. The tallest column is stacked first; every other column
 * is pulled toward the centres of its neighbours in the column already placed,
 * then pushed apart so slots keep their order and never overlap.
 * Returns the drawing's total height.
 */
function placeColumns(columns, links, o) {
  const heightOf = (slot) => (slot.waypoint ? o.waypointHeight : o.nodeHeight);
  const stackHeight = (column) => column.reduce((sum, slot) => sum + heightOf(slot), 0) + Math.max(0, column.length - 1) * o.rowGap;
  const anchor = columns.reduce((best, column, layer) => (stackHeight(column) > stackHeight(columns[best]) ? layer : best), 0);
  const tallest = stackHeight(columns[anchor]);

  // Start every column stacked and centred, so a column with no neighbours still has a home.
  for (const column of columns) {
    let y = (tallest - stackHeight(column)) / 2;
    for (const slot of column) {
      slot.y = y;
      y += heightOf(slot) + o.rowGap;
    }
  }

  const preds = groupBy(links, 'to', 'from');
  const succs = groupBy(links, 'from', 'to');
  const centreOf = new Map();
  const refresh = () => columns.forEach((column) => column.forEach((slot) => centreOf.set(slot.key, slot.y + heightOf(slot) / 2)));
  for (let pass = 0; pass < o.placementPasses; pass++) {
    refresh();
    for (let layer = anchor + 1; layer < columns.length; layer++) {
      settle(columns[layer], preds, centreOf, heightOf, o.rowGap);
      refresh();
    }
    for (let layer = anchor - 1; layer >= 0; layer--) {
      settle(columns[layer], succs, centreOf, heightOf, o.rowGap);
      refresh();
    }
  }

  const top = Math.min(...columns.flat().map((slot) => slot.y));
  const offset = o.padding + o.headerHeight - top;
  let bottom = 0;
  for (const slot of columns.flat()) {
    slot.y += offset;
    bottom = Math.max(bottom, slot.y + heightOf(slot));
  }
  return bottom + o.padding;
}

/** Move each slot toward the mean centre of its neighbours, keep order, remove overlaps. */
function settle(column, neighbours, centreOf, heightOf, gap) {
  const desired = column.map((slot) => {
    const centres = (neighbours.get(slot.key) ?? []).map((k) => centreOf.get(k)).filter((c) => c !== undefined);
    const centre = centres.length > 0 ? centres.reduce((a, b) => a + b, 0) / centres.length : slot.y + heightOf(slot) / 2;
    return centre - heightOf(slot) / 2;
  });
  // Forward pass: never above the slot before it.
  let floor = -Infinity;
  const placed = desired.map((y, i) => {
    const top = Math.max(y, floor);
    floor = top + heightOf(column[i]) + gap;
    return top;
  });
  // Recentre the whole column on its targets: a uniform shift keeps the spacing.
  const drift = placed.reduce((sum, y, i) => sum + (y - desired[i]), 0) / placed.length;
  column.forEach((slot, i) => { slot.y = placed[i] - drift; });
}

/**
 * Left-to-right path through a chain of slots: out of the source's right edge,
 * straight across each waypoint's column, into the target's left edge, with
 * horizontal tangents at every joint so the curve reads as flowing rightward.
 */
function edgePath(slots, o) {
  const points = [];
  slots.forEach((slot, i) => {
    const cy = slot.y + (slot.waypoint ? o.waypointHeight : o.nodeHeight) / 2;
    if (i === 0) points.push([slot.x + o.nodeWidth, cy]);
    else if (i === slots.length - 1) points.push([slot.x, cy]);
    else points.push([slot.x, cy], [slot.x + o.nodeWidth, cy]);
  });
  let d = `M${fmt(points[0][0])} ${fmt(points[0][1])}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    // Within a few pixels is "level": a tiny S-bend reads as a rendering glitch, not a curve.
    if (Math.abs(y0 - y1) < 4) {
      d += ` L${fmt(x1)} ${fmt(y1)}`;
    } else {
      const bend = (x1 - x0) / 2;
      d += ` C${fmt(x0 + bend)} ${fmt(y0)} ${fmt(x1 - bend)} ${fmt(y1)} ${fmt(x1)} ${fmt(y1)}`;
    }
  }
  return d;
}

function fmt(n) {
  return Number(n.toFixed(1)).toString();
}

function groupBy(links, keyField, valueField) {
  const map = new Map();
  for (const link of links) {
    if (!map.has(link[keyField])) map.set(link[keyField], []);
    map.get(link[keyField]).push(link[valueField]);
  }
  return map;
}

function indexOf(column) {
  return new Map(column.map((slot, index) => [slot.key, index]));
}

function snapshot(columns) {
  return columns.map((column) => [...column]);
}
