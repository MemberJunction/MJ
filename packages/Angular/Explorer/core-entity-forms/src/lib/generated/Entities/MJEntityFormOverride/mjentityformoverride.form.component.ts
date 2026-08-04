import { Component } from '@angular/core';
import { MJEntityFormOverrideEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Form Overrides') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityformoverride-form',
    templateUrl: './mjentityformoverride.form.component.html'
})
export class MJEntityFormOverrideFormComponent extends BaseFormComponent {
    public record!: MJEntityFormOverrideEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'overrideConfiguration', sectionName: 'Override Configuration', isExpanded: true },
            { sectionKey: 'overrideDetails', sectionName: 'Override Details', isExpanded: true },
            { sectionKey: 'resolutionRules', sectionName: 'Resolution Rules', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

