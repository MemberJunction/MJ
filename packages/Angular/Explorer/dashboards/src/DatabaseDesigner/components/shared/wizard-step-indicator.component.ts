/**
 * @module wizard-step-indicator.component
 * @description Pure-display step breadcrumb bar for the Database Designer create wizard.
 *
 * Renders a horizontal step progression:
 *   ① Basics ── ② Fields ── ③ Relationships ── ④ Review ── ⑤ Create
 *
 * Completed steps show a checkmark. The active step is highlighted.
 * Future steps are muted.  Parent controls all state via inputs — this
 * component has no local state and emits no events.
 */

import {
    Component, Input, ChangeDetectionStrategy,
} from '@angular/core';
import type { WizardStepDef } from '../../database-designer.types.js';

@Component({
    standalone: false,
    selector: 'mj-entity-wizard-step-indicator',
    templateUrl: './wizard-step-indicator.component.html',
    styleUrls: ['./wizard-step-indicator.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WizardStepIndicatorComponent {

    /** Ordered list of step definitions. */
    @Input() public Steps: WizardStepDef[] = [];

    /** 0-based index of the currently active step. */
    @Input() public CurrentStep = 0;

    /** Used by @for track. */
    public TrackByStep(_: number, step: WizardStepDef): string {
        return step.id;
    }
}
