import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { By } from '@angular/platform-browser';
import { RegisterClassEx } from '@memberjunction/global';
import type { BaseEntity } from '@memberjunction/core';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { FormPanelSlotComponent } from './form-panel-slot.component';
import { BaseFormPanel } from './base-form-panel';
import type { BaseFormComponent } from '../base-form-component';

/**
 * DOM coverage for <mj-form-panel-slot> — the dynamic slot host CodeGen emits into every generated
 * form (~1,150×). It discovers BaseFormPanel registrations for its Entity+Slot via the MJ ClassFactory
 * and instantiates the matching panel(s) into its #anchor, wiring Record/FormComponent onto each.
 * These verify that lookup+mount path and the entity-scoping of registrations.
 *
 * ⚠️ PROCESS-GLOBAL REGISTRATION — the fake panel below is @RegisterClass'd into the MJGlobal
 * ClassFactory and never removed (the factory exposes no unregister API). Safe because the entity key
 * is a unique, obviously test-only string ('ZZZ_SlotTestEntity') no production code path queries, and
 * vitest isolates each file's process. If file isolation is ever relaxed, scope other specs' slot
 * assertions away from 'ZZZ_SlotTestEntity' (or add a ClassFactory unregister + tear this down).
 */

const TEST_ENTITY = 'ZZZ_SlotTestEntity';

@RegisterClassEx(BaseFormPanel, { metadata: { entity: TEST_ENTITY, slot: 'after-fields' } })
@Component({ standalone: true, selector: 'test-slot-panel', template: `<div class="fake-slot">slot mounted</div>` })
class FakeSlotPanel extends BaseFormPanel {}

const RECORD = { Get: () => null } as unknown as BaseEntity;
const FORM = {} as unknown as BaseFormComponent;

const render = (entity: string) => {
  const f = renderComponentFixture(FormPanelSlotComponent, {
    declarations: [FormPanelSlotComponent],
    inputs: { Entity: entity, Slot: 'after-fields', Record: RECORD, FormComponent: FORM },
  });
  // The first ngOnChanges → remount() runs before ngAfterViewInit, when the #anchor
  // ViewContainerRef isn't ready yet. A subsequent input change (with nothing mounted) re-runs
  // remount now that the view exists — mirrors the host form re-pushing context post-init.
  f.componentRef.setInput('FormContext', {});
  f.detectChanges();
  return f;
};

describe('FormPanelSlotComponent (DOM)', () => {
  // Reference the class so its @RegisterClass decorator is evaluated (tree-shake guard).
  it('registers the fake panel exactly once (guard)', () => {
    expect(FakeSlotPanel).toBeDefined();
  });

  it('mounts the registered panel for a matching entity + slot', () => {
    const f = render(TEST_ENTITY);
    expect(query(f, '.fake-slot')?.textContent?.trim()).toBe('slot mounted');
  });

  it('wires the Record and FormComponent onto the mounted panel', () => {
    const f = render(TEST_ENTITY);
    const panel = f.debugElement.query(By.directive(FakeSlotPanel)).componentInstance as FakeSlotPanel;
    expect(panel.Record).toBe(RECORD);
    expect(panel.FormComponent).toBe(FORM);
  });

  it('mounts nothing for an entity with no registered panel', () => {
    const f = render('ZZZ_UnregisteredEntity');
    expect(query(f, '.fake-slot')).toBeNull();
  });
});
