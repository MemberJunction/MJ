import { Component } from '@angular/core';
import { MJContentItemAttributesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Content Item Attributes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontentitemattributes-form',
    templateUrl: './mjcontentitemattributes.form.component.html'
})
export class MJContentItemAttributesFormComponent extends BaseFormComponent {
    public record!: MJContentItemAttributesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'attributeData', sectionName: 'Attribute Data', isExpanded: true }
        ]);
    }
}

