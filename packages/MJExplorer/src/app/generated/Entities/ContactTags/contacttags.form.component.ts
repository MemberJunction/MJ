import { Component } from '@angular/core';
import { ContactTagsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contact Tags') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-contacttags-form',
    templateUrl: './contacttags.form.component.html'
})
export class ContactTagsFormComponent extends BaseFormComponent {
    public record!: ContactTagsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

