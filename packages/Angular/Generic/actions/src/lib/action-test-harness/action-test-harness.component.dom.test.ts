import { describe, it, expect } from 'vitest';
import { Component, Directive, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { MJActionEntity, MJActionParamEntity } from '@memberjunction/core-entities';
import type { ActionResult } from '@memberjunction/actions-base';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
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

const CHILDREN = [FormsModule, AccordionStub, AccordionTitleStub, AccordionBodyStub, AlertStub];
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

  it('re-initializes the parameter model and clears results on ResetParams', () => {
    const f = render({ ExecutionResult: { Success: true } as unknown as ActionResult });
    f.componentInstance.ResetParams();
    f.detectChanges(false);
    expect(f.componentInstance.ExecutionResult).toBeNull();
    expect(f.componentInstance.ParamValues.length).toBe(2);
  });
});
