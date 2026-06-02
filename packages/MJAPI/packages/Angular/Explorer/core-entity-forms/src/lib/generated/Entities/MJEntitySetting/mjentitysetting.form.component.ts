import { Component } from '@angular/core';
import { MJEntitySettingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Settings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentitysetting-form',
    templateUrl: './mjentitysetting.form.component.html'
})
export class MJEntitySettingFormComponent extends BaseFormComponent {
    public record!: MJEntitySettingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'entityConfiguration', sectionName: 'Entity Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

