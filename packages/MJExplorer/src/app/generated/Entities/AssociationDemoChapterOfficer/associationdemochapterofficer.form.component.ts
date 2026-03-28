import { Component } from '@angular/core';
import { AssociationDemoChapterOfficerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Chapter Officers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemochapterofficer-form',
    templateUrl: './associationdemochapterofficer.form.component.html'
})
export class AssociationDemoChapterOfficerFormComponent extends BaseFormComponent {
    public record!: AssociationDemoChapterOfficerEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

