import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { ComponentVersionDiffComponent } from './component-version-diff.component';

function makeVersion(id: string, num: number, content: string): MJArtifactVersionEntity {
  const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
  Object.defineProperties(ver, {
    ID: { value: id, enumerable: true },
    ArtifactID: { value: 'art-comp-1', enumerable: true },
    VersionNumber: { value: num, enumerable: true },
    Content: { value: content, enumerable: true },
  });
  return ver;
}

afterEach(() => TestBed.resetTestingModule());

describe('ComponentVersionDiffComponent DOM', () => {
  it('renders ComponentSpec changeRequest banner and code diff', () => {
    const f = renderComponentFixture(ComponentVersionDiffComponent, {
      imports: [ComponentVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion('cv1', 1, JSON.stringify({ name: 'Card', code: 'return <div>1</div>;' })),
        TargetVersion: makeVersion(
          'cv2',
          2,
          JSON.stringify({
            name: 'Card',
            changeRequest: { userRequest: 'Make header bold', type: 'style' },
            code: 'return <h1>1</h1>;',
          }),
        ),
      },
    });
    f.detectChanges();
    expect(query(f, '[data-testid="component-visual-version-diff"]')).not.toBeNull();
    expect(queryAll(f, '[data-testid="comp-diff-change-request"]').length).toBe(1);
  });

  it('tracks changed code units in DiffResult', () => {
    const f = renderComponentFixture(ComponentVersionDiffComponent, {
      imports: [ComponentVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion('cv1', 1, JSON.stringify({ name: 'Chart', code: 'return <span/>;' })),
        TargetVersion: makeVersion('cv2', 2, JSON.stringify({ name: 'Chart', code: 'return <div/>;' })),
      },
    });
    f.detectChanges();
    expect(f.componentInstance.ChangedCodeUnitsCount).toBeGreaterThanOrEqual(1);
  });

  it('switches ActiveTab cleanly via SetTab', () => {
    const f = renderComponentFixture(ComponentVersionDiffComponent, {
      imports: [ComponentVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion('cv1', 1, JSON.stringify({ name: 'A', code: 'x' })),
        TargetVersion: makeVersion('cv2', 2, JSON.stringify({ name: 'B', code: 'y' })),
      },
    });
    f.detectChanges();
    f.componentInstance.SetTab('code');
    f.detectChanges();
    expect(f.componentInstance.ActiveTab).toBe('code');
  });
});
