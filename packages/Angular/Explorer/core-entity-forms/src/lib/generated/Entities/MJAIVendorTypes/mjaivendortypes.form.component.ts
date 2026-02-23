import { Component } from '@angular/core';
import { MJAIVendorTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Vendor Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaivendortypes-form',
    templateUrl: './mjaivendortypes.form.component.html'
})
export class MJAIVendorTypesFormComponent extends BaseFormComponent {
    public record!: MJAIVendorTypesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'vendorIdentification', sectionName: 'Vendor Identification', isExpanded: true },
            { sectionKey: 'typeSpecification', sectionName: 'Type Specification', isExpanded: true },
            { sectionKey: 'statusAudit', sectionName: 'Status & Audit', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

