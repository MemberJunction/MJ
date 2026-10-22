// Partial-compiled Angular component classes — JIT compiler first (same convention as
// shell-global-keydown.test.ts).
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { EntityRecordResource } from './record-resource.component';
import { SingleRecordComponent } from '../single-record/single-record.component';

/**
 * Links 2 and 3 of the records edit guard chain:
 *
 *   TabContainer.IsRecordTabEditing(tabId)
 *     -> EntityRecordResource.IsEditing()           (this file)
 *       -> SingleRecordComponent.IsEditing()        (this file)
 *         -> MjEntityFormHostComponent.Form.EditMode
 *
 * Each link is a read through an optional @ViewChild, and each must answer
 * `false` while the child has not resolved: an unrendered form has nothing to
 * protect. Object.create harness: the view children are private fields set
 * directly, because the question is "what does the method return for this
 * child state", not "does Angular wire the child".
 */

function resourceWith(singleRecord: { IsEditing(): boolean } | undefined): EntityRecordResource {
  const resource = Object.create(EntityRecordResource.prototype) as EntityRecordResource;
  (resource as unknown as Record<string, unknown>)['singleRecord'] = singleRecord;
  return resource;
}

function singleRecordWith(formHost: { Form?: { EditMode?: boolean } } | undefined): SingleRecordComponent {
  const component = Object.create(SingleRecordComponent.prototype) as SingleRecordComponent;
  (component as unknown as Record<string, unknown>)['formHost'] = formHost;
  return component;
}

describe('EntityRecordResource.IsEditing', () => {
  it('true when the hosted single-record component reports editing', () => {
    expect(resourceWith({ IsEditing: () => true }).IsEditing()).toBe(true);
  });

  it('false when the hosted single-record component is not editing', () => {
    expect(resourceWith({ IsEditing: () => false }).IsEditing()).toBe(false);
  });

  it('false before the view child resolves (nothing rendered, nothing to lose)', () => {
    expect(resourceWith(undefined).IsEditing()).toBe(false);
  });
});

describe('SingleRecordComponent.IsEditing', () => {
  it('true only when the live form is in edit mode', () => {
    expect(singleRecordWith({ Form: { EditMode: true } }).IsEditing()).toBe(true);
  });

  it('false when the form is in read mode', () => {
    expect(singleRecordWith({ Form: { EditMode: false } }).IsEditing()).toBe(false);
  });

  it('false when the host has no form yet (still resolving the entity form)', () => {
    expect(singleRecordWith({ Form: undefined }).IsEditing()).toBe(false);
  });

  it('false before the form host view child resolves', () => {
    expect(singleRecordWith(undefined).IsEditing()).toBe(false);
  });
});
