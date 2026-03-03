import { Component } from '@angular/core';
import { MJEncryptionKeySourceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Encryption Key Sources') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjencryptionkeysource-form',
    templateUrl: './mjencryptionkeysource.form.component.html'
})
export class MJEncryptionKeySourceFormComponent extends BaseFormComponent {
    public record!: MJEncryptionKeySourceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJEncryptionKeys', sectionName: 'MJ: Encryption Keys', isExpanded: false }
        ]);
    }
}

