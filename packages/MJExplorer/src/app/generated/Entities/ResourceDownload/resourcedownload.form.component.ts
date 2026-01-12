import { Component } from '@angular/core';
import { ResourceDownloadEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Resource Downloads') // Tell MemberJunction about this class
@Component({
    selector: 'gen-resourcedownload-form',
    templateUrl: './resourcedownload.form.component.html'
})
export class ResourceDownloadFormComponent extends BaseFormComponent {
    public record!: ResourceDownloadEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'downloadActivity', sectionName: 'Download Activity', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadResourceDownloadFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
