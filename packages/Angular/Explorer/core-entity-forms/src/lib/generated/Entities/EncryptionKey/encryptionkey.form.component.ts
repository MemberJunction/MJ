import { Component } from '@angular/core';
import { EncryptionKeyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Encryption Keys') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-encryptionkey-form',
    templateUrl: './encryptionkey.form.component.html'
})
export class EncryptionKeyFormComponent extends BaseFormComponent {
    public record!: EncryptionKeyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'entityFields', sectionName: 'Entity Fields', isExpanded: false }
        ]);
    }
}

