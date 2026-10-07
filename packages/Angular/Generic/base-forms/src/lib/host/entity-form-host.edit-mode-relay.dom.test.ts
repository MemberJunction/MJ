import { describe, it, expect } from 'vitest';
import { EventEmitter } from '@angular/core';
import { MjEntityFormHostComponent } from './entity-form-host.component';

/**
 * The host re-emits the form's EditModeChanged so the Explorer wrapper
 * (SingleRecordComponent) can bind it in its template without reaching into
 * the live form. Tested through subscribeToFormEvents with a fake form: a real
 * mount needs metadata, and the relay is the only thing under test here.
 */
type FakeForm = {
  Navigate: EventEmitter<unknown>;
  Notification: EventEmitter<unknown>;
  RecordSaved: EventEmitter<unknown>;
  RecordRefreshed: EventEmitter<{ Record: unknown }>;
  RecordDeleted: EventEmitter<unknown>;
  RecordSaveFailed: EventEmitter<unknown>;
  ValidationFailed: EventEmitter<unknown>;
  RecordReady: EventEmitter<unknown>;
  EditModeChanged: EventEmitter<boolean>;
  EditMode: boolean;
};

function fakeForm(editMode = false): FakeForm {
  return {
    Navigate: new EventEmitter(),
    Notification: new EventEmitter(),
    RecordSaved: new EventEmitter(),
    RecordRefreshed: new EventEmitter(),
    RecordDeleted: new EventEmitter(),
    RecordSaveFailed: new EventEmitter(),
    ValidationFailed: new EventEmitter(),
    RecordReady: new EventEmitter(),
    EditModeChanged: new EventEmitter<boolean>(),
    EditMode: editMode,
  };
}

function hostWithRelay(form: FakeForm): { host: MjEntityFormHostComponent; emitted: boolean[] } {
  const host = Object.create(MjEntityFormHostComponent.prototype) as MjEntityFormHostComponent;
  const internals = host as unknown as Record<string, unknown>;
  internals['_formEventSubs'] = [];
  internals['cleanupFormSubs'] = () => undefined;
  for (const key of ['Navigate', 'Notification', 'RecordSaved', 'RecordRefreshed', 'RecordDeleted',
    'RecordSaveFailed', 'ValidationFailed', 'RecordReady', 'Dismissed', 'EditModeChanged']) {
    internals[key] = new EventEmitter();
  }
  const emitted: boolean[] = [];
  host.EditModeChanged.subscribe((v: boolean) => emitted.push(v));
  (host as unknown as { subscribeToFormEvents(f: unknown): void }).subscribeToFormEvents(form);
  return { host, emitted };
}

describe('MjEntityFormHostComponent relays EditModeChanged', () => {
  it('re-emits true and false from the form', () => {
    const form = fakeForm();
    const { emitted } = hostWithRelay(form);
    form.EditModeChanged.emit(true);
    form.EditModeChanged.emit(false);
    expect(emitted).toEqual([true, false]);
  });

  it('emits true once after mount when the form already starts in edit mode (StartInEditMode / new record)', () => {
    const form = fakeForm(true);
    const { host, emitted } = hostWithRelay(form);
    (host as unknown as { announceInitialEditMode(f: unknown): void }).announceInitialEditMode(form);
    expect(emitted).toEqual([true]);
  });

  it('emits nothing after mount when the form starts in read mode', () => {
    const form = fakeForm(false);
    const { host, emitted } = hostWithRelay(form);
    (host as unknown as { announceInitialEditMode(f: unknown): void }).announceInitialEditMode(form);
    expect(emitted).toEqual([]);
  });
});
