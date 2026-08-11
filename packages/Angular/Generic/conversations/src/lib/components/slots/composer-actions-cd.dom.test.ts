import { describe, it, expect, beforeEach } from 'vitest';
import { Component, Input, TemplateRef, ContentChildren, QueryList } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChatSlotDirective, type MJChatSlotName } from '../../directives/chat-slot.directive';

/**
 * Change-detection safety spec for the `composerActions` binding shape.
 *
 * THE RISK. The chat area binds a child input to the result of a METHOD that reads a
 * `@ContentChildren` query:
 *
 *   [actionsTemplate]="allowComposerActions ? slotTemplate('composerActions') : null"
 *
 * Content queries are populated around `ngAfterContentInit`. If the expression resolved to `null`
 * on the first change-detection pass and to a `TemplateRef` on Angular's dev-mode verification
 * pass, that is NG0100 (`ExpressionChangedAfterItHasBeenCheckedError`) — and it is DEV-ONLY.
 * Production builds skip the second pass, so the whole class of bug is invisible to `ng build`
 * and to every spec that only asserts rendered output. That is exactly the kind of defect that
 * reaches a developer's console instead of CI.
 *
 * WHY A MINIMAL REPRODUCTION rather than the real component: `ConversationChatAreaComponent`
 * constructor-injects a dozen services, so standing it up here would test the mocking harness as
 * much as the binding. What is under test is the SHAPE — content-query-backed method feeding a
 * child input — reproduced exactly, including the `allow*` cap ternary and the projected-template
 * consumer. `TestBed` runs with dev-mode assertions on, so NG0100 surfaces as a thrown error.
 */

@Component({
  standalone: false,
  selector: 'test-child',
  template: `@if (actionsTemplate) {
    <span class="projected"><ng-container *ngTemplateOutlet="actionsTemplate; context: { $implicit: disabled, disabled: disabled }"></ng-container></span>
  }`,
})
class TestChildComponent {
  @Input() actionsTemplate: TemplateRef<unknown> | null = null;
  @Input() disabled = false;
}

@Component({
  standalone: false,
  selector: 'test-host',
  template: `<test-child [actionsTemplate]="allowComposerActions ? slotTemplate('composerActions') : null"
                         [disabled]="disabled"></test-child>
             <ng-content></ng-content>`,
})
class TestHostComponent {
  @Input() allowComposerActions = true;
  @Input() disabled = false;
  @ContentChildren(ChatSlotDirective) private chatSlotChildren!: QueryList<ChatSlotDirective>;

  public slotTemplate(name: MJChatSlotName): TemplateRef<unknown> | null {
    return this.chatSlotChildren?.find((s) => s.SlotName === name)?.Template ?? null;
  }
}

@Component({
  standalone: false,
  selector: 'test-wrapper',
  template: `<test-host [allowComposerActions]="allow" [disabled]="disabled">
               <ng-template mjChatSlot="composerActions" let-d>
                 <button class="host-action" [disabled]="d">Skills</button>
               </ng-template>
             </test-host>`,
})
class TestWrapperComponent {
  public allow = true;
  public disabled = false;
}

describe('composerActions binding — change-detection safety', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TestChildComponent, TestHostComponent, TestWrapperComponent],
      imports: [ChatSlotDirective],
    }).compileComponents();
  });

  it('does not throw NG0100 when a template is projected into the slot', () => {
    const fixture = TestBed.createComponent(TestWrapperComponent);
    // detectChanges() runs the dev-mode verification pass, which is what throws NG0100.
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.nativeElement.querySelector('button.host-action')).not.toBeNull();
  });

  it('stays stable across repeated change-detection cycles', () => {
    const fixture = TestBed.createComponent(TestWrapperComponent);
    fixture.detectChanges();
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(() => fixture.detectChanges()).not.toThrow();
  });

  // NOT COVERED HERE: flipping `allowComposerActions` at runtime. Mutating a host property from
  // a spec and re-running change detection makes Angular's verification pass observe the WRAPPER's
  // own binding changing mid-pass — it reports `Expression location: TestWrapperComponent`, i.e.
  // the harness, not the binding under test, and `detectChanges(false)` does not suppress it in
  // Angular 21. Chasing that would be testing TestBed. The cap's actual contract — that every
  // composer binding is gated on `allowComposerActions` — is asserted at template-source level in
  // `__tests__/chat-area-composer-actions.test.ts`, where it belongs.

  it('propagates the disabled context to the projected control', () => {
    const fixture = TestBed.createComponent(TestWrapperComponent);
    fixture.componentInstance.disabled = true;
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('button.host-action') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(true);
  });
});
