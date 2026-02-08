import { Component } from '@angular/core';
import { ContentItemAttributeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Content Item Attributes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-contentitemattribute-form',
    templateUrl: './contentitemattribute.form.component.html'
})
export class ContentItemAttributeFormComponent extends BaseFormComponent {
    public record!: ContentItemAttributeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'attributeData', sectionName: 'Attribute Data', isExpanded: true }
        ]);
    }
}

