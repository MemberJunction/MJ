import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { QueryVersionDiffComponent } from './query-version-diff.component';

function makeVersion(id: string, num: number, content: string): MJArtifactVersionEntity {
  const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
  Object.defineProperties(ver, {
    ID: { value: id, enumerable: true },
    ArtifactID: { value: 'art-sql-1', enumerable: true },
    VersionNumber: { value: num, enumerable: true },
    Content: { value: content, enumerable: true },
  });
  return ver;
}

afterEach(() => TestBed.resetTestingModule());

describe('QueryVersionDiffComponent DOM', () => {
  it('renders SQL diff container and added SQL tokens for structured Query JSON payloads', () => {
    const f = renderComponentFixture(QueryVersionDiffComponent, {
      imports: [QueryVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion(
          'qv1',
          1,
          JSON.stringify({ metadata: { sql: 'SELECT ID, Name FROM Accounts WHERE Active = 1', rowCount: 1 } }),
        ),
        TargetVersion: makeVersion(
          'qv2',
          2,
          JSON.stringify({ metadata: { sql: 'SELECT ID, Name, Region FROM Accounts WHERE Active = 1', rowCount: 1 } }),
        ),
      },
    });
    f.detectChanges();
    expect(query(f, '[data-testid="query-visual-version-diff"]')).not.toBeNull();
    expect(text(f, '[data-testid="query-visual-version-diff"]')).toContain('Region');
  });

  it('extracts SQL diff into DiffResult.SqlDiff', () => {
    const f = renderComponentFixture(QueryVersionDiffComponent, {
      imports: [QueryVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion('qv1', 1, JSON.stringify({ metadata: { sql: 'SELECT 1 AS N', rowCount: 1 } })),
        TargetVersion: makeVersion('qv2', 2, JSON.stringify({ metadata: { sql: 'SELECT 2 AS N', rowCount: 5 } })),
      },
    });
    f.detectChanges();
    expect(f.componentInstance.DiffResult?.SqlDiff.IsIdentical).toBe(false);
  });

  it('switches ActiveTab cleanly via SetTab', () => {
    const f = renderComponentFixture(QueryVersionDiffComponent, {
      imports: [QueryVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion('qv1', 1, JSON.stringify({ metadata: { sql: 'SELECT 42' } })),
        TargetVersion: makeVersion('qv2', 2, JSON.stringify({ metadata: { sql: 'SELECT 42' } })),
      },
    });
    f.detectChanges();
    f.componentInstance.SetTab('schema');
    f.detectChanges();
    expect(f.componentInstance.ActiveTab).toBe('schema');
  });
});
