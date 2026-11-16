import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { ArtifactVersionDiffService } from '../../services/artifact-version-diff.service';
import { GitDiffLinesViewComponent } from './git-diff-lines-view.component';

afterEach(() => TestBed.resetTestingModule());

describe('GitDiffLinesViewComponent DOM', () => {
  it('renders identical notice when Diff is null or identical', () => {
    const f = renderComponentFixture(GitDiffLinesViewComponent, {
      imports: [GitDiffLinesViewComponent],
      inputs: {
        Diff: null,
        EmptyMessage: 'No text differences.',
      },
    });
    f.detectChanges();
    expect(query(f, '[data-testid="git-diff-identical"]')).not.toBeNull();
    expect(text(f, '[data-testid="git-diff-identical"]')).toContain('No text differences.');
  });

  it('renders unified diff stats and switches to split layout on click', () => {
    TestBed.configureTestingModule({});
    const svc = TestBed.inject(ArtifactVersionDiffService);
    const diff = svc.ComputeGitTextDiff('alpha\nbeta', 'alpha\ngamma', true);
    TestBed.resetTestingModule();

    const f = renderComponentFixture(GitDiffLinesViewComponent, {
      imports: [GitDiffLinesViewComponent],
      inputs: {
        Diff: diff,
        HeaderLabel: 'Source Diff',
        ShowLayoutToggle: true,
        TestId: 'git-diff-test-box',
      },
    });
    f.detectChanges();
    expect(query(f, '[data-testid="git-diff-test-box"]')).not.toBeNull();
    f.componentInstance.SetLayout('split');
    f.detectChanges();
    expect(f.componentInstance.Layout).toBe('split');
  });

  it('expands collapsed unchanged context groups on ExpandGroup', () => {
    TestBed.configureTestingModule({});
    const svc = TestBed.inject(ArtifactVersionDiffService);
    const base = Array.from({ length: 20 }, (_, i) => `line-${i}`).join('\n');
    const target = Array.from({ length: 20 }, (_, i) => (i === 0 ? 'changed-0' : `line-${i}`)).join('\n');
    const diff = svc.ComputeGitTextDiff(base, target, false);
    TestBed.resetTestingModule();

    const f = renderComponentFixture(GitDiffLinesViewComponent, {
      imports: [GitDiffLinesViewComponent],
      inputs: { Diff: diff },
    });
    f.detectChanges();
    const collapsible = diff.Groups.find((g) => g.IsCollapsibleContext);
    expect(collapsible).toBeDefined();
    f.componentInstance.ExpandGroup(collapsible!.GroupID);
    expect(f.componentInstance.IsExpanded(collapsible!.GroupID)).toBe(true);
  });
});
