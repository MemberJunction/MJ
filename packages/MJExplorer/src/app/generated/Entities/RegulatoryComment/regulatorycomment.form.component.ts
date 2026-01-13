import { Component } from '@angular/core';
import { RegulatoryCommentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Regulatory Comments') // Tell MemberJunction about this class
@Component({
    selector: 'gen-regulatorycomment-form',
    templateUrl: './regulatorycomment.form.component.html'
})
export class RegulatoryCommentFormComponent extends BaseFormComponent {
    public record!: RegulatoryCommentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadRegulatoryCommentFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
