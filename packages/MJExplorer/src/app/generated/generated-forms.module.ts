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
import { ActivitiesFormComponent } from "./Entities/Activities/activities.form.component";
import { CompaniesFormComponent } from "./Entities/Companies/companies.form.component";
import { CompanyTagsFormComponent } from "./Entities/CompanyTags/companytags.form.component";
import { ContactTagsFormComponent } from "./Entities/ContactTags/contacttags.form.component";
import { ContactsFormComponent } from "./Entities/Contacts/contacts.form.component";
import { DealProductsFormComponent } from "./Entities/DealProducts/dealproducts.form.component";
import { DealTagsFormComponent } from "./Entities/DealTags/dealtags.form.component";
import { DealsFormComponent } from "./Entities/Deals/deals.form.component";
import { PipelineStagesFormComponent } from "./Entities/PipelineStages/pipelinestages.form.component";
import { PipelinesFormComponent } from "./Entities/Pipelines/pipelines.form.component";
import { ProductsFormComponent } from "./Entities/Products/products.form.component";
import { TagsFormComponent } from "./Entities/Tags/tags.form.component";
   

@NgModule({
declarations: [
    ActivitiesFormComponent,
    CompaniesFormComponent,
    CompanyTagsFormComponent,
    ContactTagsFormComponent,
    ContactsFormComponent,
    DealProductsFormComponent,
    DealTagsFormComponent,
    DealsFormComponent,
    PipelineStagesFormComponent,
    PipelinesFormComponent,
    ProductsFormComponent,
    TagsFormComponent],
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
    