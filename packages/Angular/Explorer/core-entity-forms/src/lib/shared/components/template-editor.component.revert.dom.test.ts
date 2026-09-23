/**
 * When a host form discards its edit, `BaseFormComponent.CancelEdit()` reverts every pending record
 * (including the contents this editor handed over via `getPendingChanges()`) and broadcasts
 * REVERT_PENDING_CHANGES. The editor must reload its rows from the saved state on that event, so the
 * screen stops showing discarded text and the dirty flag clears; otherwise the next save fails on a
 * row the user believes they threw away. It must react only to a form it sits inside.
 *
 * Class-behaviour spec: the editor is constructed in an injection context with a real DOM element,
 * nested inside (or beside) the element the fake form event carries, and `refreshAndDiscardChanges`
 * is spied so no data load runs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IMJComponent, MJEventType, MJGlobal } from '@memberjunction/global';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { BaseFormComponentEventCodes, FormEditingCompleteEvent } from '@memberjunction/ng-base-types';
import { TemplateEditorComponent } from './template-editor.component';

function makeEditor(hostElement: HTMLElement): TemplateEditorComponent {
  const editorElement = document.createElement('div');
  hostElement.appendChild(editorElement);
  TestBed.configureTestingModule({
    providers: [{ provide: ElementRef, useValue: new ElementRef(editorElement) }],
  });
  const editor = TestBed.runInInjectionContext(
    () => new TemplateEditorComponent({} as MJNotificationService, {} as MJConfirmService)
  );
  editor.template = null; // ngOnInit then skips the content load
  return editor;
}

function raiseFormEvent(formElement: HTMLElement, subEventCode: string): void {
  const event = new FormEditingCompleteEvent();
  event.elementRef = new ElementRef(formElement);
  event.subEventCode = subEventCode;
  MJGlobal.Instance.RaiseEvent({
    event: MJEventType.ComponentEvent,
    eventCode: BaseFormComponentEventCodes.BASE_CODE,
    args: event,
    component: {} as IMJComponent, // the sender; the editor keys on elementRef, not on this
  });
}

describe('TemplateEditorComponent reacts to the host form discarding its edit', () => {
  let formElement: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    // ngOnInit's content-type lookup has no template engine here; it logs and falls back, by design.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    formElement = document.createElement('form');
    document.body.appendChild(formElement);
  });

  it('reloads its rows when the form it sits inside reverts pending changes', async () => {
    const editor = makeEditor(formElement);
    const reload = vi.spyOn(editor, 'refreshAndDiscardChanges').mockResolvedValue();
    await editor.ngOnInit();

    raiseFormEvent(formElement, BaseFormComponentEventCodes.REVERT_PENDING_CHANGES);

    expect(reload).toHaveBeenCalledTimes(1);
    editor.ngOnDestroy();
  });

  it('ignores a revert from a form it is not inside, and other form events from its own form', async () => {
    const editor = makeEditor(formElement);
    const reload = vi.spyOn(editor, 'refreshAndDiscardChanges').mockResolvedValue();
    await editor.ngOnInit();

    const otherForm = document.createElement('form');
    document.body.appendChild(otherForm);
    raiseFormEvent(otherForm, BaseFormComponentEventCodes.REVERT_PENDING_CHANGES);
    raiseFormEvent(formElement, BaseFormComponentEventCodes.EDITING_COMPLETE);

    expect(reload).not.toHaveBeenCalled();
    editor.ngOnDestroy();
  });

  it('stops listening once destroyed', async () => {
    const editor = makeEditor(formElement);
    const reload = vi.spyOn(editor, 'refreshAndDiscardChanges').mockResolvedValue();
    await editor.ngOnInit();
    editor.ngOnDestroy();

    raiseFormEvent(formElement, BaseFormComponentEventCodes.REVERT_PENDING_CHANGES);

    expect(reload).not.toHaveBeenCalled();
  });
});
