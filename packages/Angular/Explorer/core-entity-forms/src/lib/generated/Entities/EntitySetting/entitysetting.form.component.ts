import { Component } from '@angular/core';
import { EntitySettingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Settings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-entitysetting-form',
    templateUrl: './entitysetting.form.component.html'
})
export class EntitySettingFormComponent extends BaseFormComponent {
    public record!: EntitySettingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'entityConfiguration', sectionName: 'Entity Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

