import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { renderComponentFixture, query, queryAll, text, hasClass, capture, StubDropdownComponent } from '@memberjunction/ng-test-utils';
import { NavigationService } from '@memberjunction/ng-shared';
import type { MJActionCategoryEntity } from '@memberjunction/core-entities';
import { NewActionPanelComponent } from './new-action-panel.component';
import { ActionExplorerStateService } from '../../services/action-explorer-state.service';

/**
 * DOM coverage for <mj-new-action-panel> — a slide-in create form (standalone:false, OnPush) whose
 * visibility is driven by ActionExplorerStateService.NewActionPanelOpen$. The real state service is
 * provided (its constructor only wires a debounced persistence subscription — no UserInfoEngine
 * call); openNewActionPanel() in setup makes the BehaviorSubject emit true, which the panel's
 * ngOnInit subscription replays so the panel renders open. NavigationService is a bare stub (only
 * touched on a successful save, which these tests don't perform — no ProviderToUse.Save is invoked).
 * Tests assert the type-selector, in-panel validation (onSave with an empty Name → inline error and
 * NO ActionCreated), and the Close output. Animations are no-op; mj-dropdown ngModel needs a CVA
 * stub. All state changes are event-driven (button clicks), keeping the OnPush view NG0100-safe.
 */

@Component({ standalone: true, selector: 'mj-alert', template: '<span class="stub-alert"><ng-content></ng-content></span>' })
class StubAlert { @Input() Variant = ''; }
@Component({ standalone: true, selector: 'button[mjButton]', template: '<ng-content></ng-content>' })
class StubButton { @Input() variant = ''; }

const cat = (over: Partial<Record<string, unknown>>) =>
  ({ ID: '', Name: '', ParentID: null, ...over }) as unknown as MJActionCategoryEntity;

const render = (Categories: MJActionCategoryEntity[] = []) => {
  const state = new ActionExplorerStateService();
  return renderComponentFixture(NewActionPanelComponent, {
    imports: [CommonModule, FormsModule, StubAlert, StubButton, StubDropdownComponent],
    declarations: [NewActionPanelComponent],
    providers: [
      { provide: ActionExplorerStateService, useValue: state },
      { provide: NavigationService, useValue: {} },
      provideNoopAnimations(),
    ],
    inputs: { Categories },
    // Open the panel BEFORE the first CD so the OnPush ngOnInit subscription replays `true`.
    setup: () => state.openNewActionPanel(),
  });
};

describe('NewActionPanelComponent (DOM)', () => {
  it('renders the panel open with its title when NewActionPanelOpen$ is true', () => {
    const fixture = render();
    expect(query(fixture, '.slide-panel')).not.toBeNull();
    expect(text(fixture, '.panel-header h2')).toContain('New Action');
  });

  it('renders both action-type options with Custom selected by default', () => {
    const fixture = render();
    const options = queryAll(fixture, '.type-option');
    expect(options.length).toBe(2);
    // First option (Custom) carries the selected class initially.
    expect(hasClass(fixture, '.type-option', 'selected')).toBe(true);
    const labels = queryAll(fixture, '.type-label').map(el => el.textContent?.trim());
    expect(labels).toEqual(['Custom Action', 'AI Generated']);
  });

  it('switches the selected type when the AI Generated option is clicked', () => {
    const fixture = render();
    const options = queryAll(fixture, '.type-option');
    (options[1] as HTMLElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.Type).toBe('Generated');
    expect(options[1].classList.contains('selected')).toBe(true);
  });

  it('shows inline validation errors and does not emit ActionCreated on an empty save', () => {
    const fixture = render([cat({ ID: 'c1', Name: 'Comms' })]);
    const created = capture(fixture.componentInstance.ActionCreated);
    // Create button is the first footer button.
    (queryAll(fixture, '.panel-footer button[mjButton]')[0] as HTMLElement).click();
    fixture.detectChanges();
    // Name is empty AND category unset → both errors, save aborted before any provider call.
    expect(text(fixture, '.error-text')).toContain('Action name is required');
    expect(created.length).toBe(0);
  });

  it('emits Close when the header close button is clicked', () => {
    const fixture = render();
    const closed = capture(fixture.componentInstance.Close);
    // Header close is the first mjButton in the header.
    (query(fixture, '.panel-header button[mjButton]') as HTMLElement).click();
    expect(closed.length).toBe(1);
  });
});
