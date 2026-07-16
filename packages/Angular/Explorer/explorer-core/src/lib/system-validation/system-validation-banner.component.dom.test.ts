import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { query, queryAll } from '@memberjunction/ng-test-utils';
import { SystemValidationBannerComponent } from './system-validation-banner.component';
import { SystemValidationService, SystemValidationIssue } from '../services/system-validation.service';

/**
 * DOM coverage for <mj-system-validation-banner> — a standalone banner that renders one row per
 * system-validation issue from `SystemValidationService.validationIssues$`, with a dark overlay when
 * any issue is an error and a dismiss button for non-error issues. A fake service exposes a
 * controllable BehaviorSubject + a spied removeIssue. `detectChanges(false)`+`markForCheck` because
 * the subscription mutates plain properties across the `@if (issues.length)` boundary.
 */

const issue = (over: Partial<SystemValidationIssue>): SystemValidationIssue =>
  ({ id: 'i1', severity: 'warning', message: 'Something to check', ...over }) as SystemValidationIssue;

function render(issues: SystemValidationIssue[]): { fixture: ComponentFixture<SystemValidationBannerComponent>; removeIssue: ReturnType<typeof vi.fn> } {
  const removeIssue = vi.fn();
  TestBed.configureTestingModule({
    imports: [SystemValidationBannerComponent],
    providers: [{ provide: SystemValidationService, useValue: { validationIssues$: new BehaviorSubject(issues), removeIssue } }],
  });
  const fixture = TestBed.createComponent(SystemValidationBannerComponent);
  fixture.detectChanges(false);
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return { fixture, removeIssue };
}

describe('SystemValidationBannerComponent (DOM)', () => {
  it('renders nothing when there are no issues', () => {
    expect(query(render([]).fixture, '.system-validation-banner')).toBeNull();
  });

  it('renders one banner per issue with its message', () => {
    const { fixture } = render([issue({ id: 'a', message: 'Missing config' }), issue({ id: 'b', message: 'Stale cache' })]);
    const banners = queryAll(fixture, '.system-validation-banner');
    expect(banners.length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Missing config');
    expect(fixture.nativeElement.textContent).toContain('Stale cache');
  });

  it('shows the error overlay and no dismiss button for error issues', () => {
    const { fixture } = render([issue({ severity: 'error', message: 'Fatal' })]);
    expect(query(fixture, '.system-validation-overlay')).not.toBeNull();
    expect(query(fixture, '.system-validation-error')).not.toBeNull();
    expect(query(fixture, '.dismiss-button')).toBeNull();
  });

  it('shows a dismiss button for non-error issues and calls removeIssue with the id when clicked', () => {
    const { fixture, removeIssue } = render([issue({ id: 'w1', severity: 'warning' })]);
    expect(query(fixture, '.system-validation-overlay')).toBeNull(); // no error → no overlay
    const dismiss = query(fixture, '.dismiss-button') as HTMLElement;
    expect(dismiss).not.toBeNull();
    dismiss.click();
    expect(removeIssue).toHaveBeenCalledWith('w1');
  });
});
