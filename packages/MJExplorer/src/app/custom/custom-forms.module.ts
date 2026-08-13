import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';

import { GeneratedFormsModule } from '../generated/generated-forms.module';
import {
    GameNightPlaySessionFormComponentExtended,
    LoadGameNightPlaySessionFormComponentExtended,
} from './gamenight-playsession-form.component';

/**
 * Hand-written form overrides for this app. The sibling `generated/generated-forms.module.ts` is
 * CodeGen's and gets overwritten; this module is ours and does not.
 *
 * `GeneratedFormsModule` is imported for two reasons: the overrides reuse generated templates, and
 * importing it guarantees the generated components register *before* these do — which is what gives
 * the overrides the higher auto-incremented `ClassFactory` priority.
 *
 * The module imports mirror the generated module's, because the reused templates depend on them.
 */
@NgModule({
    declarations: [GameNightPlaySessionFormComponentExtended],
    imports: [
        CommonModule,
        FormsModule,
        BaseFormsModule,
        EntityViewerModule,
        LinkDirectivesModule,
        GeneratedFormsModule,
    ],
    exports: [GameNightPlaySessionFormComponentExtended],
})
export class CustomFormsModule {}

/** Call from app bootstrap so every override in this module survives tree-shaking. */
export function LoadCustomForms(): void {
    LoadGameNightPlaySessionFormComponentExtended();
}
