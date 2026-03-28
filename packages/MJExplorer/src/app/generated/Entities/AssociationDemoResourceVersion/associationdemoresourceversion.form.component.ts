import { Component } from '@angular/core';
import { AssociationDemoResourceVersionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Resource Versions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoresourceversion-form',
    templateUrl: './associationdemoresourceversion.form.component.html'
})
export class AssociationDemoResourceVersionFormComponent extends BaseFormComponent {
    public record!: AssociationDemoResourceVersionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

