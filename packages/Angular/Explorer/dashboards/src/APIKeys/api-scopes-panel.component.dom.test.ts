import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { renderComponentFixture, query, queryAll, text, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { APIScopesPanelComponent } from './api-scopes-panel.component';

/**
 * DOM coverage for <mj-api-scopes-panel> — a data-bound (standalone:false) hierarchical scope tree.
 * It loads "MJ: API Scopes" via RunView through ProviderToUse in ngOnInit and builds a parent/child
 * tree. A createFakeProvider supplies scope rows. Tests assert the rendered tree nodes, the total/
 * active counts, the empty state, and the openCreateDialog → dialog-visible transition (which the
 * "New Scope" button triggers). *ngTemplateOutlet needs CommonModule; mj-empty-state / mj-window /
 * mj-dropdown / mjButton are light stubs (the dropdowns use ngModel so their stub is a CVA).
 * Async ngOnInit flips IsLoading, so tests await microtasks then a non-strict detectChanges.
 */

@Component({ standalone: true, selector: 'mj-loading', template: '' })
class StubLoading { @Input() text = ''; @Input() showText = true; @Input() size = ''; }
@Component({ standalone: true, selector: 'mj-empty-state', template: '<span class="stub-empty">{{ Title }}</span>' })
class StubEmptyState { @Input() Icon = ''; @Input() Title = ''; @Input() Message = ''; }
@Component({ standalone: true, selector: 'mj-window', template: '<div class="stub-window"><ng-content></ng-content></div>' })
class StubWindow {
  @Input() Width = 0; @Input() MinWidth = 0; @Input() MinHeight = 0; @Input() Resizable = false;
  @Input() Draggable = false; @Input() Visible = false; @Input() Top = 0; @Output() Close = new EventEmitter<void>();
}
@Component({ standalone: true, selector: 'mj-window-titlebar', template: '<ng-content></ng-content>' })
class StubWindowTitlebar {}
@Component({ standalone: true, selector: 'button[mjButton]', template: '<ng-content></ng-content>' })
class StubButton { @Input() variant = ''; }
@Component({
  standalone: true,
  selector: 'mj-dropdown',
  template: '',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => StubDropdown), multi: true }],
})
class StubDropdown implements ControlValueAccessor {
  @Input() Data: unknown; @Input() TextField = ''; @Input() ValueField = ''; @Input() ValuePrimitive = false; @Input() DefaultItem: unknown;
  writeValue(): void {} registerOnChange(): void {} registerOnTouched(): void {}
}

const scope = (over: Partial<Record<string, unknown>>) =>
  ({ ID: '', Name: '', Description: null, Category: 'Entities', ResourceType: null, ParentID: null, IsActive: true, FullPath: '', ...over });

const UI = [StubLoading, StubEmptyState, StubWindow, StubWindowTitlebar, StubButton, StubDropdown];

async function render(scopes: unknown[], onSetup?: (instance: APIScopesPanelComponent) => void) {
  const provider = createFakeProvider({ runViewResults: scopes });
  const fixture = renderComponentFixture(APIScopesPanelComponent, {
    imports: [CommonModule, FormsModule, ...UI],
    declarations: [APIScopesPanelComponent],
    inputs: { Provider: provider },
    // setup runs after inputs are set but BEFORE the first detectChanges (which
    // triggers ngOnInit -> loadData), so callers can observe outputs across the load.
    setup: onSetup ? (instance) => onSetup(instance) : undefined,
  });
  for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
  fixture.detectChanges(false);
  return fixture;
}

describe('APIScopesPanelComponent (DOM)', () => {
  it('renders a node per root scope with its name', async () => {
    const fixture = await render([
      scope({ ID: 's1', Name: 'entity', FullPath: 'entity' }),
      scope({ ID: 's2', Name: 'agent', FullPath: 'agent' }),
    ]);
    const names = queryAll(fixture, '.scope-node .scope-name').map(el => el.textContent?.trim().split('\n')[0].trim());
    expect(names.some(n => n?.startsWith('entity'))).toBe(true);
    expect(names.some(n => n?.startsWith('agent'))).toBe(true);
  });

  it('renders the total and active scope counts in the header', async () => {
    const fixture = await render([
      scope({ ID: 's1', Name: 'entity', IsActive: true }),
      scope({ ID: 's2', Name: 'agent', IsActive: false }),
    ]);
    expect(text(fixture, '.scope-stats .stat:not(.active)')).toContain('2 total');
    expect(text(fixture, '.scope-stats .stat.active')).toContain('1 active');
  });

  it('renders child scopes nested under their parent', async () => {
    const fixture = await render([
      scope({ ID: 's1', Name: 'entity', FullPath: 'entity' }),
      scope({ ID: 's2', Name: 'read', ParentID: 's1', FullPath: 'entity:read' }),
    ]);
    expect(query(fixture, '.children')).not.toBeNull();
  });

  it('shows the empty state when no scopes are configured', async () => {
    const fixture = await render([]);
    expect(query(fixture, '.scope-node')).toBeNull();
    expect(text(fixture, '.stub-empty')).toBe('No scopes configured');
  });

  it('opens the create dialog when the "New Scope" button is clicked', async () => {
    const fixture = await render([scope({ ID: 's1', Name: 'entity' })]);
    expect(query(fixture, '.stub-window')).toBeNull();
    (query(fixture, '.btn-create') as HTMLElement).click();
    fixture.detectChanges(false);
    expect(fixture.componentInstance.ShowCreateDialog).toBe(true);
    expect(query(fixture, '.stub-window')).not.toBeNull();
  });

  it('does not emit ScopeUpdated on load (only after a save)', async () => {
    // Subscribe BEFORE the load runs (setup fires before the first detectChanges,
    // which triggers ngOnInit -> loadData). ScopeUpdated only emits from saveScope(),
    // so a clean load must produce zero emissions.
    let updates: void[] = [];
    const fixture = await render([scope({ ID: 's1', Name: 'entity' })], (instance) => {
      updates = capture(instance.ScopeUpdated);
    });
    // Load completed and the tree rendered — proves we actually exercised the load path.
    expect(fixture.componentInstance.FlatScopes.length).toBe(1);
    expect(updates.length).toBe(0);
  });
});
