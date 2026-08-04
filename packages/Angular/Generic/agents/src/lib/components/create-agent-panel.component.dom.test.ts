import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, Directive, EventEmitter, Input, Output } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { renderComponentFixture, query, capture, StubEmptyStateComponent } from '@memberjunction/ng-test-utils';
import { CreateAgentPanelComponent } from './create-agent-panel.component';

/**
 * DOM coverage for <mj-create-agent-panel> — the reactive-form panel for creating an agent (~6×). Its
 * loadData() pulls agent types + prompts/actions from AIEngineBase + a provider, so it's stubbed (it
 * only flips IsLoading here). The accordion / alert / empty-state children are stubbed. Covers the
 * loading gate, the form fields, the required-name validation message, the advanced-config accordion
 * wiring, and Cancel → Cancelled.
 */

@Component({ standalone: true, selector: 'mj-accordion-panel', template: '<ng-content></ng-content>' })
class AccordionStub {
  @Input() Size = '';
  @Input() FlushBody = false;
  @Input() Expanded = false;
  @Output() ExpandedChange = new EventEmitter<boolean>();
}
@Directive({ standalone: true, selector: '[mjAccordionTitle]' })
class AccordionTitleStub {}
@Directive({ standalone: true, selector: '[mjAccordionBody]' })
class AccordionBodyStub {}
@Component({ standalone: true, selector: 'mj-alert', template: '<ng-content></ng-content>' })
class AlertStub {
  @Input() Variant = '';
  @Input() Dismissible = false;
  @Input() Icon = '';
  @Output() Dismissed = new EventEmitter<void>();
}

const CHILDREN = [ReactiveFormsModule, AccordionStub, AccordionTitleStub, AccordionBodyStub, AlertStub, StubEmptyStateComponent];
type LoadDataProto = { loadData: () => Promise<void> };

/** Stub the provider/engine-backed loadData; `finishLoad` controls whether it clears IsLoading. */
function stubLoad(finishLoad = true): void {
  vi.spyOn(CreateAgentPanelComponent.prototype as unknown as LoadDataProto, 'loadData').mockImplementation(async function (this: CreateAgentPanelComponent) {
    if (finishLoad) this.IsLoading = false;
  });
}

const render = () =>
  renderComponentFixture(CreateAgentPanelComponent, {
    imports: CHILDREN,
    declarations: [CreateAgentPanelComponent],
    providers: [provideNoopAnimations()], // template uses @fadeIn / @slideDown triggers
    inputs: {},
  });
type Fx = ReturnType<typeof render>;

afterEach(() => vi.restoreAllMocks());

describe('CreateAgentPanelComponent (DOM)', () => {
  it('shows the loading state while data is loading', () => {
    stubLoad(false); // leave IsLoading true
    expect(query(render(), '.cap-loading')).not.toBeNull();
  });

  it('renders the create form once loading completes', () => {
    stubLoad();
    const f = render();
    expect(query(f, 'form.cap-form')).not.toBeNull();
    expect(query(f, 'input[formControlName="name"]')).not.toBeNull();
    expect(query(f, 'select[formControlName="typeId"]')).not.toBeNull();
  });

  it('shows the required-name validation message when the name is touched and empty', () => {
    stubLoad();
    const f = render();
    f.componentInstance.Form.get('name')?.markAsTouched();
    f.detectChanges(false);
    expect(query(f, '.cap-field-error')).not.toBeNull();
  });

  it('wires the advanced-config accordion to ShowAdvancedConfig and updates it on ExpandedChange', () => {
    stubLoad();
    const f = render();
    f.componentInstance.OnAdvancedConfigExpandedChange(true);
    expect(f.componentInstance.ShowAdvancedConfig).toBe(true);
  });

  it('emits Cancelled when the Cancel button is clicked', () => {
    stubLoad();
    const f = render();
    const out = capture(f.componentInstance.Cancelled);
    (query(f, '.cap-btn-secondary') as HTMLElement).click();
    expect(out.length).toBe(1);
  });
});
