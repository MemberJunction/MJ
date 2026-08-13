import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { GameNightPlaySessionEntity, PlaySessionRuleViolation } from '@memberjunction/gamenight';
import { BoardGameNightPlaySessionFormComponent } from '../generated/Entities/BoardGameNightPlaySession/boardgamenightplaysession.form.component';

/**
 * Custom form override for `Play Sessions`.
 *
 * It exists for one reason: to make the session business rules *visible*. The rules already run and
 * already block bad saves — they live in `GameNightPlaySessionEntity.ValidateAsync()`, which
 * `BaseEntity.Save()` awaits. What the user sees, though, is a bare "Error saving record", because
 * `BaseFormComponent.SaveRecord()` renders async failures from `LatestResult.Message` while the
 * per-rule messages live in the validation errors (`CompleteMessage` aggregates them; `.Message`
 * does not). Its nicely-formatted "Validation Errors" notification is reachable only from the
 * *synchronous* validation branch, which async rules never enter.
 *
 * So this override runs the same rules up front, through the entity's own public `CheckRulesAsync()`,
 * and reports them the way the sync branch would. Two consequences worth noting:
 *
 *   - The rules are NOT duplicated here. This calls the entity, which is the single source of truth.
 *     A form that re-implemented them would be the bug this whole exercise is trying to avoid.
 *   - Blocking here also skips a pointless round trip: without it the record is sent to the server,
 *     validated, and rejected. The entity-level check still stands as the real enforcement — an
 *     Action, an agent, or the API can't route around it by not using this form.
 *
 * The layout is deliberately unchanged: `templateUrl` points at the *generated* template, so CodeGen
 * keeps owning the field layout and re-running it never overwrites anything here.
 *
 * Registered against the same key as the generated form. `ClassFactory` priority auto-increments by
 * load order, and this module imports the generated one — so this registers second and wins, with no
 * priority number to maintain.
 */
@RegisterClass(BaseFormComponent, 'Play Sessions')
@Component({
    standalone: false,
    selector: 'gamenight-playsession-form-extended',
    templateUrl: '../generated/Entities/BoardGameNightPlaySession/boardgamenightplaysession.form.component.html',
})
export class GameNightPlaySessionFormComponentExtended extends BoardGameNightPlaySessionFormComponent {
    public override async SaveRecord(StopEditModeAfterSave: boolean): Promise<boolean> {
        const violations = await this.checkSessionRules();

        if (violations.length > 0) {
            this.reportViolations(violations);
            return false;
        }

        return super.SaveRecord(StopEditModeAfterSave);
    }

    /**
     * Asks the entity for its rule violations.
     *
     * Returns empty rather than throwing when the record isn't a `GameNightPlaySessionEntity` — that
     * happens only if the entity subclass failed to register (tree-shaken, or load order changed), and
     * in that case the right behaviour is to let the save proceed to the server, which still validates.
     * Blocking every save because a class is missing would be worse than the gap it papers over.
     */
    private async checkSessionRules(): Promise<PlaySessionRuleViolation[]> {
        const session = this.record as GameNightPlaySessionEntity;
        if (!session || typeof session.CheckRulesAsync !== 'function') {
            return [];
        }
        return session.CheckRulesAsync();
    }

    /** Mirrors how the base form reports synchronous validation failures, so this looks native. */
    private reportViolations(violations: PlaySessionRuleViolation[]): void {
        const messages = violations.map((v) => v.Message);

        this.Notification.emit({
            Message: 'Validation Errors\n' + messages.join('\n'),
            Type: 'warning',
            Duration: 8000,
        });

        this.ValidationFailed.emit({
            EntityName: this.record.EntityInfo.Name,
            Errors: messages,
        });
    }
}

/**
 * Tree-shaking guard. The override is only ever resolved through `ClassFactory`, so nothing in the
 * app references this class by name — without a live call the module is dropped and `@RegisterClass`
 * never runs, silently leaving the generated form in place.
 */
export function LoadGameNightPlaySessionFormComponentExtended(): void {
    // intentionally empty — importing this module is the point
}
