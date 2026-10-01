import { Component } from '@angular/core';
import { MJScopedNotificationConfigEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Scoped Notification Configs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjscopednotificationconfig-form',
    templateUrl: './mjscopednotificationconfig.form.component.html'
})
export class MJScopedNotificationConfigFormComponent extends BaseFormComponent {
    public record!: MJScopedNotificationConfigEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'notificationConfiguration', sectionName: 'Notification Configuration', isExpanded: true },
            { sectionKey: 'scopeDefinition', sectionName: 'Scope Definition', isExpanded: true },
            { sectionKey: 'channelSettings', sectionName: 'Channel Settings', isExpanded: true },
            { sectionKey: 'resolutionRules', sectionName: 'Resolution Rules', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

