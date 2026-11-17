import { describe, expect, it } from 'vitest';
import {
  BuildArtifactPreviewSnapshot,
  BuildArtifactVersionConfigurationWithPreview,
  IsValidThumbnailDataUrl,
  ParseArtifactVersionConfiguration,
  ResolveArtifactTypeThumbnailPolicy,
  type ArtifactTypePolicyInput,
} from '../custom/ArtifactPreviewSnapshot';

describe('ArtifactPreviewSnapshot & Thumbnail Policy', () => {
  it('resolves policy from ConfigurationObject, Configuration JSON, and ParentID inheritance', () => {
    const parentType: Exclude<ArtifactTypePolicyInput, string | null | undefined> = {
      ID: '11111111-1111-1111-1111-111111111111',
      Name: 'Custom Parent',
      Configuration: JSON.stringify({
        Thumbnail: { Enabled: true, Mode: 'Rendered', MaskLiveDataBlocks: true },
      }),
    };
    const childOverride: Exclude<ArtifactTypePolicyInput, string | null | undefined> = {
      ID: '22222222-2222-2222-2222-222222222222',
      Name: 'Child Sheet',
      ParentID: parentType.ID,
      ConfigurationObject: {
        Thumbnail: { Mode: 'Structural' },
      },
    };
    const childInherit: Exclude<ArtifactTypePolicyInput, string | null | undefined> = {
      ID: '33333333-3333-3333-3333-333333333333',
      Name: 'Child Inherits All',
      ParentID: parentType.ID,
    };

    const all = [parentType, childOverride, childInherit];

    expect(ResolveArtifactTypeThumbnailPolicy(parentType, all)).toEqual({
      Enabled: true,
      Mode: 'Rendered',
      MaskLiveDataBlocks: true,
    });
    expect(ResolveArtifactTypeThumbnailPolicy(childOverride, all)).toEqual({
      Enabled: true,
      Mode: 'Structural',
      MaskLiveDataBlocks: true,
    });
    expect(ResolveArtifactTypeThumbnailPolicy(childInherit, all)).toEqual({
      Enabled: true,
      Mode: 'Rendered',
      MaskLiveDataBlocks: true,
    });
  });

  it('fails closed to Icon mode for sensitive/unknown types and honors Enabled: false', () => {
    expect(ResolveArtifactTypeThumbnailPolicy('Data')).toEqual({
      Enabled: false,
      Mode: 'Icon',
      MaskLiveDataBlocks: true,
    });
    expect(ResolveArtifactTypeThumbnailPolicy('SQL')).toEqual({
      Enabled: false,
      Mode: 'Icon',
      MaskLiveDataBlocks: true,
    });
    expect(ResolveArtifactTypeThumbnailPolicy('Excel Spreadsheet')).toEqual({
      Enabled: true,
      Mode: 'Structural',
      MaskLiveDataBlocks: true,
    });
    expect(
      ResolveArtifactTypeThumbnailPolicy({
        Name: 'Markdown Document',
        ConfigurationObject: {
          Thumbnail: { Enabled: false, Mode: 'Rendered' },
        },
      }),
    ).toEqual({
      Enabled: false,
      Mode: 'Icon',
      MaskLiveDataBlocks: true,
    });
  });

  it('does not leak fenced mj-block JSON into doc snapshot excerpts', () => {
    const md = [
      '# FY27 Enterprise AI Strategy',
      '',
      '```mj-block',
      '{ "BlockID": "blk-1794228453561", "Kind": "EntityView", "Mode": "Live" }',
      '```',
      '',
      'Unified executive strategy across cloud operations and governance.',
    ].join('\n');

    const snap = BuildArtifactPreviewSnapshot(md, 'MarkdownArtifactViewerPlugin');
    expect(snap).not.toBeNull();
    expect(snap?.Kind).toBe('doc');
    if (snap?.Kind === 'doc') {
      expect(snap.Heading).toBe('FY27 Enterprise AI Strategy');
      expect(snap.Excerpt).toContain('Unified executive strategy');
      expect(snap.Excerpt).not.toContain('BlockID');
      expect(snap.Excerpt).not.toContain('EntityView');
    }
  });

  it('strips previewSnapshot and thumbnailDataUrl when policy is Structural or Icon while keeping unrelated keys', () => {
    const existingRaw = JSON.stringify({
      customFlag: 'keep-me',
      previewSnapshot: { Kind: 'sheet', Headers: ['Customer', 'Secret'], Rows: [['Acme', '$9M']] },
      thumbnailDataUrl: 'data:image/png;base64,AAAA',
    });

    const structuralOut = BuildArtifactVersionConfigurationWithPreview(
      existingRaw,
      JSON.stringify({ Worksheets: [{ SheetID: 's1', Name: 'Sheet1', Cells: { A1: { RawValue: 'Revenue' } } }] }),
      'SpreadsheetArtifactViewerPlugin',
      'Financials',
      { Policy: { Enabled: true, Mode: 'Structural', MaskLiveDataBlocks: true } },
    );
    const parsedStructural = ParseArtifactVersionConfiguration(structuralOut);
    expect(parsedStructural).toEqual({ customFlag: 'keep-me' });

    const iconOut = BuildArtifactVersionConfigurationWithPreview(
      existingRaw,
      'SELECT * FROM SecretTable',
      null,
      'Secret Query',
      { Policy: { Enabled: false, Mode: 'Icon', MaskLiveDataBlocks: true } },
    );
    const parsedIcon = ParseArtifactVersionConfiguration(iconOut);
    expect(parsedIcon).toEqual({ customFlag: 'keep-me' });
  });

  it('accepts valid CapturedThumbnailDataUrl for Rendered types and rejects malformed/oversized data URLs', () => {
    const validCapture = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
    expect(IsValidThumbnailDataUrl(validCapture)).toBe(true);
    expect(IsValidThumbnailDataUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBe(false);
    expect(IsValidThumbnailDataUrl('https://evil.example.com/x.png')).toBe(false);

    const renderedOut = BuildArtifactVersionConfigurationWithPreview(
      null,
      '# Board Title\n\nReal content paragraph',
      'MarkdownArtifactViewerPlugin',
      'Board Title',
      {
        Policy: { Enabled: true, Mode: 'Rendered', MaskLiveDataBlocks: true },
        CapturedThumbnailDataUrl: validCapture,
      },
    );
    const parsed = ParseArtifactVersionConfiguration(renderedOut);
    expect(parsed?.thumbnailDataUrl).toBe(validCapture);
    expect(parsed?.previewSnapshot?.Kind).toBe('doc');

    // Malformed capture falls back to SVG instead of saving unsafe URI
    const unsafeOut = BuildArtifactVersionConfigurationWithPreview(
      null,
      '# Board Title\n\nReal content paragraph',
      'MarkdownArtifactViewerPlugin',
      'Board Title',
      {
        Policy: { Enabled: true, Mode: 'Rendered', MaskLiveDataBlocks: true },
        CapturedThumbnailDataUrl: 'javascript:alert(1)',
      },
    );
    const parsedFallback = ParseArtifactVersionConfiguration(unsafeOut);
    expect(parsedFallback?.thumbnailDataUrl?.startsWith('data:image/svg+xml;base64,')).toBe(true);
  });
});
