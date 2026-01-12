import { Component } from '@angular/core';
import { ResourceEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Resources') // Tell MemberJunction about this class
@Component({
    selector: 'gen-resource-form',
    templateUrl: './resource.form.component.html'
})
export class ResourceFormComponent extends BaseFormComponent {
    public record!: ResourceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'contentOverview', sectionName: 'Content Overview', isExpanded: true },
            { sectionKey: 'fileInformation', sectionName: 'File Information', isExpanded: true },
            { sectionKey: 'engagementMetrics', sectionName: 'Engagement Metrics', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'resourceTags', sectionName: 'Resource Tags', isExpanded: false },
            { sectionKey: 'resourceDownloads', sectionName: 'Resource Downloads', isExpanded: false },
            { sectionKey: 'resourceRatings', sectionName: 'Resource Ratings', isExpanded: false },
            { sectionKey: 'resourceVersions', sectionName: 'Resource Versions', isExpanded: false }
        ]);
    }
}

export function LoadResourceFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
