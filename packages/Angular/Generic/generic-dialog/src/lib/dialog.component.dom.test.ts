import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MJButtonDirective, MJDialogComponent, MJDialogActionsComponent } from '@memberjunction/ng-ui-components';
import { renderTemplate, query, queryAll, text, click } from '@memberjunction/ng-test-utils';
import { GenericDialogComponent } from './dialog.component';

// GenericDialogComponent is a module-declared (standalone:false) compound component
// that projects content via <ng-content> and wraps mj-dialog from ng-ui-components.
// mj-dialog renders inline into the fixture DOM (no CDK overlay), so the whole surface
// is honestly DOM-testable. See guides/ANGULAR_TESTING_GUIDE.md.

const DECLARATIONS = [GenericDialogComponent];
const IMPORTS = [CommonModule, MJButtonDirective, MJDialogComponent, MJDialogActionsComponent];

async function render(markup: string): Promise<ComponentFixture<unknown>> {
  return renderTemplate(markup, { imports: IMPORTS, declarations: DECLARATIONS });
}

describe('GenericDialogComponent (DOM)', () => {
  describe('@if (DialogVisible) gating', () => {
    it('renders nothing when DialogVisible is false', async () => {
      const fixture = await render(`<mj-generic-dialog [DialogVisible]="false"></mj-generic-dialog>`);
      expect(query(fixture, 'mj-dialog')).toBeNull();
      expect(query(fixture, '.mj-dialog-container')).toBeNull();
    });

    it('renders the dialog container when DialogVisible is true', async () => {
      const fixture = await render(`<mj-generic-dialog [DialogVisible]="true"></mj-generic-dialog>`);
      expect(query(fixture, 'mj-dialog')).not.toBeNull();
      expect(query(fixture, '.mj-dialog-container')).not.toBeNull();
    });
  });

  describe('DialogTitle binding', () => {
    it('renders the provided title in the dialog title bar', async () => {
      const fixture = await render(`<mj-generic-dialog [DialogVisible]="true" DialogTitle="My Custom Title"></mj-generic-dialog>`);
      expect(text(fixture, '.mj-dialog-title')).toBe('My Custom Title');
    });
  });

  describe('OK / Cancel button gating and text', () => {
    it('renders both built-in buttons by default with default labels', async () => {
      const fixture = await render(`<mj-generic-dialog [DialogVisible]="true"></mj-generic-dialog>`);
      const labels = queryAll(fixture, 'mj-dialog-actions button').map((b) => b.textContent?.trim());
      expect(labels).toEqual(['OK', 'Cancel']);
    });

    it('honors custom OK and Cancel button text', async () => {
      const fixture = await render(`<mj-generic-dialog [DialogVisible]="true" OKButtonText="Save" CancelButtonText="Discard"></mj-generic-dialog>`);
      const labels = queryAll(fixture, 'mj-dialog-actions button').map((b) => b.textContent?.trim());
      expect(labels).toEqual(['Save', 'Discard']);
    });

    it('hides the OK button when ShowOKButton is false', async () => {
      const fixture = await render(`<mj-generic-dialog [DialogVisible]="true" [ShowOKButton]="false"></mj-generic-dialog>`);
      const labels = queryAll(fixture, 'mj-dialog-actions button').map((b) => b.textContent?.trim());
      expect(labels).toEqual(['Cancel']);
    });

    it('hides the Cancel button when ShowCancelButton is false', async () => {
      const fixture = await render(`<mj-generic-dialog [DialogVisible]="true" [ShowCancelButton]="false"></mj-generic-dialog>`);
      const labels = queryAll(fixture, 'mj-dialog-actions button').map((b) => b.textContent?.trim());
      expect(labels).toEqual(['OK']);
    });

    it('shows the empty-actions fallback message when all built-in buttons are off and no custom actions exist', async () => {
      const fixture = await render(`<mj-generic-dialog [DialogVisible]="true" [ShowOKButton]="false" [ShowCancelButton]="false"></mj-generic-dialog>`);
      expect(queryAll(fixture, 'mj-dialog-actions button')).toHaveLength(0);
      expect(text(fixture, 'mj-dialog-actions span')).toContain('No actions available');
    });
  });

  describe('custom-actions slot projection', () => {
    it('projects [custom-actions] content into the actions footer', async () => {
      const fixture = await render(
        `<mj-generic-dialog [DialogVisible]="true" [ShowOKButton]="false" [ShowCancelButton]="false">
           <button custom-actions class="my-custom-btn">Do Thing</button>
         </mj-generic-dialog>`,
      );
      const projected = query(fixture, 'mj-dialog-actions .my-custom-btn');
      expect(projected).not.toBeNull();
      expect(projected?.textContent?.trim()).toBe('Do Thing');
    });

    // NOTE: HasCustomActions is driven by `@ContentChild('custom-actions')`, which only
    // matches a template reference variable named `custom-actions`. Angular ref names cannot
    // contain a hyphen, so `#custom-actions` is a compile error and that ContentChild can
    // never actually match — HasCustomActions is effectively always false (a latent quirk of
    // the component). There is no honest way to exercise the suppress-fallback branch from a
    // template, so it is intentionally not tested here.
  });

  describe('content projection', () => {
    it('projects default body content into the dialog body', async () => {
      const fixture = await render(`<mj-generic-dialog [DialogVisible]="true"><p class="body-content">Hello body</p></mj-generic-dialog>`);
      expect(text(fixture, '.mj-dialog-body .body-content')).toBe('Hello body');
    });
  });

  // A typed host lets us capture (DialogClosed) and observe the dialog hiding. DialogVisible
  // is a ONE-WAY @Input (there is no DialogVisibleChange output), so the component cannot
  // write the flag back — instead the parent clears its own flag in the (DialogClosed)
  // handler, which is exactly the documented usage. Driving via real DOM clicks keeps it
  // NG0100-safe.
  @Component({
    standalone: false,
    template: `<mj-generic-dialog [DialogVisible]="visible" (DialogClosed)="onClosed($event)"></mj-generic-dialog>`,
  })
  class DialogHostComponent {
    visible = true;
    closedWith: boolean[] = [];
    onClosed(result: boolean): void {
      this.closedWith.push(result);
      this.visible = false;
    }
  }

  async function renderHost(): Promise<ComponentFixture<DialogHostComponent>> {
    TestBed.configureTestingModule({
      imports: IMPORTS,
      declarations: [GenericDialogComponent, DialogHostComponent],
    });
    const fixture = TestBed.createComponent(DialogHostComponent);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    return fixture;
  }

  describe('(DialogClosed) emission and visibility toggle', () => {
    it('emits true and hides the dialog when OK is clicked', async () => {
      const fixture = await renderHost();
      const ok = queryAll(fixture, 'mj-dialog-actions button').find((b) => b.textContent?.trim() === 'OK');
      (ok as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(fixture.componentInstance.closedWith).toEqual([true]);
      expect(fixture.componentInstance.visible).toBe(false);
      expect(query(fixture, 'mj-dialog')).toBeNull();
    });

    it('emits false and hides the dialog when Cancel is clicked', async () => {
      const fixture = await renderHost();
      const cancel = queryAll(fixture, 'mj-dialog-actions button').find((b) => b.textContent?.trim() === 'Cancel');
      (cancel as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(fixture.componentInstance.closedWith).toEqual([false]);
      expect(fixture.componentInstance.visible).toBe(false);
      expect(query(fixture, 'mj-dialog')).toBeNull();
    });

    it('emits false when the dialog requests close via its (Close) output (backdrop/escape path)', async () => {
      const fixture = await renderHost();
      // mj-dialog emits Close on backdrop click / escape; GenericDialog wires that to HandleCancelClick.
      click(fixture, '.mj-dialog-backdrop');
      await fixture.whenStable();
      expect(fixture.componentInstance.closedWith).toEqual([false]);
      expect(fixture.componentInstance.visible).toBe(false);
    });
  });
});
