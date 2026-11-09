import { Component } from '@angular/core';
import { MJNumberPoolEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Number Pools') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjnumberpool-form',
    templateUrl: './mjnumberpool.form.component.html'
})
export class MJNumberPoolFormComponent extends BaseFormComponent {
    public record!: MJNumberPoolEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'poolConfiguration', sectionName: 'Pool Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJPhoneNumbers', sectionName: 'Phone Numbers', isExpanded: false }
        ]);
    }
}

