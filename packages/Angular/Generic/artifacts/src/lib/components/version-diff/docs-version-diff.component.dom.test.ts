import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { DocsVersionDiffComponent } from './docs-version-diff.component';

function makeVersion(id: string, num: number, content: string): MJArtifactVersionEntity {
  const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
  Object.defineProperties(ver, {
    ID: { value: id, enumerable: true },
    ArtifactID: { value: 'art-doc-1', enumerable: true },
    VersionNumber: { value: num, enumerable: true },
    Content: { value: content, enumerable: true },
  });
  return ver;
}

afterEach(() => TestBed.resetTestingModule());

describe('DocsVersionDiffComponent DOM', () => {
  it('renders word-level redline insertions and deletions for modified prose blocks', () => {
    const f = renderComponentFixture(DocsVersionDiffComponent, {
      imports: [DocsVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion('v1', 1, '# Strategy\n\nInitial Q3 target was $1.2M.'),
        TargetVersion: makeVersion('v2', 2, '# Strategy\n\nUpdated Q4 target is $1.8M.'),
      },
    });
    f.detectChanges();
    expect(query(f, '[data-testid="docs-visual-version-diff"]')).not.toBeNull();
    expect(text(f, '[data-testid="docs-visual-version-diff"]')).toContain('Q4');
  });

  it('filters unchanged blocks when ToggleHideUnchanged is invoked', () => {
    const f = renderComponentFixture(DocsVersionDiffComponent, {
      imports: [DocsVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion('v1', 1, '# Unchanged Heading\n\nParagraph A'),
        TargetVersion: makeVersion('v2', 2, '# Unchanged Heading\n\nParagraph B'),
      },
    });
    f.detectChanges();
    f.componentInstance.ToggleHideUnchanged();
    f.detectChanges();
    expect(f.componentInstance.HideUnchanged).toBe(true);
    expect(f.componentInstance.VisibleBlocks.every((b) => b.Status !== 'unchanged')).toBe(true);
  });

  it('strips leading markdown heading markers via GetCleanSpans', () => {
    const f = renderComponentFixture(DocsVersionDiffComponent, {
      imports: [DocsVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion('v1', 1, '## Executive Overview'),
        TargetVersion: makeVersion('v2', 2, '## Executive Summary'),
      },
    });
    f.detectChanges();
    const blk = f.componentInstance.VisibleBlocks.find((b) => b.Category === 'heading');
    expect(blk).toBeDefined();
    expect(f.componentInstance.GetCleanSpans(blk!)[0]?.Text.startsWith('#')).toBe(false);
  });
});
