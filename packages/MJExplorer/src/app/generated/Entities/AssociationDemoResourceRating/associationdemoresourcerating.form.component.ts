import { Component } from '@angular/core';
import { AssociationDemoResourceRatingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Resource Ratings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoresourcerating-form',
    templateUrl: './associationdemoresourcerating.form.component.html'
})
export class AssociationDemoResourceRatingFormComponent extends BaseFormComponent {
    public record!: AssociationDemoResourceRatingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

