import { Component } from '@angular/core';
import { MJEncryptionAlgorithmsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Encryption Algorithms') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjencryptionalgorithms-form',
    templateUrl: './mjencryptionalgorithms.form.component.html'
})
export class MJEncryptionAlgorithmsFormComponent extends BaseFormComponent {
    public record!: MJEncryptionAlgorithmsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJEncryptionKeys', sectionName: 'MJ: Encryption Keys', isExpanded: false }
        ]);
    }
}

