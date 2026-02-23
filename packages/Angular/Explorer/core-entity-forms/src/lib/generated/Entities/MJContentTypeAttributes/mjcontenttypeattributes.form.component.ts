import { Component } from '@angular/core';
import { MJContentTypeAttributesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Content Type Attributes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontenttypeattributes-form',
    templateUrl: './mjcontenttypeattributes.form.component.html'
})
export class MJContentTypeAttributesFormComponent extends BaseFormComponent {
    public record!: MJContentTypeAttributesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

