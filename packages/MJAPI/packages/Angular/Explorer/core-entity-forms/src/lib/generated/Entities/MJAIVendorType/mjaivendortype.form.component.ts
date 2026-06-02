import { Component } from '@angular/core';
import { MJAIVendorTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Vendor Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaivendortype-form',
    templateUrl: './mjaivendortype.form.component.html'
})
export class MJAIVendorTypeFormComponent extends BaseFormComponent {
    public record!: MJAIVendorTypeEntity;

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

