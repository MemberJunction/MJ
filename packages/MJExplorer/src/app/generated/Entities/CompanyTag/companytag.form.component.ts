import { Component } from '@angular/core';
import { CompanyTagEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Company Tags') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-companytag-form',
    templateUrl: './companytag.form.component.html'
})
export class CompanyTagFormComponent extends BaseFormComponent {
    public record!: CompanyTagEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

