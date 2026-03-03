import { Component } from '@angular/core';
import { MJEncryptionAlgorithmEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Encryption Algorithms') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjencryptionalgorithm-form',
    templateUrl: './mjencryptionalgorithm.form.component.html'
})
export class MJEncryptionAlgorithmFormComponent extends BaseFormComponent {
    public record!: MJEncryptionAlgorithmEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJEncryptionKeys', sectionName: 'MJ: Encryption Keys', isExpanded: false }
        ]);
    }
}

