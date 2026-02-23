import { Component } from '@angular/core';
import { MJEncryptionKeysEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Encryption Keys') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjencryptionkeys-form',
    templateUrl: './mjencryptionkeys.form.component.html'
})
export class MJEncryptionKeysFormComponent extends BaseFormComponent {
    public record!: MJEncryptionKeysEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'entityFields', sectionName: 'Entity Fields', isExpanded: false }
        ]);
    }
}

