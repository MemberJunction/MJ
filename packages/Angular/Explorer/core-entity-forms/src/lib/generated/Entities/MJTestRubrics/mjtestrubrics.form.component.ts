import { Component } from '@angular/core';
import { MJTestRubricsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Test Rubrics') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtestrubrics-form',
    templateUrl: './mjtestrubrics.form.component.html'
})
export class MJTestRubricsFormComponent extends BaseFormComponent {
    public record!: MJTestRubricsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

