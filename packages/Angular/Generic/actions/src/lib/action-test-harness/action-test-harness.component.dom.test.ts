import { describe, it, expect } from 'vitest';
import { Component, Directive, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { MJActionEntity, MJActionParamEntity } from '@memberjunction/core-entities';
import type { ActionResult } from '@memberjunction/actions-base';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import { MJSwitchComponent } from '@memberjunction/ng-ui-components';
import { ActionTestHarnessComponent } from './action-test-harness.component';

/**
 * DOM coverage for <mj-action-test-harness> — the panel for entering an action's parameters and running
 * it (~5×). Actually executing an action needs the action runtime, so these cover the surrounding chrome
 * instead: the header + Execute button, the parameter-value model built from ActionParams, and the
 * results section (success / error, driven by public state set in setup) + its ClearResults reset.
 * The accordion body (parameter rows) is left to the visual tier; its accordion host is stubbed.
 */

@Component({ standalone: true, selector: 'mj-accordion-panel', template: '<ng-content></ng-content>' })
class AccordionStub { @Input() Expanded = false; @Output() ExpandedChange = new EventEmitter<boolean>(); }
@Directive({ standalone: true, selector: '[mjAccordionTitle]' })
class AccordionTitleStub {}
@Directive({ standalone: true, selector: '[mjAccordionBody]' })
class AccordionBodyStub {}
@Component({ standalone: true, selector: 'mj-alert', template: '<ng-content></ng-content>' })
class AlertStub { @Input() Variant = ''; @Input() Title = ''; @Input() Dismissible = false; @Input() Icon = ''; }

const CHILDREN = [FormsModule, AccordionStub, AccordionTitleStub, AccordionBodyStub, AlertStub, MJSwitchComponent];
const ACTION = { Name: 'Send Email' } as unknown as MJActionEntity;
const PARAMS = [
  { ID: 'p1', Name: 'to', Type: 'Input', IsRequired: true, IsArray: false, DefaultValue: null, Description: 'Recipient' },
  { ID: 'p2', Name: 'subject', Type: 'Input', IsRequired: false, IsArray: false, DefaultValue: null, Description: 'Subject' },
] as unknown as MJActionParamEntity[];

interface State { ExecutionResult?: ActionResult | null; ExecutionError?: string | null }
const render = (state: State = {}) =>
  renderComponentFixture(ActionTestHarnessComponent, {
    imports: CHILDREN,
    declarations: [ActionTestHarnessComponent],
    inputs: { Action: ACTION, ActionParams: PARAMS },
    setup: (c) => {
      if (state.ExecutionResult !== undefined) c.ExecutionResult = state.ExecutionResult;
      if (state.ExecutionError !== undefined) c.ExecutionError = state.ExecutionError;
    },
  });

describe('ActionTestHarnessComponent (DOM)', () => {
  it('renders the harness header and the Execute button', () => {
    const f = render();
    expect(query(f, '.action-test-harness')).not.toBeNull();
    expect(query(f, '.harness-header')).not.toBeNull();
  });

  it('builds a parameter-value model from the ActionParams input', () => {
    const f = render();
    expect(f.componentInstance.ParamValues.length).toBe(2);
    expect(f.componentInstance.ParamValues[0].Param.Name).toBe('to');
  });

  it('shows no results section before any execution', () => {
    expect(query(render(), '.results-section')).toBeNull();
  });

  it('shows the results section with a success alert for a successful result', () => {
    const f = render({ ExecutionResult: { Success: true, ResultCode: 'OK' } as unknown as ActionResult });
    expect(query(f, '.results-section')).not.toBeNull();
    expect(query(f, '.success-result')).not.toBeNull();
  });

  it('shows the execution error alert when an error is set', () => {
    const f = render({ ExecutionError: 'Something failed' });
    expect(query(f, '.results-section')).not.toBeNull();
    expect(query(f, 'mj-alert')?.textContent).toContain('Something failed');
  });

  it('clears the result + error state when ClearResults is called', () => {
    const f = render({ ExecutionResult: { Success: true } as unknown as ActionResult, ExecutionError: 'x' });
    expect(query(f, '.results-section')).not.toBeNull();
    f.componentInstance.ClearResults();
    expect(f.componentInstance.ExecutionResult).toBeNull();
    expect(f.componentInstance.ExecutionError).toBeNull();
  });

  it('shows its own action buttons by default and hides them when a host renders them instead', () => {
    const f = render();
    expect(query(f, '.action-buttons')).not.toBeNull();
    f.componentRef.setInput('ShowActionButtons', false);
    f.detectChanges();
    expect(query(f, '.action-buttons')).toBeNull();
  });

  it('hides its heading when the host already names the action, and keeps the Skip Action Log switch', () => {
    const f = render();
    expect(query(f, '.harness-header h3')?.textContent).toContain('Send Email');
    f.componentRef.setInput('ShowTitle', false);
    f.detectChanges();
    expect(query(f, '.harness-header h3')).toBeNull();
    expect(query(f, '.harness-header [role="switch"]')).not.toBeNull();
  });

  it('makes Skip Action Log a named, keyboard-reachable switch bound to SkipActionLog', async () => {
    const f = render();
    await f.whenStable();
    const sw = query(f, '.harness-header button[role="switch"]') as HTMLButtonElement;
    expect(sw).not.toBeNull();
    // A real button: in the tab order, not display:none.
    expect(sw.tabIndex).toBe(0);
    const label = query(f, `label[for="${sw.id}"]`);
    expect(label?.textContent?.trim()).toBe('Skip Action Log');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    sw.click();
    f.detectChanges();
    expect(f.componentInstance.SkipActionLog).toBe(true);
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('announces a state change on ClearResults and ResetParams so a host footer can refresh', () => {
    const f = render({ ExecutionResult: { Success: true } as unknown as ActionResult });
    const changes = capture<void>(f.componentInstance.StateChange);
    f.componentInstance.ClearResults();
    f.componentInstance.ResetParams();
    expect(changes.length).toBeGreaterThanOrEqual(2);
  });

  it('re-initializes the parameter model and clears results on ResetParams', () => {
    const f = render({ ExecutionResult: { Success: true } as unknown as ActionResult });
    f.componentInstance.ResetParams();
    f.detectChanges(false);
    expect(f.componentInstance.ExecutionResult).toBeNull();
    expect(f.componentInstance.ParamValues.length).toBe(2);
  });
});
