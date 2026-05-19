import { Component } from '@angular/core';
import { MJInstanceConfigurationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Instance Configurations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjinstanceconfiguration-form',
    templateUrl: './mjinstanceconfiguration.form.component.html'
})
export class MJInstanceConfigurationFormComponent extends BaseFormComponent {
    public record!: MJInstanceConfigurationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'featureDefinition', sectionName: 'Feature Definition', isExpanded: true },
            { sectionKey: 'configurationSettings', sectionName: 'Configuration Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

