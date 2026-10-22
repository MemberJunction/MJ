import { describe, it, expect } from 'vitest';
import { Component, Directive, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MJFormPresenterService } from '@memberjunction/ng-base-forms';
import type { FormCompositionSnapshot } from '@memberjunction/ng-base-forms';
import { NavigationService, SharedService } from '@memberjunction/ng-shared';
import { BaseEntity, BaseEntityEvent, CompositeKey } from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';
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
  @Input() FormMode: unknown;
  @Output() FormModeChange = new EventEmitter<unknown>();
  @Output() LoadComplete = new EventEmitter<void>();
  @Output() LoadError = new EventEmitter<unknown>();
  @Output() RecordReady = new EventEmitter<unknown>();
  @Output() Saved = new EventEmitter<unknown>();
  @Output() Navigate = new EventEmitter<unknown>();
  @Output() Notification = new EventEmitter<unknown>();
  @Output() Dismissed = new EventEmitter<void>();
  @Output() FormCreated = new EventEmitter<unknown>();
}

/** Projects its content like the real <mj-alert>, so the banner's Close button renders. */
@Component({
  standalone: true,
  selector: 'mj-alert',
  template: '<div class="title">{{ Title }}</div><ng-content></ng-content><ng-content select="[actions]"></ng-content>',
})
class AlertStub {
  @Input() Variant: unknown;
  @Input() Title = '';
  @Input() Message: unknown;
}

@Directive({ standalone: true, selector: '[mjButton]' })
class ButtonStub {
  @Input() Variant: unknown;
  @Input() Size: unknown;
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
    FormChoice: { FullCustomForm: false, OverrideID: null, Label: 'Default form' },
    Layout: 'accordion',
    Sections: [],
    Related: [],
    Contributions: [],
    Rail: [],
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
    imports: [EntityFormHostStub, AlertStub, ButtonStub],
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
  fixture.componentInstance.CompositionChanged.subscribe((s) => emitted.push(s));

  fixture.detectChanges();
  const host = fixture.debugElement.query((el) => el.componentInstance instanceof EntityFormHostStub).componentInstance as EntityFormHostStub;
  return { fixture, host, emitted };
}

function fakeForm(): FakeForm {
  return { CompositionChanged: new EventEmitter<FormCompositionSnapshot>(), CompositionSnapshot: null };
}

describe('SingleRecordComponent (DOM) — composition snapshot', () => {
  it("re-emits the form's CompositionChanged as CompositionChanged", () => {
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

/** Raise a BaseEntity event on the global bus, as the providers do. */
function raiseEntityEvent(args: Partial<BaseEntityEvent>): void {
  MJGlobal.Instance.RaiseEvent({
    event: MJEventType.ComponentEvent,
    eventCode: BaseEntity.BaseEventCode,
    args: { payload: null, baseEntity: null, type: 'other', ...args } as BaseEntityEvent,
    component: {},
  });
}

function remoteDelete(entityName: string, id: string): void {
  raiseEntityEvent({
    type: 'remote-invalidate',
    entityName,
    payload: { action: 'delete', primaryKeyValues: JSON.stringify([{ FieldName: 'ID', Value: id }]) },
  });
}

function renderRecord(id: string): ReturnType<typeof render> {
  const rendered = render();
  rendered.fixture.componentInstance.PrimaryKey = new CompositeKey([{ FieldName: 'ID', Value: id }]);
  rendered.fixture.detectChanges();
  return rendered;
}

function banner(fixture: ComponentFixture<SingleRecordComponent>): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector('mj-alert');
}

describe('SingleRecordComponent (DOM) — record deleted by another user', () => {
  it('shows a banner, and keeps the form, when another session deletes this record', () => {
    const { fixture } = renderRecord('U-1');

    remoteDelete('MJ: Users', 'u-1');
    fixture.detectChanges();

    expect(banner(fixture)?.textContent).toContain('This record was deleted by another user');
    expect((fixture.nativeElement as HTMLElement).querySelector('mj-entity-form-host')).not.toBeNull();
  });

  it('ignores remote deletes of other records and remote saves of this one', () => {
    const { fixture } = renderRecord('U-1');

    remoteDelete('MJ: Users', 'U-2');
    remoteDelete('MJ: Roles', 'U-1');
    raiseEntityEvent({
      type: 'remote-invalidate',
      entityName: 'MJ: Users',
      payload: { action: 'save', primaryKeyValues: JSON.stringify([{ FieldName: 'ID', Value: 'U-1' }]) },
    });
    fixture.detectChanges();

    expect(banner(fixture)).toBeNull();
  });

  it('leaves a delete made in this session to the shell (no banner)', () => {
    const { fixture } = renderRecord('U-1');
    const entity = { EntityInfo: { Name: 'MJ: Users' }, PrimaryKey: new CompositeKey([{ FieldName: 'ID', Value: 'U-1' }]) };

    raiseEntityEvent({ type: 'delete', baseEntity: entity as unknown as BaseEntity });
    fixture.detectChanges();

    expect(banner(fixture)).toBeNull();
  });

  it('closes the tab from the banner', () => {
    const { fixture } = renderRecord('U-1');
    let dismissed = 0;
    fixture.componentInstance.RecordDismissed.subscribe(() => dismissed++);

    remoteDelete('MJ: Users', 'U-1');
    fixture.detectChanges();
    (banner(fixture)?.querySelector('button') as HTMLButtonElement).click();

    expect(dismissed).toBe(1);
  });

  it('stops listening once destroyed', () => {
    const { fixture } = renderRecord('U-1');
    fixture.destroy();

    remoteDelete('MJ: Users', 'U-1');

    expect(fixture.componentInstance.DeletedRemotely).toBe(false);
  });
});
