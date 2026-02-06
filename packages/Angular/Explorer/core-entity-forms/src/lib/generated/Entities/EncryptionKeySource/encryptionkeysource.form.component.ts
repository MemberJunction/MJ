import { Component } from '@angular/core';
import { EncryptionKeySourceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Encryption Key Sources') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-encryptionkeysource-form',
    templateUrl: './encryptionkeysource.form.component.html'
})
export class EncryptionKeySourceFormComponent extends BaseFormComponent {
    public record!: EncryptionKeySourceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJEncryptionKeys', sectionName: 'MJ: Encryption Keys', isExpanded: false }
        ]);
    }
}

export function LoadEncryptionKeySourceFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
