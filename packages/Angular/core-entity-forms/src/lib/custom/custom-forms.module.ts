import { NgModule } from "@angular/core";
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';
import { EntitiesFormComponent, LoadEntitiesFormComponent } from "./Entities/entities-form.component";

@NgModule({
    declarations: [
        EntitiesFormComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        LayoutModule,
        InputsModule,
        ButtonsModule,
        DateInputsModule,
        UserViewGridModule,
        LinkDirectivesModule,
        BaseFormsModule
    ],
    exports: [
        EntitiesFormComponent
    ]
})
export class MemberJunctionCoreEntityFormsModule { }

export function LoadCoreCustomForms() {
    LoadEntitiesFormComponent()
}