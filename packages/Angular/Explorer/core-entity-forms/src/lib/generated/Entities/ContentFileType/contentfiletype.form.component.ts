import { Component } from '@angular/core';
import { ContentFileTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Content File Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-contentfiletype-form',
    templateUrl: './contentfiletype.form.component.html'
})
export class ContentFileTypeFormComponent extends BaseFormComponent {
    public record!: ContentFileTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'contentSources', sectionName: 'Content Sources', isExpanded: false },
            { sectionKey: 'contentItems', sectionName: 'Content Items', isExpanded: false }
        ]);
    }
}

export function LoadContentFileTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
