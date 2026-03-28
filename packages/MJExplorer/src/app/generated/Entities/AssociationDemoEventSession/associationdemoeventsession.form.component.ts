import { Component } from '@angular/core';
import { AssociationDemoEventSessionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Event Sessions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoeventsession-form',
    templateUrl: './associationdemoeventsession.form.component.html'
})
export class AssociationDemoEventSessionFormComponent extends BaseFormComponent {
    public record!: AssociationDemoEventSessionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

