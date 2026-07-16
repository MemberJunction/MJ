import { Component } from '@angular/core';
import { constantcontactsegmentsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Segments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactsegments-form',
    templateUrl: './constantcontactsegments.form.component.html'
})
export class constantcontactsegmentsFormComponent extends BaseFormComponent {
    public record!: constantcontactsegmentsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

