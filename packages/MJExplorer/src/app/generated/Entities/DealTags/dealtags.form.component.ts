import { Component } from '@angular/core';
import { DealTagsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Deal Tags') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dealtags-form',
    templateUrl: './dealtags.form.component.html'
})
export class DealTagsFormComponent extends BaseFormComponent {
    public record!: DealTagsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

