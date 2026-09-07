/**
 * The section rail is resolved from a DOM snapshot that skips panels flagged
 * `mj-panel-empty`, so a section whose fields are all blank loses its nav entry
 * in read-only mode. Edit mode and Show Empty Fields both un-hide those fields,
 * which means the rail has to be re-resolved when either flips — from ANY
 * writer, including `SaveRecord()` / `CancelEdit()` calling `EndEditMode()`
 * straight on the form component.
 *
 * `MjRecordFormContainerComponent.ngDoCheck` is the watcher. It is exercised
 * here against the real prototype (real `EffectiveEditMode` /
 * `EffectiveShowEmptyFields` getters) with a stand-in form component.
 */
// The container's import graph reaches partially-compiled Angular libraries
// (@angular/common), which need the JIT compiler present under the node preset.
import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { MjRecordFormContainerComponent } from '../record-form-container.component';
import type { BaseFormComponent } from '../../base-form-component';

type FormStub = { EditMode: boolean; showEmptyFields: boolean };

interface Harness {
  Container: MjRecordFormContainerComponent;
  Form: FormStub;
  ResolveCount: () => number;
}

function makeHarness(): Harness {
  const form: FormStub = { EditMode: false, showEmptyFields: false };
  let resolveCount = 0;
  const container = Object.create(MjRecordFormContainerComponent.prototype) as MjRecordFormContainerComponent;
  container.FormComponent = form as unknown as BaseFormComponent;
  container.EditMode = false;
  Object.assign(container, {
    lastRailEditMode: false,
    lastRailShowEmptyFields: false,
    scheduleChromeResolve: () => {
      resolveCount++;
    },
  });
  return { Container: container, Form: form, ResolveCount: () => resolveCount };
}

describe('MjRecordFormContainerComponent rail refresh on field-visibility changes', () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  it('does not re-resolve the rail while nothing changes', () => {
    h.Container.ngDoCheck();
    h.Container.ngDoCheck();
    h.Container.ngDoCheck();
    expect(h.ResolveCount()).toBe(0);
  });

  it('re-resolves the rail when edit mode is entered', () => {
    h.Container.ngDoCheck();
    h.Form.EditMode = true;
    h.Container.ngDoCheck();
    expect(h.ResolveCount()).toBe(1);
  });

  it('re-resolves the rail when edit mode ends without the toolbar handler (save/cancel path)', () => {
    h.Form.EditMode = true;
    h.Container.ngDoCheck();
    h.Form.EditMode = false; // what EndEditMode() does from SaveRecord()/CancelEdit()
    h.Container.ngDoCheck();
    expect(h.ResolveCount()).toBe(2);
  });

  it('re-resolves the rail when Show Empty Fields is toggled', () => {
    h.Container.ngDoCheck();
    h.Form.showEmptyFields = true;
    h.Container.ngDoCheck();
    h.Form.showEmptyFields = false;
    h.Container.ngDoCheck();
    expect(h.ResolveCount()).toBe(2);
  });

  it('re-resolves once when both flags change together', () => {
    h.Container.ngDoCheck();
    h.Form.EditMode = true;
    h.Form.showEmptyFields = true;
    h.Container.ngDoCheck();
    h.Container.ngDoCheck();
    expect(h.ResolveCount()).toBe(1);
  });

  it('re-resolves for a form that starts in edit mode', () => {
    h.Form.EditMode = true;
    h.Container.ngDoCheck();
    expect(h.ResolveCount()).toBe(1);
  });

  it('falls back to the standalone EditMode input when no form component is bound', () => {
    h.Container.FormComponent = null;
    h.Container.ngDoCheck();
    expect(h.ResolveCount()).toBe(0);

    h.Container.EditMode = true;
    h.Container.ngDoCheck();
    expect(h.ResolveCount()).toBe(1);
  });
});
