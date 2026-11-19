import { Component } from '@angular/core';
import { MJCommentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Comment Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommenttype-form',
    templateUrl: './mjcommenttype.form.component.html'
})
export class MJCommentTypeFormComponent extends BaseFormComponent {
    public record!: MJCommentTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'commentTypeDetails', sectionName: 'Comment Type Details', isExpanded: true },
            { sectionKey: 'configurationAndDrivers', sectionName: 'Configuration and Drivers', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJComments', sectionName: 'Comments', isExpanded: false }
        ]);
    }
}

