import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { BaseEntity } from '@memberjunction/core';
import { ReactBridgeService } from '@memberjunction/ng-react';
import { renderComponentFixture, query, text, capture } from '@memberjunction/ng-test-utils';
import { InteractiveFormComponent } from './interactive-form.component';

/**
 * DOM coverage for <mj-interactive-form> — the host that renders a React-authored form via the React
 * bridge (~11×). The bridge + spec resolution live in ngOnInit (stubbed here) and the React render is a
 * separate concern (mj-react-component stubbed), so these cover the host's own three-way chrome in
 * preview mode: loading (no props yet), the load-error alert (+ LoadErrorChanged output), and mounting
 * the React component once a spec + props exist — plus the record gate.
 */

@Component({ standalone: true, selector: 'mj-react-component', template: '<div class="react-stub"></div>' })
class ReactStub { @Input() component: unknown; @Input() componentProps: unknown;
  @Output() componentEvent = new EventEmitter<unknown>(); @Output() openEntityRecord = new EventEmitter<unknown>(); }
@Component({ standalone: true, selector: 'mj-alert', template: '<ng-content></ng-content>' })
class AlertStub { @Input() Variant = ''; }

const REC = { EntityInfo: { Name: 'Accounts' } } as unknown as BaseEntity;
type OnInitProto = { ngOnInit: () => Promise<void> };

interface State { loadError?: string | null; componentSpec?: unknown; formHostProps?: unknown }
function render(state: State = {}) {
  // ngOnInit awaits super init + the React bridge + spec resolution; skip it and drive state directly.
  vi.spyOn(InteractiveFormComponent.prototype as unknown as OnInitProto, 'ngOnInit').mockResolvedValue(undefined);
  return renderComponentFixture(InteractiveFormComponent, {
    imports: [ReactStub, AlertStub],
    declarations: [InteractiveFormComponent],
    providers: [{ provide: ReactBridgeService, useValue: {} }],
    inputs: { previewMode: true },
    setup: (c) => {
      (c as unknown as { record: BaseEntity }).record = REC;
      if (state.loadError !== undefined) c.loadError = state.loadError;
      if (state.componentSpec !== undefined) (c as unknown as { componentSpec: unknown }).componentSpec = state.componentSpec;
      if (state.formHostProps !== undefined) (c as unknown as { formHostProps: unknown }).formHostProps = state.formHostProps;
    },
  });
}

afterEach(() => vi.restoreAllMocks());

describe('InteractiveFormComponent (DOM)', () => {
  it('shows the loading state when the record is set but the form spec/props are not ready', () => {
    const f = render();
    expect(query(f, '.mj-loading-state')).not.toBeNull();
    expect(query(f, '.react-stub')).toBeNull();
  });

  it('shows the load-error alert when loadError is set', () => {
    const f = render({ loadError: 'Spec failed to load' });
    expect(query(f, 'mj-alert')).not.toBeNull();
    expect(text(f, 'mj-alert')).toContain('Spec failed to load');
    expect(query(f, '.mj-loading-state')).toBeNull();
  });

  it('mounts the React component once a spec + props are available', () => {
    const f = render({ componentSpec: { name: 'Form' }, formHostProps: { record: REC } });
    expect(query(f, '.react-stub')).not.toBeNull();
    expect(query(f, '.mj-loading-state')).toBeNull();
  });

  it('emits LoadErrorChanged when loadError transitions', () => {
    const f = render();
    const out = capture(f.componentInstance.LoadErrorChanged);
    f.componentInstance.loadError = 'boom';
    expect(out).toEqual(['boom']);
  });
});
