import { Component } from '@angular/core';
import { MJContentFileTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Content File Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontentfiletype-form',
    templateUrl: './mjcontentfiletype.form.component.html'
})
export class MJContentFileTypeFormComponent extends BaseFormComponent {
    public record!: MJContentFileTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJContentSources', sectionName: 'Content Sources', isExpanded: false },
            { sectionKey: 'mJContentItems', sectionName: 'Content Items', isExpanded: false }
        ]);
    }
}

