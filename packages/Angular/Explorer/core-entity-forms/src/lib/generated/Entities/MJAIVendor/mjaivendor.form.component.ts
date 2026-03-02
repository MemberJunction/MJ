import { Component } from '@angular/core';
import { MJAIVendorEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Vendors') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaivendor-form',
    templateUrl: './mjaivendor.form.component.html'
})
export class MJAIVendorFormComponent extends BaseFormComponent {
    public record!: MJAIVendorEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'vendorDetails', sectionName: 'Vendor Details', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAICredentialBindings', sectionName: 'AI Credential Bindings', isExpanded: false },
            { sectionKey: 'mJAIModelCosts', sectionName: 'AI Model Costs', isExpanded: false },
            { sectionKey: 'mJAIModelVendors', sectionName: 'AI Model Vendors', isExpanded: false },
            { sectionKey: 'mJAIPromptModels', sectionName: 'AI Prompt Models', isExpanded: false },
            { sectionKey: 'mJAIPromptRuns', sectionName: 'AI Prompt Runs', isExpanded: false },
            { sectionKey: 'mJAIResultCache', sectionName: 'AI Result Cache', isExpanded: false },
            { sectionKey: 'mJAIVendorTypes', sectionName: 'AI Vendor Types', isExpanded: false },
            { sectionKey: 'mJAIAgentRuns', sectionName: 'AI Agent Runs', isExpanded: false }
        ]);
    }
}

