import { Component } from '@angular/core';
import { AssociationDemoAdvocacyActionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Advocacy Actions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoadvocacyaction-form',
    templateUrl: './associationdemoadvocacyaction.form.component.html'
})
export class AssociationDemoAdvocacyActionFormComponent extends BaseFormComponent {
    public record!: AssociationDemoAdvocacyActionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

