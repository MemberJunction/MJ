import { Component } from '@angular/core';
import { constantcontactevents_copyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Events Copies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactevents_copy-form',
    templateUrl: './constantcontactevents_copy.form.component.html'
})
export class constantcontactevents_copyFormComponent extends BaseFormComponent {
    public record!: constantcontactevents_copyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

