import { Component } from '@angular/core';
import { ContactRelationshipEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contact Relationships') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contactrelationship-form',
    templateUrl: './contactrelationship.form.component.html'
})
export class ContactRelationshipFormComponent extends BaseFormComponent {
    public record!: ContactRelationshipEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadContactRelationshipFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
