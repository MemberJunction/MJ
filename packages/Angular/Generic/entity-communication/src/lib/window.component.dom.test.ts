import { describe, it, expect } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import { EntityCommunicationsPreviewWindowComponent } from './window.component';

/**
 * DOM-level spec for <mj-entity-communications-preview-window>.
 *
 * This is a module-declared (standalone:false) wrapper whose template's entire job is:
 *   - gate a <mj-window> behind `@if (DialogVisible)`
 *   - forward sizing/title inputs to that window
 *   - wire OnCancel/OnOK -> DialogClosed @Output
 *
 * The real <mj-window> and <mj-entity-communications-preview> children are replaced with
 * lightweight stubs (matching selectors + the inputs the template binds) so the test
 * isolates THIS component's gating + output contract without pulling their dependency
 * graphs. The (Close) output is on the real window; OnCancel/OnOK are exercised directly.
 */

@Component({ standalone: false, selector: 'mj-window', template: '<ng-content></ng-content>' })
class MjWindowStub {
  @Input() Visible = false;
  @Input() Width = 0;
  @Input() Height = 0;
  @Input() MinWidth = 0;
  @Input() MinHeight = 0;
  @Input() Title = '';
  @Input() Resizable = false;
  @Output() Close = new EventEmitter<void>();
}

@Component({ standalone: false, selector: 'mj-entity-communications-preview', template: '' })
class PreviewStub {
  @Input() entityInfo: unknown;
  @Input() runViewParams: unknown;
}

describe('EntityCommunicationsPreviewWindowComponent (DOM)', () => {
  function render(inputs: Record<string, unknown> = {}): ComponentFixture<EntityCommunicationsPreviewWindowComponent> {
    return renderComponentFixture(EntityCommunicationsPreviewWindowComponent, {
      declarations: [EntityCommunicationsPreviewWindowComponent, MjWindowStub, PreviewStub],
      inputs,
    });
  }

  it('does not render the window when DialogVisible is false (default)', () => {
    const f = render();
    expect(query(f, 'mj-window')).toBeNull();
  });

  it('renders the window (and its preview child) when DialogVisible is true', () => {
    const f = render({ DialogVisible: true });
    expect(query(f, 'mj-window')).not.toBeNull();
    expect(query(f, 'mj-entity-communications-preview')).not.toBeNull();
  });

  it('forwards Title / sizing inputs to the window', () => {
    const f = render({ DialogVisible: true, Title: 'My Preview', Width: 800, Height: 700 });
    const win = query(f, 'mj-window');
    expect(win).not.toBeNull();
    const stub = f.debugElement.query(By.directive(MjWindowStub)).componentInstance as MjWindowStub;
    expect(stub.Title).toBe('My Preview');
    expect(stub.Width).toBe(800);
    expect(stub.Height).toBe(700);
    expect(stub.Visible).toBe(true);
  });

  // OnCancel/OnOK flip DialogVisible. Asserting state after a programmatic call WITHOUT a
  // re-render avoids the zoneless NG0100 trap (mutate-then-detectChanges); the re-render
  // contract (window disappears) is covered by the DOM-event test below, which drives the
  // change through a real (Close) event that marks the view dirty the zoneless-correct way.
  it('OnCancel hides the dialog flag and emits DialogClosed(false)', () => {
    const f = render({ DialogVisible: true });
    const closed = capture(f.componentInstance.DialogClosed);

    f.componentInstance.OnCancel();

    expect(closed).toEqual([false]);
    expect(f.componentInstance.DialogVisible).toBe(false);
  });

  it('OnOK hides the dialog flag and emits DialogClosed(true)', () => {
    const f = render({ DialogVisible: true });
    const closed = capture(f.componentInstance.DialogClosed);

    f.componentInstance.OnOK();

    expect(closed).toEqual([true]);
    expect(f.componentInstance.DialogVisible).toBe(false);
  });

  it('window (Close) event invokes OnCancel -> emits DialogClosed(false) and removes the window', () => {
    const f = render({ DialogVisible: true });
    const closed = capture(f.componentInstance.DialogClosed);

    const win = f.debugElement.query(By.directive(MjWindowStub)).componentInstance as MjWindowStub;
    win.Close.emit(); // real output event marks the view dirty -> clean re-render
    f.detectChanges();

    expect(closed).toEqual([false]);
    expect(query(f, 'mj-window')).toBeNull();
  });
});
