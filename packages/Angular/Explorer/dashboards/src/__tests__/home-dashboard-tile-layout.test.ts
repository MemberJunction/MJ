import { describe, it, expect } from 'vitest';
import {
  BuildHomeDashboardTileLayout,
  ClampTileBodyHeight,
  ClampTileWidths,
  DefaultTileBodyHeight,
  EmptyHomeDashboardTileSizes,
  EqualTileWidths,
  HomeDashboardTileColumns,
  HomeDashboardTileRows,
  HomeDashboardTileSizes,
  MoveTileGutter,
  NormalizeTileWidths,
  ParseHomeDashboardTileSizes,
  RowBodyHeight,
  RowTileWidths,
  SerializeHomeDashboardTileSizes,
  TILE_CONTENT_SCALE,
  WithRowHeight,
  WithRowWidths,
} from '../Home/home-dashboard-tile-layout';

/** Sizes with the given rows. */
const sizes = (...rows: HomeDashboardTileSizes['Rows']): HomeDashboardTileSizes => ({ Version: 1, Rows: rows });

/** Each value rounded to 4 decimals, so float shares compare cleanly. */
const round4 = (values: number[]): number[] => values.map(v => Math.round(v * 10000) / 10000);

describe('TILE_CONTENT_SCALE', () => {
  it('shows a tile dashboard at 80%, laid out in a box 125% of the tile body', () => {
    expect(TILE_CONTENT_SCALE).toBe(0.8);
    expect(100 / TILE_CONTENT_SCALE).toBe(125);
  });
});

describe('HomeDashboardTileColumns', () => {
  it('is 1 under 640 px, 2 from 640 px and 3 from 1,440 px', () => {
    expect([0, 500, 639, 640, 1100, 1439, 1440, 1600, 4000].map(HomeDashboardTileColumns)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3]);
  });
});

describe('HomeDashboardTileRows', () => {
  const rowsAt = (width: number) => [1, 2, 3].map(count => HomeDashboardTileRows(width, count));

  it('puts every tile in its own row under 640 px (500 px)', () => {
    expect(rowsAt(500)).toEqual([[[0]], [[0], [1]], [[0], [1], [2]]]);
  });

  it('puts two tiles side by side from 640 px, and a lone third tile in its own row (700 px and 1,100 px)', () => {
    const expected = [[[0]], [[0, 1]], [[0, 1], [2]]];
    expect(rowsAt(700)).toEqual(expected);
    expect(rowsAt(1100)).toEqual(expected);
  });

  it('puts three tiles side by side from 1,440 px, never more columns than tiles (1,600 px)', () => {
    expect(rowsAt(1600)).toEqual([[[0]], [[0, 1]], [[0, 1, 2]]]);
  });

  it('switches exactly at 640 px and 1,440 px', () => {
    expect(HomeDashboardTileRows(639, 3)).toEqual([[0], [1], [2]]);
    expect(HomeDashboardTileRows(640, 3)).toEqual([[0, 1], [2]]);
    expect(HomeDashboardTileRows(1439, 3)).toEqual([[0, 1], [2]]);
    expect(HomeDashboardTileRows(1440, 3)).toEqual([[0, 1, 2]]);
  });

  it('has no rows without tiles', () => {
    expect(HomeDashboardTileRows(1600, 0)).toEqual([]);
  });
});

describe('row heights', () => {
  it('defaults to 360 px, or 300 px in one-column mode (under 640 px)', () => {
    expect([0, 500, 639, 640, 1100, 1600].map(DefaultTileBodyHeight)).toEqual([300, 300, 300, 360, 360, 360]);
  });

  it('clamps a height to 240-900 px, in whole px', () => {
    expect([100, 239.4, 240, 420.4, 420.6, 900, 901, 2000].map(ClampTileBodyHeight)).toEqual([240, 240, 240, 420, 421, 900, 900, 900]);
  });

  it("uses the row's saved height, else the default for the width", () => {
    const saved = sizes({ Height: 480 }, {});
    expect(RowBodyHeight(saved, 0, 1600)).toBe(480);
    expect(RowBodyHeight(saved, 0, 500)).toBe(480);
    expect(RowBodyHeight(saved, 1, 1600)).toBe(360);
    expect(RowBodyHeight(saved, 1, 500)).toBe(300);
    expect(RowBodyHeight(saved, 2, 1100)).toBe(360);
  });
});

describe('tile widths', () => {
  it('splits a row equally by default', () => {
    expect(EqualTileWidths(1)).toEqual([100]);
    expect(EqualTileWidths(2)).toEqual([50, 50]);
    expect(round4(EqualTileWidths(3))).toEqual([33.3333, 33.3333, 33.3333]);
  });

  it('normalizes shares to add up to 100', () => {
    expect(NormalizeTileWidths([3, 2])).toEqual([60, 40]);
    expect(NormalizeTileWidths([30, 30, 40])).toEqual([30, 30, 40]);
    expect(round4(NormalizeTileWidths([1, 1, 1]))).toEqual([33.3333, 33.3333, 33.3333]);
  });

  it('clamps shares so each tile keeps at least 25% of the row, taking the rest from the wider tiles', () => {
    expect(ClampTileWidths([90, 10])).toEqual([75, 25]);
    expect(ClampTileWidths([80, 10, 10])).toEqual([50, 25, 25]);
    expect(round4(ClampTileWidths([60, 30, 10]))).toEqual([46.875, 28.125, 25]);
    expect(ClampTileWidths([60, 40])).toEqual([60, 40]);
  });

  it('moves a gutter by points of the row, changing only the two tiles beside it, each kept at 25% or more', () => {
    expect(MoveTileGutter([50, 50], 0, 2)).toEqual([52, 48]);
    expect(MoveTileGutter([50, 50], 0, -2)).toEqual([48, 52]);
    expect(MoveTileGutter([74, 26], 0, 2)).toEqual([75, 25]);
    expect(MoveTileGutter([75, 25], 0, 2)).toEqual([75, 25]);
    expect(MoveTileGutter([25, 75], 0, -2)).toEqual([25, 75]);
    expect(MoveTileGutter([40, 30, 30], 1, 2)).toEqual([40, 32, 28]);
    expect(MoveTileGutter([40, 30, 30], 1, 10)).toEqual([40, 35, 25]);
    expect(MoveTileGutter([40, 30, 30], 0, -20)).toEqual([25, 45, 30]);
  });

  it("uses the row's saved shares for its tile count, else equal shares", () => {
    const saved = sizes({ Widths: { '2': [60, 40], '3': [40, 30, 30] } }, { Widths: { '2': [30, 70] } });
    expect(RowTileWidths(saved, 0, 2)).toEqual([60, 40]);
    expect(RowTileWidths(saved, 0, 3)).toEqual([40, 30, 30]);
    expect(RowTileWidths(saved, 1, 2)).toEqual([30, 70]);
    expect(round4(RowTileWidths(saved, 1, 3))).toEqual([33.3333, 33.3333, 33.3333]);
    expect(RowTileWidths(saved, 2, 2)).toEqual([50, 50]);
    expect(RowTileWidths(saved, 0, 1)).toEqual([100]);
  });
});

describe('changing the sizes', () => {
  it('sets a row height in a copy, adding the rows before it', () => {
    const before = EmptyHomeDashboardTileSizes();
    const after = WithRowHeight(before, 1, 480);
    expect(after).toEqual(sizes({}, { Height: 480 }));
    expect(before).toEqual(sizes());
  });

  it("clears a row height and keeps the row's shares", () => {
    const before = sizes({ Height: 480, Widths: { '2': [60, 40] } });
    expect(WithRowHeight(before, 0, null)).toEqual(sizes({ Widths: { '2': [60, 40] } }));
    expect(before).toEqual(sizes({ Height: 480, Widths: { '2': [60, 40] } }));
  });

  it("sets a row's shares for its tile count, keeping the other count's shares and the height", () => {
    const before = sizes({ Height: 420, Widths: { '3': [40, 30, 30] } });
    expect(WithRowWidths(before, 0, 2, [60, 40])).toEqual(sizes({ Height: 420, Widths: { '2': [60, 40], '3': [40, 30, 30] } }));
    expect(before).toEqual(sizes({ Height: 420, Widths: { '3': [40, 30, 30] } }));
  });

  it("clears a row's shares for one tile count, and drops Widths when none are left", () => {
    const before = sizes({ Widths: { '2': [60, 40], '3': [40, 30, 30] } });
    expect(WithRowWidths(before, 0, 2, null)).toEqual(sizes({ Widths: { '3': [40, 30, 30] } }));
    expect(WithRowWidths(WithRowWidths(before, 0, 2, null), 0, 3, null)).toEqual(sizes({}));
  });
});

describe('ParseHomeDashboardTileSizes', () => {
  it('reads a good setting', () => {
    const raw = '{ "Version": 1, "Rows": [ { "Height": 420, "Widths": { "2": [60, 40], "3": [40, 30, 30] } }, { "Height": 300 } ] }';
    expect(ParseHomeDashboardTileSizes(raw)).toEqual(sizes({ Height: 420, Widths: { '2': [60, 40], '3': [40, 30, 30] } }, { Height: 300 }));
  });

  it('gives the defaults for no setting, bad JSON, JSON that is not an object, an old or unknown version, or no rows', () => {
    for (const raw of [undefined, null, '', 'not json', '{', '[1, 2]', '"text"', '42', 'null', '{"Rows":[{"Height":420}]}', '{"Version":2,"Rows":[{"Height":420}]}', '{"Version":"1","Rows":[{"Height":420}]}', '{"Version":1}', '{"Version":1,"Rows":{"Height":420}}']) {
      expect(ParseHomeDashboardTileSizes(raw), String(raw)).toEqual(EmptyHomeDashboardTileSizes());
    }
  });

  it('drops a height out of 240-900 px, or that is not a number, and keeps the rest of the row', () => {
    const raw = JSON.stringify({ Version: 1, Rows: [{ Height: 100, Widths: { 2: [60, 40] } }, { Height: 901 }, { Height: '420' }, { Height: 240 }] });
    expect(ParseHomeDashboardTileSizes(raw)).toEqual(sizes({ Widths: { '2': [60, 40] } }, {}, {}));
  });

  it('rounds a height to whole px', () => {
    expect(ParseHomeDashboardTileSizes('{"Version":1,"Rows":[{"Height":420.6}]}')).toEqual(sizes({ Height: 421 }));
  });

  it('drops shares that do not match their tile count, are not positive numbers, or are for another count, item by item', () => {
    const raw = JSON.stringify({
      Version: 1,
      Rows: [
        { Widths: { 2: [60, 20, 20], 3: [40, 30, 30] } },
        { Widths: { 2: [60, 'x'], 3: [50, 50] } },
        { Widths: { 2: [0, 100], 3: [-10, 50, 60], 4: [25, 25, 25, 25], 1: [100] } },
      ],
    });
    expect(ParseHomeDashboardTileSizes(raw)).toEqual(sizes({ Widths: { '3': [40, 30, 30] } }, {}, {}));
  });

  it('drops shares whose total is not a finite number above zero, and normalizes huge shares without overflow', () => {
    const raw = '{"Version":1,"Rows":[{"Widths":{"2":[1e308,1e308],"3":[40,30,30]}},{"Height":420,"Widths":{"2":[1e308,5]}}]}';
    expect(ParseHomeDashboardTileSizes(raw)).toEqual(sizes({ Widths: { '3': [40, 30, 30] } }, { Height: 420, Widths: { '2': [75, 25] } }));
  });

  it('normalizes shares to 100 and clamps each to 25% or more', () => {
    const raw = JSON.stringify({ Version: 1, Rows: [{ Widths: { 2: [3, 2], 3: [80, 10, 10] } }, { Widths: { 2: [90, 10] } }] });
    expect(ParseHomeDashboardTileSizes(raw)).toEqual(sizes({ Widths: { '2': [60, 40], '3': [50, 25, 25] } }, { Widths: { '2': [75, 25] } }));
  });

  it('reads a row that is not an object as an empty row, and keeps at most three rows', () => {
    const raw = JSON.stringify({ Version: 1, Rows: ['junk', null, { Height: 480 }, { Height: 500 }] });
    expect(ParseHomeDashboardTileSizes(raw)).toEqual(sizes({}, {}, { Height: 480 }));
  });
});

describe('SerializeHomeDashboardTileSizes', () => {
  it('writes the version and the rows, with shares rounded to 2 decimals and no trailing empty rows', () => {
    const value = sizes({ Height: 420, Widths: { '2': [61.23456, 38.76544] } }, {}, {});
    expect(SerializeHomeDashboardTileSizes(value)).toBe('{"Version":1,"Rows":[{"Height":420,"Widths":{"2":[61.23,38.77]}}]}');
  });

  it('writes empty rows for the defaults', () => {
    expect(SerializeHomeDashboardTileSizes(EmptyHomeDashboardTileSizes())).toBe('{"Version":1,"Rows":[]}');
  });

  it('reads back what it writes', () => {
    const value = sizes({ Height: 480, Widths: { '2': [60, 40] } }, { Widths: { '3': [40, 30, 30] } }, { Height: 240 });
    expect(ParseHomeDashboardTileSizes(SerializeHomeDashboardTileSizes(value))).toEqual(value);
  });
});

describe('BuildHomeDashboardTileLayout', () => {
  it('places three tiles in one row at 1,600 px: equal shares, gutters after the first two, the handle after the last', () => {
    const layout = BuildHomeDashboardTileLayout(1600, 3, EmptyHomeDashboardTileSizes());
    expect(layout.Columns).toBe(3);
    expect(layout.Rows).toEqual([[0, 1, 2]]);
    expect(layout.Tiles.map(t => [t.Row, t.Column, t.RowLine, t.RowTileCount, t.BodyHeight])).toEqual([
      [0, 0, 1, 3, 360],
      [0, 1, 1, 3, 360],
      [0, 2, 1, 3, 360],
    ]);
    expect(layout.Tiles.map(t => round4([t.Start, t.Span]))).toEqual([
      [0, 0.3333],
      [0.3333, 0.3333],
      [0.6667, 0.3333],
    ]);
    expect(layout.Tiles.map(t => (t.GutterAfter ? round4([t.GutterAfter.Start, t.GutterAfter.ValueNow, t.GutterAfter.ValueMax]) : null))).toEqual([
      [0.3333, 33, 42],
      [0.6667, 33, 42],
      null,
    ]);
    expect(layout.Tiles.map(t => t.HandleAfter)).toEqual([null, null, { Row: 0, Line: 2, Height: 360 }]);
  });

  it('places three tiles in two rows at 1,100 px, with the saved size of row 0 (60/40 and 480 px)', () => {
    const saved = sizes({ Height: 480, Widths: { '2': [60, 40] } });
    const layout = BuildHomeDashboardTileLayout(1100, 3, saved);
    expect(layout.Rows).toEqual([[0, 1], [2]]);
    expect(layout.Tiles.map(t => [t.Row, t.Column, t.RowLine, t.RowTileCount, t.Start, t.Span, t.BodyHeight])).toEqual([
      [0, 0, 1, 2, 0, 0.6, 480],
      [0, 1, 1, 2, 0.6, 0.4, 480],
      [1, 0, 3, 1, 0, 1, 360],
    ]);
    expect(layout.Tiles[0].GutterAfter).toEqual({ Start: 0.6, ValueNow: 60, ValueMax: 75 });
    expect(layout.Tiles.map(t => t.HandleAfter)).toEqual([null, { Row: 0, Line: 2, Height: 480 }, { Row: 1, Line: 4, Height: 360 }]);
  });

  it('puts each tile in its own row at 500 px, at 300 px by default, with no gutters', () => {
    const layout = BuildHomeDashboardTileLayout(500, 3, sizes({ Height: 480, Widths: { '2': [60, 40] } }));
    expect(layout.Columns).toBe(1);
    expect(layout.Rows).toEqual([[0], [1], [2]]);
    expect(layout.Tiles.map(t => [t.Row, t.RowLine, t.Span, t.BodyHeight, t.GutterAfter])).toEqual([
      [0, 1, 1, 480, null],
      [1, 3, 1, 300, null],
      [2, 5, 1, 300, null],
    ]);
    expect(layout.Tiles.map(t => t.HandleAfter?.Line)).toEqual([2, 4, 6]);
  });

  it('has no tiles without tiles', () => {
    expect(BuildHomeDashboardTileLayout(1600, 0, EmptyHomeDashboardTileSizes()).Tiles).toEqual([]);
  });

  it("uses a row's saved shares only when their count matches the row's tiles, else equal shares", () => {
    // Not from ParseHomeDashboardTileSizes: three shares saved under the count "2".
    const odd = sizes({ Widths: { '2': [50, 30, 20] } });
    expect(RowTileWidths(odd, 0, 2)).toEqual([50, 50]);
    const layout = BuildHomeDashboardTileLayout(1100, 3, odd);
    expect(layout.Tiles).toHaveLength(3);
    expect(layout.Tiles.map(t => [t.Row, t.Span])).toEqual([
      [0, 0.5],
      [0, 0.5],
      [1, 1],
    ]);
  });
});
