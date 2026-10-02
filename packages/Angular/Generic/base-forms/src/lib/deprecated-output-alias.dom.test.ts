import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Output } from '@angular/core';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';

/**
 * Guards the back-compat shape used when an `@Output` is renamed to PascalCase.
 *
 * Renaming a component's public surface must not break a template that already binds the old name,
 * and an output cannot be forwarded the way an input can. An input flows *inward*, so a second
 * write target — the `@Input('sectionKey') set _deprecatedSectionKey(…)` alias a few files over in
 * `collapsible-panel` — is enough. An output flows outward, and what Angular takes hold of is the
 * EventEmitter object itself: it calls `instance.<prop>.subscribe(handler)` once when the component
 * is created, and there is no hook to intercept that. So the only way both names can work is for
 * both properties to be *the same emitter*:
 *
 * ```ts
 * @Output() Changed = new EventEmitter<string>();
 *
 * /** @deprecated Use {@link Changed}. *\/
 * @Output() changed = this.Changed;
 * ```
 *
 * Nothing else in MJ does this — there is not one aliased `@Output` in the repo — so the pattern
 * is proven here before it is applied across the ~519 outputs the naming standard flags. Two things
 * have to hold, and this file asserts both.
 */

/** A renamed output, with its old name kept alive beside it. Declaration order is load-bearing. */
@Component({ standalone: true, selector: 'mj-dual-output', template: '' })
class DualOutputComponent {
    @Output() Changed = new EventEmitter<string>();

    /**
     * @deprecated Use {@link Changed}.
     *
     * Must be declared AFTER `Changed`: class fields initialise in declaration order, so the other
     * way round this captures `undefined` and Angular throws when it tries to subscribe.
     */
    @Output() changed = this.Changed;
}

/** A consumer still on the old binding name, alongside one that has migrated. */
@Component({
    standalone: true,
    imports: [DualOutputComponent],
    template: `
        <mj-dual-output (changed)="OnOld($event)" (Changed)="OnNew($event)"></mj-dual-output>
    `,
})
class HostComponent {
    public OldEvents: string[] = [];
    public NewEvents: string[] = [];
    public OnOld(value: string): void {
        this.OldEvents.push(value);
    }
    public OnNew(value: string): void {
        this.NewEvents.push(value);
    }
}

describe('deprecated @Output alias (DOM)', () => {
    it('delivers one emit to both the old and the new binding name', () => {
        const fixture = renderComponentFixture(HostComponent, { imports: [DualOutputComponent] });
        const child = fixture.debugElement.children[0].componentInstance as DualOutputComponent;

        // The whole point: one emitter, so emitting on the canonical name reaches a template that
        // still binds the deprecated one.
        child.Changed.emit('hello');
        fixture.detectChanges();

        expect(fixture.componentInstance.OldEvents).toEqual(['hello']);
        expect(fixture.componentInstance.NewEvents).toEqual(['hello']);
    });

    it('keeps the two names pointing at the same emitter', () => {
        const fixture = renderComponentFixture(HostComponent, { imports: [DualOutputComponent] });
        const child = fixture.debugElement.children[0].componentInstance as DualOutputComponent;

        // A consumer holding the old property programmatically — `component.changed.subscribe(…)` —
        // must see events emitted on the new one, which is only true if it is one object.
        expect(child.changed).toBe(child.Changed);

        child.changed.emit('via-old');
        fixture.detectChanges();

        expect(fixture.componentInstance.NewEvents).toEqual(['via-old']);
    });
});
