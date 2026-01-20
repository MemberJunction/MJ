import { Component } from '@angular/core';
import { TagEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Tags') // Tell MemberJunction about this class
@Component({
    selector: 'gen-tag-form',
    templateUrl: './tag.form.component.html'
})
export class TagFormComponent extends BaseFormComponent {
    public record!: TagEntity;

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

export function LoadTagFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
