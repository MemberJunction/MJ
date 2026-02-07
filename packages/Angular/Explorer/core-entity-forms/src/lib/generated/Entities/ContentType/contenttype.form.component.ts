import { Component } from '@angular/core';
import { ContentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Content Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-contenttype-form',
    templateUrl: './contenttype.form.component.html'
})
export class ContentTypeFormComponent extends BaseFormComponent {
    public record!: ContentTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'aIModelSettings', sectionName: 'AI Model Settings', isExpanded: true },
            { sectionKey: 'contentSources', sectionName: 'Content Sources', isExpanded: false },
            { sectionKey: 'contentItems', sectionName: 'Content Items', isExpanded: false }
        ]);
    }
}

export function LoadContentTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
