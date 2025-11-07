import { Component } from '@angular/core';
import { ContentItemAttributeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Content Item Attributes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contentitemattribute-form',
    templateUrl: './contentitemattribute.form.component.html'
})
export class ContentItemAttributeFormComponent extends BaseFormComponent {
    public record!: ContentItemAttributeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'recordMetadata', sectionName: 'Record Metadata', isExpanded: false },
            { sectionKey: 'attributeData', sectionName: 'Attribute Data', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadContentItemAttributeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
