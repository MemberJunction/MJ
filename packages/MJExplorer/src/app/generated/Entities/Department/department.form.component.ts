import { Component } from '@angular/core';
import { DepartmentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Departments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-department-form',
    templateUrl: './department.form.component.html'
})
export class DepartmentFormComponent extends BaseFormComponent {
    public record!: DepartmentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'supportAgents', sectionName: 'Support Agents', isExpanded: false },
            { sectionKey: 'categories', sectionName: 'Categories', isExpanded: false }
        ]);
    }
}

