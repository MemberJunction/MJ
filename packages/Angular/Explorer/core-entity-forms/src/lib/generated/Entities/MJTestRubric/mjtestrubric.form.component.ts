import { Component } from '@angular/core';
import { MJTestRubricEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Test Rubrics') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtestrubric-form',
    templateUrl: './mjtestrubric.form.component.html'
})
export class MJTestRubricFormComponent extends BaseFormComponent {
    public record!: MJTestRubricEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

