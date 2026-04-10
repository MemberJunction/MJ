import { Component } from '@angular/core';
import { MJAIModelVendorEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Model Vendors') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaimodelvendor-form',
    templateUrl: './mjaimodelvendor.form.component.html'
})
export class MJAIModelVendorFormComponent extends BaseFormComponent {
    public record!: MJAIModelVendorEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'modelVendorLinkage', sectionName: 'Model-Vendor Linkage', isExpanded: true },
            { sectionKey: 'implementationConfiguration', sectionName: 'Implementation Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAICredentialBindings', sectionName: 'AI Credential Bindings', isExpanded: false }
        ]);
    }
}

