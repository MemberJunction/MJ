import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MJFormPresenterService } from '@memberjunction/ng-base-forms';
import type { FormCompositionSnapshot } from '@memberjunction/ng-base-forms';
import { NavigationService, SharedService } from '@memberjunction/ng-shared';
import { SingleRecordComponent } from './single-record.component';

/**
 * DOM coverage for <mj-single-record>'s composition relay.
 *
 * The hosted form resolves its chrome — sections, related grids, contributions, slots —
 * and publishes a snapshot of the result. SingleRecordComponent's job here is only to
 * forward it: the form is created dynamically inside <mj-entity-form-host>, so the
 * snapshot has no other route out to Explorer. A stub host stands in for the real one
 * so the test can emit FormCreated on demand without resolving a form.
 */
@Component({ standalone: true, selector: 'mj-entity-form-host', template: '' })
class EntityFormHostStub {
  @Input() EntityName: unknown;
  @Input() PrimaryKey: unknown;
  @Input() NewRecordValues: unknown;
  @Input() Provider: unknown;
  @Output() LoadComplete = new EventEmitter<void>();
  @Output() LoadError = new EventEmitter<unknown>();
  @Output() RecordReady = new EventEmitter<unknown>();
  @Output() Saved = new EventEmitter<unknown>();
  @Output() Navigate = new EventEmitter<unknown>();
  @Output() Notification = new EventEmitter<unknown>();
  @Output() Dismissed = new EventEmitter<void>();
  @Output() FormCreated = new EventEmitter<unknown>();
}

/** The shape SingleRecordComponent reads off a created form. */
type FakeForm = {
  CompositionChanged: EventEmitter<FormCompositionSnapshot>;
  CompositionSnapshot: FormCompositionSnapshot | null;
};

function snapshot(entity: string): FormCompositionSnapshot {
  return {
    Entity: entity,
    RecordPrimaryKey: 'ID|1',
    Layout: 'accordion',
    Sections: [],
    Related: [],
    Contributions: [],
    SlotsPresent: [],
    ChromeRuleCount: 0,
  };
}

function render(): {
  fixture: ComponentFixture<SingleRecordComponent>;
  host: EntityFormHostStub;
  emitted: FormCompositionSnapshot[];
} {
  TestBed.configureTestingModule({
    imports: [EntityFormHostStub],
    declarations: [SingleRecordComponent],
    providers: [
      { provide: NavigationService, useValue: {} },
      { provide: SharedService, useValue: {} },
      { provide: MJFormPresenterService, useValue: {} },
    ],
  });

  const fixture = TestBed.createComponent(SingleRecordComponent);
  fixture.componentInstance.entityName = 'MJ: Users';

  const emitted: FormCompositionSnapshot[] = [];
  fixture.componentInstance.compositionChanged.subscribe((s) => emitted.push(s));

  fixture.detectChanges();
  const host = fixture.debugElement.children[0].componentInstance as EntityFormHostStub;
  return { fixture, host, emitted };
}

function fakeForm(): FakeForm {
  return { CompositionChanged: new EventEmitter<FormCompositionSnapshot>(), CompositionSnapshot: null };
}

describe('SingleRecordComponent (DOM) — composition snapshot', () => {
  it("re-emits the form's CompositionChanged as compositionChanged", () => {
    const { host, emitted } = render();
    const form = fakeForm();
    host.FormCreated.emit(form);

    const composition = snapshot('MJ: Users');
    form.CompositionChanged.emit(composition);

    expect(emitted).toEqual([composition]);
  });

  it('emits the snapshot a form already carries at creation time', () => {
    const { host, emitted } = render();
    const form = fakeForm();
    form.CompositionSnapshot = snapshot('MJ: AI Agents');

    host.FormCreated.emit(form);

    expect(emitted).toEqual([form.CompositionSnapshot]);
  });

  it('stops listening to a replaced form, so a stale form cannot publish over the live one', () => {
    const { host, emitted } = render();
    const first = fakeForm();
    const second = fakeForm();

    host.FormCreated.emit(first);
    host.FormCreated.emit(second);

    first.CompositionChanged.emit(snapshot('stale'));
    const live = snapshot('MJ: Users');
    second.CompositionChanged.emit(live);

    expect(emitted).toEqual([live]);
  });

  it('stops listening once destroyed', () => {
    const { fixture, host, emitted } = render();
    const form = fakeForm();
    host.FormCreated.emit(form);

    fixture.destroy();
    form.CompositionChanged.emit(snapshot('after destroy'));

    expect(emitted).toEqual([]);
  });
});
