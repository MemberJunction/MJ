import { describe, it, expect } from 'vitest';
import { Component, Input, forwardRef } from '@angular/core';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { TextImportDialogComponent } from './text-import-dialog.component';

/**
 * DOM coverage for <app-text-import-dialog> — pastes/validates a component-spec JSON and emits
 * importSpec (or shows an error), plus cancelDialog. The heavy CodeMirror <mj-code-editor> is
 * replaced with a minimal ControlValueAccessor stub so [(ngModel)] binds; componentJson is driven
 * on the instance directly. Default CD → detectChanges after click handlers.
 */

@Component({
  standalone: true,
  selector: 'mj-code-editor',
  template: '',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CodeEditorStub), multi: true }],
})
class CodeEditorStub implements ControlValueAccessor {
  @Input() language = '';
  @Input() autoFocus = false;
  @Input() indentWithTab = false;
  @Input() readonly = false;
  @Input() placeholder = '';
  writeValue(): void {}
  registerOnChange(): void {}
  registerOnTouched(): void {}
  setDisabledState(): void {}
}

const render = () =>
  renderComponentFixture(TextImportDialogComponent, {
    imports: [FormsModule, MJButtonDirective, CodeEditorStub],
    declarations: [TextImportDialogComponent],
  });

const importBtn = (f: ReturnType<typeof render>) => queryAll(f, 'button').find((b) => b.textContent?.includes('Import')) as HTMLButtonElement;
const cancelBtn = (f: ReturnType<typeof render>) => queryAll(f, 'button').find((b) => b.textContent?.trim() === 'Cancel') as HTMLButtonElement;

describe('TextImportDialogComponent (DOM)', () => {
  it('renders the dialog header', () => {
    expect(text(render(), '.dialog-header h3')).toBe('Import Component from Text');
  });

  it('disables the Import button when the JSON is empty', () => {
    expect(importBtn(render()).disabled).toBe(true);
  });

  it('enables the Import button once JSON is entered', () => {
    const fixture = render();
    fixture.componentInstance.componentJson = '{}';
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(importBtn(fixture).disabled).toBe(false);
  });

  it('emits importSpec with the parsed spec for valid JSON', () => {
    const fixture = render();
    const imported = capture(fixture.componentInstance.importSpec);
    fixture.componentInstance.componentJson = JSON.stringify({ name: 'MyCmp', code: 'export default 1;' });
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    importBtn(fixture).click();
    expect(imported.length).toBe(1);
    expect((imported[0] as { name: string }).name).toBe('MyCmp');
  });

  it('shows an error for invalid JSON and does not emit', () => {
    const fixture = render();
    const imported = capture(fixture.componentInstance.importSpec);
    fixture.componentInstance.componentJson = 'not-json';
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    importBtn(fixture).click();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(query(fixture, '.error-message')?.textContent).toContain('Invalid JSON');
    expect(imported.length).toBe(0);
  });

  it('shows an error when required fields are missing', () => {
    const fixture = render();
    fixture.componentInstance.componentJson = JSON.stringify({ name: 'NoCode' });
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    importBtn(fixture).click();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(query(fixture, '.error-message')?.textContent).toContain('missing required fields');
  });

  it('emits cancelDialog when Cancel is clicked', () => {
    const fixture = render();
    const cancelled = capture(fixture.componentInstance.cancelDialog);
    cancelBtn(fixture).click();
    expect(cancelled.length).toBe(1);
  });
});
