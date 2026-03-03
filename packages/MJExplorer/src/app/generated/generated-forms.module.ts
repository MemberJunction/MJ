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
import { LayoutModule } from '@progress/kendo-angular-layout';

// Import Generated Components
import { ActivityFormComponent } from "./Entities/Activity/activity.form.component";
import { CompanyFormComponent } from "./Entities/Company/company.form.component";
import { CompanyTagFormComponent } from "./Entities/CompanyTag/companytag.form.component";
import { ContactTagFormComponent } from "./Entities/ContactTag/contacttag.form.component";
import { ContactFormComponent } from "./Entities/Contact/contact.form.component";
import { DealProductFormComponent } from "./Entities/DealProduct/dealproduct.form.component";
import { DealTagFormComponent } from "./Entities/DealTag/dealtag.form.component";
import { DealFormComponent } from "./Entities/Deal/deal.form.component";
import { PipelineStageFormComponent } from "./Entities/PipelineStage/pipelinestage.form.component";
import { PipelineFormComponent } from "./Entities/Pipeline/pipeline.form.component";
import { ProductFormComponent } from "./Entities/Product/product.form.component";
import { TagFormComponent } from "./Entities/Tag/tag.form.component";
   

@NgModule({
declarations: [
    ActivityFormComponent,
    CompanyFormComponent,
    CompanyTagFormComponent,
    ContactTagFormComponent,
    ContactFormComponent,
    DealProductFormComponent,
    DealTagFormComponent,
    DealFormComponent,
    PipelineStageFormComponent,
    PipelineFormComponent,
    ProductFormComponent,
    TagFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
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
    