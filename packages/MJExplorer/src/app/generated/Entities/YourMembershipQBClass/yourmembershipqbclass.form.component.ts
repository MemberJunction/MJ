import { Component } from '@angular/core';
import { YourMembershipQBClassEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'QB Classes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipqbclass-form',
    templateUrl: './yourmembershipqbclass.form.component.html'
})
export class YourMembershipQBClassFormComponent extends BaseFormComponent {
    public record!: YourMembershipQBClassEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'classInformation', sectionName: 'Class Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'invoiceItems', sectionName: 'Invoice Items', isExpanded: false }
        ]);
    }
}

