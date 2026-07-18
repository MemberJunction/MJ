import { describe, it, expect } from 'vitest';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import type { HomeAppPinnedItem } from '@memberjunction/ng-shared';
import { ActionPinRunnerDialogComponent } from './action-pin-runner-dialog.component';

/**
 * DOM coverage for <mj-action-pin-runner-dialog> — a Visible+Pin-gated dialog that runs a pinned
 * action. initFromPin (on the Visible->true change) derives the runtime fields from the pin config;
 * a minimal pin yields no fields, so the "no input needed" state renders. Running the action needs
 * the provider and is out of scope; these specs cover gating, the hero, the no-fields state, and the
 * cancel (Close) emission. FormsModule for the ngModel field inputs. Single synchronous render.
 */

const PIN = { DisplayName: 'Send Welcome Email' } as unknown as HomeAppPinnedItem;

const render = (Visible: boolean, Pin: HomeAppPinnedItem | null = PIN) =>
  renderComponentFixture(ActionPinRunnerDialogComponent, {
    imports: [FormsModule],
    declarations: [ActionPinRunnerDialogComponent],
    inputs: { Pin, Visible },
  });

describe('ActionPinRunnerDialogComponent (DOM)', () => {
  it('renders nothing when not visible', () => {
    expect(query(render(false), '.apr-dialog')).toBeNull();
  });

  it('renders nothing when there is no pin', () => {
    expect(query(render(true, null), '.apr-dialog')).toBeNull();
  });

  it('renders the hero with the pin display name when visible', () => {
    const fixture = render(true);
    expect(query(fixture, '.apr-dialog')).not.toBeNull();
    expect(query(fixture, '.apr-hero-title')?.textContent).toContain('Send Welcome Email');
  });

  it('shows the no-input-needed state for a pin with no runtime parameters', () => {
    const fixture = render(true);
    const noFields = query(fixture, '.apr-no-fields');
    expect(noFields).not.toBeNull();
    expect(noFields?.textContent).toContain('no input needed');
  });

  it('emits Result({Closed:true}) when the backdrop is clicked', () => {
    const fixture = render(true);
    const result = capture(fixture.componentInstance.Result);
    (query(fixture, '.apr-backdrop') as HTMLElement).click();
    expect(result).toEqual([{ Closed: true }]);
  });
});
