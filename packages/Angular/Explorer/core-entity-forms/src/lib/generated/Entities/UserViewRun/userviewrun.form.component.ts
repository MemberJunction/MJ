import { Component } from '@angular/core';
import { UserViewRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'User View Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-userviewrun-form',
    templateUrl: './userviewrun.form.component.html'
})
export class UserViewRunFormComponent extends BaseFormComponent {
    public record!: UserViewRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'viewDefinition', sectionName: 'View Definition', isExpanded: true },
            { sectionKey: 'executionDetails', sectionName: 'Execution Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false }
        ]);
    }
}

