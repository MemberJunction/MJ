import { Component } from '@angular/core';
import { MJAIVendorTypeDefinitionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Vendor Type Definitions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaivendortypedefinition-form',
    templateUrl: './mjaivendortypedefinition.form.component.html'
})
export class MJAIVendorTypeDefinitionFormComponent extends BaseFormComponent {
    public record!: MJAIVendorTypeDefinitionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'vendorTypeInformation', sectionName: 'Vendor Type Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIModelVendors', sectionName: 'MJ: AI Model Vendors', isExpanded: false },
            { sectionKey: 'mJAIVendorTypes', sectionName: 'MJ: AI Vendor Types', isExpanded: false }
        ]);
    }
}

