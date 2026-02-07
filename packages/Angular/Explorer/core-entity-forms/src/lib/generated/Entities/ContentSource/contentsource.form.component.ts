import { Component } from '@angular/core';
import { ContentSourceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Content Sources') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-contentsource-form',
    templateUrl: './contentsource.form.component.html'
})
export class ContentSourceFormComponent extends BaseFormComponent {
    public record!: ContentSourceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'contentClassification', sectionName: 'Content Classification', isExpanded: true },
            { sectionKey: 'connectionDetails', sectionName: 'Connection Details', isExpanded: false },
            { sectionKey: 'contentItems', sectionName: 'Content Items', isExpanded: false },
            { sectionKey: 'contentProcessRuns', sectionName: 'Content Process Runs', isExpanded: false },
            { sectionKey: 'contentSourceParams', sectionName: 'Content Source Params', isExpanded: false }
        ]);
    }
}

export function LoadContentSourceFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
