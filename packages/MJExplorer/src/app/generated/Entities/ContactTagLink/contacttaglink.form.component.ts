import { Component } from '@angular/core';
import { ContactTagLinkEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contact Tag Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contacttaglink-form',
    templateUrl: './contacttaglink.form.component.html'
})
export class ContactTagLinkFormComponent extends BaseFormComponent {
    public record!: ContactTagLinkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tagAssignment', sectionName: 'Tag Assignment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadContactTagLinkFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
