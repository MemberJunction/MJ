import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { MJMLModelFormComponent } from '../../generated/Entities/MJMLModel/mjmlmodel.form.component';

/**
 * Custom form override for `MJ: ML Models` (priority 100).
 * Replaces the raw generated field layout with the unified `<ps-model-detail>` component —
 * the exact same rich, interactive visualization used in Predictive Studio's Model Registry.
 *
 * Opening any ML Model record anywhere in MemberJunction Explorer now renders:
 * - Versioned model identity & algorithm details
 * - 4-stage lifecycle stepper (Draft → Validated → Published → Archived)
 * - In-sample vs holdout metric comparison (AUC, Accuracy, Precision, Recall, F1, Log Loss, etc.)
 * - Feature importance rankings with dominance warning
 * - Target leakage sign-off gate verification
 * - Full lifecycle actions (Validate, Publish, Archive)
 */
@RegisterClass(BaseFormComponent, 'MJ: ML Models', 100)
@Component({
    standalone: false,
    selector: 'mj-ml-model-form-extended',
    templateUrl: './ml-model-form.component.html',
    styleUrls: ['./ml-model-form.component.css'],
})
export class MLModelFormComponentExtended extends MJMLModelFormComponent {}

/** Tree-shaking guard so the override registers with the ClassFactory. */
export function LoadMLModelFormComponentExtended(): void {
    // intentionally empty
}
