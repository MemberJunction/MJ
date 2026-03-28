import { Component } from '@angular/core';
import { AssociationDemoPostReactionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Post Reactions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemopostreaction-form',
    templateUrl: './associationdemopostreaction.form.component.html'
})
export class AssociationDemoPostReactionFormComponent extends BaseFormComponent {
    public record!: AssociationDemoPostReactionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

