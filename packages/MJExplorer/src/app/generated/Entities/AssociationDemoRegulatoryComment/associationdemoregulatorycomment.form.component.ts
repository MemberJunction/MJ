import { Component } from '@angular/core';
import { AssociationDemoRegulatoryCommentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Regulatory Comments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoregulatorycomment-form',
    templateUrl: './associationdemoregulatorycomment.form.component.html'
})
export class AssociationDemoRegulatoryCommentFormComponent extends BaseFormComponent {
    public record!: AssociationDemoRegulatoryCommentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

