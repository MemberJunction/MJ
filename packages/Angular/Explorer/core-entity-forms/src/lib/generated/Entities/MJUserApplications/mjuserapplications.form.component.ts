import { Component } from '@angular/core';
import { MJUserApplicationsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: User Applications') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjuserapplications-form',
    templateUrl: './mjuserapplications.form.component.html'
})
export class MJUserApplicationsFormComponent extends BaseFormComponent {
    public record!: MJUserApplicationsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiers', sectionName: 'Identifiers', isExpanded: true },
            { sectionKey: 'displaySettings', sectionName: 'Display Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entities', sectionName: 'Entities', isExpanded: false }
        ]);
    }
}

