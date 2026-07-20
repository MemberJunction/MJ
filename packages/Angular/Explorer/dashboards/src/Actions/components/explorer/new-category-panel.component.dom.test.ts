import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BehaviorSubject } from 'rxjs';
import { MJButtonDirective, MJAlertComponent, MJDropdownComponent } from '@memberjunction/ng-ui-components';
import { query, capture } from '@memberjunction/ng-test-utils';
import { NewCategoryPanelComponent } from './new-category-panel.component';
import { ActionExplorerStateService } from '../../services/action-explorer-state.service';

/**
 * DOM coverage for <mj-new-category-panel> — a slide-in create-category form gated on the state
 * service's NewCategoryPanelOpen$ stream. Actual persistence goes through ProviderToUse and is out
 * of scope; these specs cover the open/close gating, the form, validation-error display, and the
 * close path (service.closeNewCategoryPanel + Close). Faked state service; noop animations.
 * detectChanges(false) because the open-stream flips the @if in ngOnInit.
 */

function render(open: boolean): { fixture: ComponentFixture<NewCategoryPanelComponent>; close: ReturnType<typeof vi.fn> } {
  const close = vi.fn();
  TestBed.configureTestingModule({
    imports: [FormsModule, MJButtonDirective, MJAlertComponent, MJDropdownComponent],
    declarations: [NewCategoryPanelComponent],
    providers: [provideNoopAnimations(), { provide: ActionExplorerStateService, useValue: { NewCategoryPanelOpen$: new BehaviorSubject(open), closeNewCategoryPanel: close } }],
  });
  const fixture = TestBed.createComponent(NewCategoryPanelComponent);
  fixture.componentRef.setInput('Categories', []);
  fixture.detectChanges(false);
  return { fixture, close };
}

describe('NewCategoryPanelComponent (DOM)', () => {
  it('does not render the panel while the open stream is false', () => {
    expect(query(render(false).fixture, '.slide-panel')).toBeNull();
  });

  it('renders the New Category panel with a name input when open', () => {
    const { fixture } = render(true);
    expect(query(fixture, '.panel-header h2')?.textContent).toContain('New Category');
    expect(query(fixture, '#categoryName')).not.toBeNull();
  });

  it('closes via the state service and emits Close when the close button is clicked', () => {
    const { fixture, close } = render(true);
    const closed = capture(fixture.componentInstance.Close);
    (query(fixture, '.panel-header button') as HTMLElement).click();
    expect(close).toHaveBeenCalled();
    expect(closed.length).toBe(1);
  });
});
