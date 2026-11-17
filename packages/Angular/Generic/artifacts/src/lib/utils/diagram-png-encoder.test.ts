import { describe, it, expect } from 'vitest';
import type { DocumentBlockExecutionResult, DocumentBlockSpec } from '@memberjunction/core-entities';
import { RasterizeBlockDiagramToPng } from './diagram-png-encoder';

function decodePngHeader(pngBytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
  expect(pngBytes[0]).toBe(0x89);
  expect(pngBytes[1]).toBe(0x50);
  expect(pngBytes[2]).toBe(0x4e);
  expect(pngBytes[3]).toBe(0x47);
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
  };
}

describe('diagram-png-encoder', () => {
  it('renders distinct PNG pixels from real Chart dataset values rather than hardcoded dummy bars', () => {
    const lowBlock: DocumentBlockSpec = {
      BlockID: 'blk-chart-1',
      Kind: 'EntityView',
      DisplayMode: 'chart',
      Mode: 'Live',
      ChartType: 'bar',
      Parameters: {
        LabelColumn: 'Quarter',
        ValueColumns: ['Revenue'],
      },
    };
    const lowResult: DocumentBlockExecutionResult = {
      BlockID: 'blk-chart-1',
      Kind: 'EntityView',
      Success: true,
      Mode: 'Live',
      Columns: [{ Name: 'Quarter', DisplayName: 'Quarter', Type: 'string' }, { Name: 'Revenue', DisplayName: 'Revenue', Type: 'number' }],
      Rows: [
        { Quarter: 'Q1', Revenue: 10 },
        { Quarter: 'Q2', Revenue: 10 },
        { Quarter: 'Q3', Revenue: 10 },
      ],
      TotalRowCount: 3,
    };
    const highResult: DocumentBlockExecutionResult = {
      BlockID: 'blk-chart-1',
      Kind: 'EntityView',
      Success: true,
      Mode: 'Live',
      Columns: [{ Name: 'Quarter', DisplayName: 'Quarter', Type: 'string' }, { Name: 'Revenue', DisplayName: 'Revenue', Type: 'number' }],
      Rows: [
        { Quarter: 'Q1', Revenue: 100 },
        { Quarter: 'Q2', Revenue: 20 },
        { Quarter: 'Q3', Revenue: 95 },
      ],
      TotalRowCount: 3,
    };

    const pngA = RasterizeBlockDiagramToPng(lowBlock, undefined, lowResult);
    const pngB = RasterizeBlockDiagramToPng(lowBlock, undefined, highResult);

    expect(decodePngHeader(pngA)).toEqual({ width: 320, height: 160 });
    expect(decodePngHeader(pngB)).toEqual({ width: 320, height: 160 });
    expect(Buffer.from(pngA).equals(Buffer.from(pngB))).toBe(false);
  });

  it('supports line, area, and pie charts plus negative values cleanly', () => {
    const result: DocumentBlockExecutionResult = {
      BlockID: 'blk-multi',
      Kind: 'EntityView',
      Success: true,
      Mode: 'Live',
      Columns: [
        { Name: 'Month', DisplayName: 'Month', Type: 'string' },
        { Name: 'Net', DisplayName: 'Net', Type: 'number' },
        { Name: 'Target', DisplayName: 'Target', Type: 'number' },
      ],
      Rows: [
        { Month: 'Jan', Net: -15, Target: 20 },
        { Month: 'Feb', Net: 40, Target: 30 },
        { Month: 'Mar', Net: -5, Target: 40 },
        { Month: 'Apr', Net: 70, Target: 50 },
      ],
      TotalRowCount: 4,
    };

    for (const chartType of ['line', 'area', 'pie'] as const) {
      const png = RasterizeBlockDiagramToPng(
        {
          BlockID: `blk-${chartType}`,
          Kind: 'EntityView',
          DisplayMode: 'chart',
          Mode: 'Live',
          ChartType: chartType,
          Parameters: {
            LabelColumn: 'Month',
            ValueColumns: ['Net', 'Target'],
          },
        },
        undefined,
        result,
      );
      expect(decodePngHeader(png)).toEqual({ width: 320, height: 160 });
      expect(png.byteLength).toBeGreaterThan(200);
    }
  });

  it('renders actual Whiteboard JSON elements and reflects element positions rather than a 3-box stub', () => {
    const baseBlock: DocumentBlockSpec = {
      BlockID: 'blk-wb-1',
      Kind: 'Artifact',
      Mode: 'Frozen',
      ArtifactType: 'Whiteboard',
    };
    const wb1: DocumentBlockExecutionResult = {
      BlockID: 'blk-wb-1',
      Kind: 'Artifact',
      Success: true,
      Mode: 'Live',
      Columns: [],
      Rows: [],
      TotalRowCount: 0,
      ArtifactContent: JSON.stringify({
        Pages: [
          {
            PageID: 'p1',
            Items: [
              { ID: 'n1', Kind: 'shape', X: 10, Y: 10, Width: 100, Height: 60 },
              { ID: 'n2', Kind: 'shape', X: 400, Y: 200, Width: 120, Height: 80 },
            ],
          },
        ],
      }),
    };
    const wb2: DocumentBlockExecutionResult = {
      BlockID: 'blk-wb-1',
      Kind: 'Artifact',
      Success: true,
      Mode: 'Live',
      Columns: [],
      Rows: [],
      TotalRowCount: 0,
      ArtifactContent: JSON.stringify({
        Pages: [
          {
            PageID: 'p1',
            Items: [{ ID: 'n1', Kind: 'shape', X: 300, Y: 10, Width: 140, Height: 120 }],
          },
        ],
      }),
    };

    const png1 = RasterizeBlockDiagramToPng(baseBlock, undefined, wb1);
    const png2 = RasterizeBlockDiagramToPng(baseBlock, undefined, wb2);

    expect(decodePngHeader(png1)).toEqual({ width: 320, height: 160 });
    expect(Buffer.from(png1).equals(Buffer.from(png2))).toBe(false);
  });

  it('falls back to FrozenSnapshot rows when no liveResult is passed', () => {
    const frozenChart: DocumentBlockSpec = {
      BlockID: 'blk-frozen-chart',
      Kind: 'EntityView',
      DisplayMode: 'chart',
      Mode: 'Frozen',
      ChartType: 'bar',
      Parameters: {
        LabelColumn: 'Stage',
        ValueColumns: ['Amount'],
      },
      FrozenSnapshot: {
        FrozenAt: '2026-11-10T00:00:00.000Z',
        FrozenByUserID: 'u-1',
        FrozenByUserName: 'Admin',
        SecurityWarningAcknowledged: true,
        Columns: [{ Name: 'Stage', DisplayName: 'Stage', Type: 'string' }, { Name: 'Amount', DisplayName: 'Amount', Type: 'number' }],
        Rows: [
          { Stage: 'Open', Amount: 10 },
          { Stage: 'Won', Amount: 120 },
        ],
        TotalRowCount: 2,
      },
    };
    const emptyChart: DocumentBlockSpec = {
      BlockID: 'blk-empty-chart',
      Kind: 'EntityView',
      DisplayMode: 'chart',
      Mode: 'Live',
      ChartType: 'bar',
    };

    const withRows = RasterizeBlockDiagramToPng(frozenChart);
    const withoutRows = RasterizeBlockDiagramToPng(emptyChart);

    expect(Buffer.from(withRows).equals(Buffer.from(withoutRows))).toBe(false);
  });
});
