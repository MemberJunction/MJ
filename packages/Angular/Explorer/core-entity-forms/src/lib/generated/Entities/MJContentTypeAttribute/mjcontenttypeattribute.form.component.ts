import { Component } from '@angular/core';
import { MJContentTypeAttributeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Content Type Attributes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontenttypeattribute-form',
    templateUrl: './mjcontenttypeattribute.form.component.html'
})
export class MJContentTypeAttributeFormComponent extends BaseFormComponent {
    public record!: MJContentTypeAttributeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

