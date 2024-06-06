import { NgModule } from "@angular/core";
// MemberJunction Imports
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { FormToolbarModule } from '@memberjunction/ng-form-toolbar';
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';
import { MJTabStripModule } from "@memberjunction/ng-tabstrip";
import { ContainerDirectivesModule } from "@memberjunction/ng-container-directives";

// Kendo Imports
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { ComboBoxModule } from '@progress/kendo-angular-dropdowns';
import { DropDownListModule } from '@progress/kendo-angular-dropdowns';

import { AccountFormComponent_Demo } from "./Forms/Accounts/account.form.component";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { TimelineModule } from "@memberjunction/ng-timeline";

@NgModule({
    declarations: [
        AccountFormComponent_Demo
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
        BaseFormsModule,
        FormToolbarModule,
        MJTabStripModule,
        ContainerDirectivesModule,
        DropDownListModule,
        ComboBoxModule,
        TimelineModule
    ],
    exports: [
    ]
    })
export class DemoFormsModule { }
        