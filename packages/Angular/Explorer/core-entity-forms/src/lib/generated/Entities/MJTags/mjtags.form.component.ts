import { Component } from '@angular/core';
import { MJTagsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Tags') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtags-form',
    templateUrl: './mjtags.form.component.html'
})
export class MJTagsFormComponent extends BaseFormComponent {
    public record!: MJTagsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tagBasics', sectionName: 'Tag Basics', isExpanded: true },
            { sectionKey: 'tagHierarchy', sectionName: 'Tag Hierarchy', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'taggedItems', sectionName: 'Tagged Items', isExpanded: false },
            { sectionKey: 'tags', sectionName: 'Tags', isExpanded: false }
        ]);
    }
}

