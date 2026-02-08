import { Component } from '@angular/core';
import { AIVendorTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Vendor Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aivendortype-form',
    templateUrl: './aivendortype.form.component.html'
})
export class AIVendorTypeFormComponent extends BaseFormComponent {
    public record!: AIVendorTypeEntity;

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

