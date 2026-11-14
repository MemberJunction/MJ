import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MJArtifactVersionEntity, SpreadsheetEngine } from '@memberjunction/core-entities';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { SpreadsheetVersionDiffComponent } from './spreadsheet-version-diff.component';

function makeVersion(id: string, num: number, content: string): MJArtifactVersionEntity {
  const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
  Object.defineProperties(ver, {
    ID: { value: id, enumerable: true },
    ArtifactID: { value: 'art-sheet-1', enumerable: true },
    VersionNumber: { value: num, enumerable: true },
    Content: { value: content, enumerable: true },
  });
  return ver;
}

afterEach(() => TestBed.resetTestingModule());

describe('SpreadsheetVersionDiffComponent DOM', () => {
  it('renders cell value and formula deltas across workbook versions', () => {
    const wbBase = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Budget');
    const sid = wbBase.Worksheets[0].SheetID;
    SpreadsheetEngine.Instance.SetCell(wbBase, sid, 'A1', { Value: 100 });
    const wbTarget = SpreadsheetEngine.Instance.ParseWorkbook(SpreadsheetEngine.Instance.SerializeWorkbook(wbBase));
    SpreadsheetEngine.Instance.SetCell(wbTarget, sid, 'A1', { Value: 250 });

    const f = renderComponentFixture(SpreadsheetVersionDiffComponent, {
      imports: [SpreadsheetVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion('sh1', 1, SpreadsheetEngine.Instance.SerializeWorkbook(wbBase)),
        TargetVersion: makeVersion('sh2', 2, SpreadsheetEngine.Instance.SerializeWorkbook(wbTarget)),
      },
    });
    f.detectChanges();
    expect(query(f, '[data-testid="spreadsheet-visual-version-diff"]')).not.toBeNull();
    expect(text(f, '[data-testid="spreadsheet-visual-version-diff"]')).toContain('250');
  });

  it('switches active worksheet diff tab when SelectSheet is invoked', () => {
    const wbBase = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Multi');
    SpreadsheetEngine.Instance.AddWorksheet(wbBase, 'Summary');
    const wbTarget = SpreadsheetEngine.Instance.ParseWorkbook(SpreadsheetEngine.Instance.SerializeWorkbook(wbBase));
    SpreadsheetEngine.Instance.SetCell(wbTarget, wbTarget.Worksheets[1].SheetID, 'B2', { Value: 42 });

    const f = renderComponentFixture(SpreadsheetVersionDiffComponent, {
      imports: [SpreadsheetVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion('sh1', 1, SpreadsheetEngine.Instance.SerializeWorkbook(wbBase)),
        TargetVersion: makeVersion('sh2', 2, SpreadsheetEngine.Instance.SerializeWorkbook(wbTarget)),
      },
    });
    f.detectChanges();
    const secondSheet = f.componentInstance.DiffResult?.Sheets[1] ?? null;
    expect(secondSheet).not.toBeNull();
    f.componentInstance.SelectSheet(secondSheet!);
    f.detectChanges();
    expect(f.componentInstance.ActiveSheet).toBe(secondSheet);
  });

  it('toggles between grid and list cell-delta views', () => {
    const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Empty');
    const serialized = SpreadsheetEngine.Instance.SerializeWorkbook(wb);
    const f = renderComponentFixture(SpreadsheetVersionDiffComponent, {
      imports: [SpreadsheetVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion('sh1', 1, serialized),
        TargetVersion: makeVersion('sh2', 2, serialized),
      },
    });
    f.detectChanges();
    f.componentInstance.SetViewMode('list');
    f.detectChanges();
    expect(f.componentInstance.ViewMode).toBe('list');
  });
});
