import { Component } from '@angular/core';
import { YourMembershipGLCodeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'GL Codes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipglcode-form',
    templateUrl: './yourmembershipglcode.form.component.html'
})
export class YourMembershipGLCodeFormComponent extends BaseFormComponent {
    public record!: YourMembershipGLCodeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'gLCodeDetails', sectionName: 'GL Code Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'invoiceItems', sectionName: 'Invoice Items', isExpanded: false }
        ]);
    }
}

