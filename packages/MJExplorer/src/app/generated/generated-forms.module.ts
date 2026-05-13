/**********************************************************************************
* GENERATED FILE - This file is automatically managed by the MJ CodeGen tool, 
* 
* DO NOT MODIFY THIS FILE - any changes you make will be wiped out the next time the file is
* generated
* 
**********************************************************************************/
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// MemberJunction Imports
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';

// Import Generated Components
import { bettyContentItemFormComponent } from "./Entities/bettyContentItem/bettycontentitem.form.component";
import { bettyInstanceFormComponent } from "./Entities/bettyInstance/bettyinstance.form.component";
import { bettyOrganizationFormComponent } from "./Entities/bettyOrganization/bettyorganization.form.component";
import { bettyPromptComponentFormComponent } from "./Entities/bettyPromptComponent/bettypromptcomponent.form.component";
   

@NgModule({
declarations: [
    bettyContentItemFormComponent,
    bettyInstanceFormComponent,
    bettyOrganizationFormComponent,
    bettyPromptComponentFormComponent],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_0 { }
    


@NgModule({
declarations: [
],
imports: [
    GeneratedForms_SubModule_0
]
})
export class GeneratedFormsModule { }
    
// Note: LoadXXXGeneratedForms() functions have been removed. Tree-shaking prevention
// is now handled by the pre-built class registration manifest system.
// See packages/CodeGenLib/CLASS_MANIFEST_GUIDE.md for details.
    