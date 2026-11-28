import { describe, it, expect, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { renderComponentFixture, query, text, capture, click } from '@memberjunction/ng-test-utils';
import { MJDialogComponent, MJDialogActionsComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { ActionTestHarnessComponent } from '../action-test-harness/action-test-harness.component';
import { ActionTestHarnessDialogComponent } from './action-test-harness-dialog.component';

/**
 * These specs cover only the dialog WRAPPER's data-free surface: open/close gating,
 * header-title fallback, and Close emission. When an Action is bound the wrapper
 * projects the data-bound <mj-action-test-harness> child (GraphQL/UserInfoEngine
 * coupled) — that path is deferred to the harness's own coverage / a live test, so
 * we never bind Action here. The wrapper is the shared mj-dialog (full-screen on phones), so the
 * chrome is asserted through its markup.
 */
const baseImports = [CommonModule, FormsModule, MJDialogComponent, MJDialogActionsComponent, MJButtonDirective];
const baseDeclarations = [ActionTestHarnessDialogComponent];

describe('ActionTestHarnessDialogComponent (DOM)', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders nothing when IsOpen is false', () => {
    const fixture = renderComponentFixture(ActionTestHarnessDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: false },
    });
    expect(query(fixture, '.mj-dialog-container')).toBeNull();
  });

  it('renders the dialog chrome when IsOpen is true', () => {
    const fixture = renderComponentFixture(ActionTestHarnessDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true },
    });
    expect(query(fixture, '.mj-dialog-backdrop')).not.toBeNull();
    expect(query(fixture, '.mj-dialog-container')?.getAttribute('role')).toBe('dialog');
  });

  it('shows the generic title and a loading state when no Action is bound', () => {
    const fixture = renderComponentFixture(ActionTestHarnessDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true },
    });
    expect(text(fixture, '.mj-dialog-title')).toBe('Action Test Harness');
    expect(query(fixture, '.loading-state')).not.toBeNull();
    // child harness must NOT render without an Action
    expect(query(fixture, 'mj-action-test-harness')).toBeNull();
  });

  /** The footer's buttons, label and disabled state, in order. */
  const footer = (fixture: ReturnType<typeof renderComponentFixture<ActionTestHarnessDialogComponent>>) =>
    Array.from(fixture.nativeElement.querySelectorAll('mj-dialog-actions button') as NodeListOf<HTMLButtonElement>)
      .map((b) => [b.textContent!.replace(/\s+/g, ' ').trim(), b.disabled]);

  it('puts the harness actions in the footer, primary first, with no Close (the header close is the one way out)', () => {
    const fixture = renderComponentFixture(ActionTestHarnessDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true },
    });
    expect(footer(fixture)).toEqual([['Execute Action', true], ['Reset', true]]);
  });

  it('reads the footer state from the harness and routes its buttons to the harness', () => {
    const dialog = Object.create(ActionTestHarnessDialogComponent.prototype) as ActionTestHarnessDialogComponent;
    const calls: string[] = [];
    const harness = {
      IsExecuting: false, ExecutionResult: null, ExecutionError: null,
      ExecuteAction: async () => { calls.push('execute'); }, ResetParams: () => calls.push('reset'), ClearResults: () => calls.push('clear'),
    } as unknown as ActionTestHarnessComponent;
    Object.assign(dialog, { Harness: harness, cdr: { markForCheck: () => undefined }, _action: { Status: 'Active' } });
    expect([dialog.CanRun, dialog.IsRunning, dialog.HasResults]).toEqual([true, false, false]);
    Object.assign(harness, { IsExecuting: true });
    expect([dialog.CanRun, dialog.IsRunning]).toEqual([false, true]);
    Object.assign(harness, { IsExecuting: false, ExecutionError: 'boom' });
    expect(dialog.HasResults).toBe(true);
    Object.assign(dialog, { _action: { Status: 'Disabled' } });
    expect(dialog.CanRun).toBe(false);
    dialog.RunAction(); dialog.ResetHarness(); dialog.ClearHarnessResults();
    expect(calls).toEqual(['execute', 'reset', 'clear']);
  });

  it('keeps its 700px desktop width and goes full-screen on phones', () => {
    const fixture = renderComponentFixture(ActionTestHarnessDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true },
    });
    const dialog = fixture.debugElement.query(By.directive(MJDialogComponent)).componentInstance as MJDialogComponent;
    expect(dialog.ResolvedWidth).toBe('700px');
    expect(dialog.PhoneMode).toBe('full');
  });

  describe('harness lifetime', () => {
    /** Stands in for the data-bound harness: same selector and inputs, counts its instances. */
    @Component({ standalone: false, selector: 'mj-action-test-harness', template: '' })
    class HarnessStub {
      static Created = 0;
      @Input() Action: unknown;
      @Input() ActionParams: unknown;
      @Input() ShowActionButtons = true;
      @Input() ShowTitle = true;
      @Output() StateChange = new EventEmitter<void>();
      @Output() ExecutionComplete = new EventEmitter<unknown>();
      constructor() { HarnessStub.Created++; }
    }

    const render = (isOpen: boolean) => {
      HarnessStub.Created = 0;
      return renderComponentFixture(ActionTestHarnessDialogComponent, {
        imports: baseImports,
        declarations: [...baseDeclarations, HarnessStub],
        inputs: { IsOpen: isOpen, Action: { Name: 'Send Email', Status: 'Active' } },
      });
    };

    it('does not build the harness while the dialog is closed', () => {
      render(false);
      expect(HarnessStub.Created).toBe(0);
    });

    it('builds a fresh harness each time the dialog opens, so a reopen starts clean', () => {
      const fixture = render(true);
      expect(HarnessStub.Created).toBe(1);
      fixture.componentRef.setInput('IsOpen', false);
      fixture.detectChanges();
      fixture.componentRef.setInput('IsOpen', true);
      fixture.detectChanges();
      expect(HarnessStub.Created).toBe(2);
    });

    it('hides the harness heading, since the dialog title already names the action', () => {
      const fixture = render(true);
      const stub = fixture.debugElement.query(By.directive(HarnessStub)).componentInstance as HarnessStub;
      expect(stub.ShowTitle).toBe(false);
    });
  });

  it('emits Close when the header close button is clicked', () => {
    const fixture = renderComponentFixture(ActionTestHarnessDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true },
    });
    const emitted = capture<void>(fixture.componentInstance.Close);
    click(fixture, '.mj-dialog-close');
    expect(emitted).toHaveLength(1);
  });
});
