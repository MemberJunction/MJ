import { Component } from '@angular/core';
import { MJEncryptionKeySourcesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Encryption Key Sources') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjencryptionkeysources-form',
    templateUrl: './mjencryptionkeysources.form.component.html'
})
export class MJEncryptionKeySourcesFormComponent extends BaseFormComponent {
    public record!: MJEncryptionKeySourcesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJEncryptionKeys', sectionName: 'MJ: Encryption Keys', isExpanded: false }
        ]);
    }
}

