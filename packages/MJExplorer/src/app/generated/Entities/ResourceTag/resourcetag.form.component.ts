import { Component } from '@angular/core';
import { ResourceTagEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Resource Tags') // Tell MemberJunction about this class
@Component({
    selector: 'gen-resourcetag-form',
    templateUrl: './resourcetag.form.component.html'
})
export class ResourceTagFormComponent extends BaseFormComponent {
    public record!: ResourceTagEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tagDetails', sectionName: 'Tag Details', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadResourceTagFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
