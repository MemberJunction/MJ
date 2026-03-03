import { Component } from '@angular/core';
import { ContactTagEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contact Tags') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-contacttag-form',
    templateUrl: './contacttag.form.component.html'
})
export class ContactTagFormComponent extends BaseFormComponent {
    public record!: ContactTagEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

