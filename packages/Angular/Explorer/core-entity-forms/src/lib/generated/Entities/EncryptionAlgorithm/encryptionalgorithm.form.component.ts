import { Component } from '@angular/core';
import { EncryptionAlgorithmEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Encryption Algorithms') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-encryptionalgorithm-form',
    templateUrl: './encryptionalgorithm.form.component.html'
})
export class EncryptionAlgorithmFormComponent extends BaseFormComponent {
    public record!: EncryptionAlgorithmEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJEncryptionKeys', sectionName: 'MJ: Encryption Keys', isExpanded: false }
        ]);
    }
}

export function LoadEncryptionAlgorithmFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
