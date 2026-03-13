/**
 * @fileoverview Agent Requests Module
 *
 * Angular module providing reusable components for viewing and responding
 * to AI agent feedback requests. Supports both embedded panel and modal
 * dialog usage patterns.
 */

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Kendo UI Angular imports
import { DialogModule } from '@progress/kendo-angular-dialog';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';

// MemberJunction modules
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { DynamicFormsModule } from '@memberjunction/ng-forms';

// Panel components
import { AgentRequestPanelComponent } from './panels/agent-request-panel/agent-request-panel.component';

// Dialog components
import { AgentRequestDialogComponent } from './dialogs/agent-request-dialog.component';

@NgModule({
    declarations: [
        AgentRequestPanelComponent,
        AgentRequestDialogComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        DialogModule,
        ButtonsModule,
        DropDownsModule,
        InputsModule,
        DateInputsModule,
        SharedGenericModule,
        DynamicFormsModule
    ],
    exports: [
        AgentRequestPanelComponent,
        AgentRequestDialogComponent
    ]
})
export class AgentRequestsModule { }
