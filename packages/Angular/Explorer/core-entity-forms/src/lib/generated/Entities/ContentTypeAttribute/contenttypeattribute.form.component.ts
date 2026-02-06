import { Component } from '@angular/core';
import { ContentTypeAttributeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Content Type Attributes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-contenttypeattribute-form',
    templateUrl: './contenttypeattribute.form.component.html'
})
export class ContentTypeAttributeFormComponent extends BaseFormComponent {
    public record!: ContentTypeAttributeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadContentTypeAttributeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
