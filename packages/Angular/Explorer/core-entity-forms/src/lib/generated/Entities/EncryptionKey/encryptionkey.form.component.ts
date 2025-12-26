import { Component } from '@angular/core';
import { EncryptionKeyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Encryption Keys') // Tell MemberJunction about this class
@Component({
    selector: 'gen-encryptionkey-form',
    templateUrl: './encryptionkey.form.component.html'
})
export class EncryptionKeyFormComponent extends BaseFormComponent {
    public record!: EncryptionKeyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'keyIdentification', sectionName: 'Key Identification', isExpanded: true },
            { sectionKey: 'sourceAlgorithm', sectionName: 'Source & Algorithm', isExpanded: true },
            { sectionKey: 'operationalStatus', sectionName: 'Operational Status', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entityFields', sectionName: 'Entity Fields', isExpanded: false }
        ]);
    }
}

export function LoadEncryptionKeyFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
