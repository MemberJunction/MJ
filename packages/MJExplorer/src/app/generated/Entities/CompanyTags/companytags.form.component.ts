import { Component } from '@angular/core';
import { CompanyTagsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Company Tags') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-companytags-form',
    templateUrl: './companytags.form.component.html'
})
export class CompanyTagsFormComponent extends BaseFormComponent {
    public record!: CompanyTagsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

