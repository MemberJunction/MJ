import { Component } from '@angular/core';
import { MJContentItemAttributeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Content Item Attributes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontentitemattribute-form',
    templateUrl: './mjcontentitemattribute.form.component.html'
})
export class MJContentItemAttributeFormComponent extends BaseFormComponent {
    public record!: MJContentItemAttributeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'attributeData', sectionName: 'Attribute Data', isExpanded: true }
        ]);
    }
}

