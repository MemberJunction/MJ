import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ArtifactMetadataEngine } from '@memberjunction/core-entities';
import { toCanvas } from 'html-to-image';
import {
  CaptureRenderedElementThumbnail,
  CaptureThumbnailForDriverIfAllowed,
  SerializeSvgToDataUrl,
} from './artifact-dom-capture';

vi.mock('html-to-image', () => ({
  toCanvas: vi.fn(),
}));

function makeFakeCanvas(dataUrl: string): HTMLCanvasElement {
  return {
    toDataURL: (mime: string) => (mime === 'image/webp' ? dataUrl : dataUrl),
  } as unknown as HTMLCanvasElement;
}

describe('artifact-dom-capture (DOM & Privacy Masking)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('masks .mj-docs-live-block bodies during rasterization and restores original DOM afterward', async () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(root, 'clientHeight', { value: 600, configurable: true });
    document.body.appendChild(root);

    const liveBlock = document.createElement('div');
    liveBlock.className = 'mj-docs-live-block';
    const body = document.createElement('div');
    body.className = 'mj-docs-live-block__body';
    const row = document.createElement('div');
    row.textContent = 'CONFIDENTIAL SALARY $999,000';
    body.appendChild(row);
    liveBlock.appendChild(body);
    root.appendChild(liveBlock);

    let sawMaskDuringCapture = false;
    let rowHiddenDuringCapture = false;
    const validWebp = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';

    vi.mocked(toCanvas).mockImplementation(async (el) => {
      const mask = (el as HTMLElement).querySelector('[data-mj-thumb-mask="true"]');
      sawMaskDuringCapture = Boolean(mask && mask.textContent?.includes('Live MJ Data'));
      rowHiddenDuringCapture = row.style.visibility === 'hidden';
      return makeFakeCanvas(validWebp);
    });

    const result = await CaptureRenderedElementThumbnail(root, { MaskLiveDataBlocks: true });
    expect(result).toBe(validWebp);
    expect(sawMaskDuringCapture).toBe(true);
    expect(rowHiddenDuringCapture).toBe(true);
    expect(root.querySelector('[data-mj-thumb-mask="true"]')).toBeNull();
    expect(row.style.visibility).toBe('');

    root.remove();
  });

  it('skips rasterization completely when policy resolves to Structural or Icon', async () => {
    const mockTypes = [
      {
        ID: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        Name: 'Excel Spreadsheet',
        DriverClass: 'SpreadsheetArtifactViewerPlugin',
        Configuration: JSON.stringify({
          Thumbnail: { Enabled: true, Mode: 'Structural', MaskLiveDataBlocks: true },
        }),
      },
      {
        ID: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        Name: 'Data',
        DriverClass: 'DataArtifactViewerPlugin',
        Configuration: JSON.stringify({
          Thumbnail: { Enabled: false, Mode: 'Icon' },
        }),
      },
    ] as unknown as typeof ArtifactMetadataEngine.Instance.ArtifactTypes;

    const spy = vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue(mockTypes);

    try {
      const el = document.createElement('div');
      Object.defineProperty(el, 'clientWidth', { value: 640, configurable: true });
      Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });

      const sheetRes = await CaptureThumbnailForDriverIfAllowed('SpreadsheetArtifactViewerPlugin', el);
      expect(sheetRes.Policy.Mode).toBe('Structural');
      expect(sheetRes.CapturedThumbnailDataUrl).toBeNull();
      expect(toCanvas).not.toHaveBeenCalled();

      const dataRes = await CaptureThumbnailForDriverIfAllowed('DataArtifactViewerPlugin', el);
      expect(dataRes.Policy.Enabled).toBe(false);
      expect(dataRes.Policy.Mode).toBe('Icon');
      expect(dataRes.CapturedThumbnailDataUrl).toBeNull();
      expect(toCanvas).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('SerializeSvgToDataUrl encodes valid SVG and rejects invalid strings', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50"/></svg>';
    const encoded = SerializeSvgToDataUrl(svg);
    expect(encoded?.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(SerializeSvgToDataUrl('not an svg')).toBeNull();
    expect(SerializeSvgToDataUrl('')).toBeNull();
  });
});
