import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, Directive, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, capture, StubEmptyStateComponent } from '@memberjunction/ng-test-utils';
import { TestRunDialogComponent } from './test-run-dialog.component';
import { TestingExecutionService } from '../services/testing-execution.service';

/**
 * DOM coverage for <mj-test-run-dialog> — the multi-phase dialog for configuring + running a test or
 * suite (~6×). Test execution + engine/provider wiring live in ngOnInit + the execution service
 * (stubbed); these cover the phase gating (setup vs running/completed progress) driven by public state,
 * the run-mode switch, and the close → PanelClose output. The accordion / alert / empty-state children
 * are stubbed.
 */

@Component({ standalone: true, selector: 'mj-accordion-panel', template: '<ng-content></ng-content>' })
class AccordionStub { @Input() Size = ''; @Input() FlushBody = false; @Input() Expanded = false; @Output() ExpandedChange = new EventEmitter<boolean>(); }
@Directive({ standalone: true, selector: '[mjAccordionTitle]' })
class AccordionTitleStub {}
@Directive({ standalone: true, selector: '[mjAccordionBody]' })
class AccordionBodyStub {}
@Component({ standalone: true, selector: 'mj-alert', template: '<ng-content></ng-content>' })
class AlertStub { @Input() Variant = ''; @Input() Title = ''; }

const CHILDREN = [FormsModule, AccordionStub, AccordionTitleStub, AccordionBodyStub, AlertStub, StubEmptyStateComponent];
type OnInitProto = { ngOnInit: () => Promise<void> };

interface State { isRunning?: boolean; hasCompleted?: boolean }
function render(state: State = {}, inputs: Record<string, unknown> = {}) {
  vi.spyOn(TestRunDialogComponent.prototype as unknown as OnInitProto, 'ngOnInit').mockResolvedValue(undefined);
  return renderComponentFixture(TestRunDialogComponent, {
    imports: CHILDREN,
    declarations: [TestRunDialogComponent],
    providers: [{ provide: TestingExecutionService, useValue: {} }],
    inputs,
    setup: (c) => {
      (c as unknown as { isRunning: boolean }).isRunning = state.isRunning ?? false;
      (c as unknown as { hasCompleted: boolean }).hasCompleted = state.hasCompleted ?? false;
    },
  });
}
type Fx = ReturnType<typeof render>;

afterEach(() => vi.restoreAllMocks());

describe('TestRunDialogComponent (DOM)', () => {
  it('renders the setup phase (no progress) by default', () => {
    const f = render();
    expect(query(f, '.test-run-dialog')).not.toBeNull();
    expect(query(f, '.progress-container')).toBeNull();
  });

  it('shows the progress view once running', () => {
    const f = render({ isRunning: true });
    expect(query(f, '.progress-container')).not.toBeNull();
  });

  it('shows the progress/results view once completed', () => {
    expect(query(render({ hasCompleted: true }), '.progress-container')).not.toBeNull();
  });

  it('switches the run mode when setRunMode is called', () => {
    const f = render();
    f.componentInstance.setRunMode('suite');
    expect(f.componentInstance.runMode).toBe('suite');
  });

  it('emits PanelClose when onClose is invoked', () => {
    const f = render();
    const out = capture(f.componentInstance.PanelClose);
    f.componentInstance.onClose();
    expect(out.length).toBe(1);
  });
});
