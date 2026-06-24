import { Component } from '@angular/core';
import { MJWidgetInstanceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Widget Instances') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjwidgetinstance-form',
    templateUrl: './mjwidgetinstance.form.component.html'
})
export class MJWidgetInstanceFormComponent extends BaseFormComponent {
    public record!: MJWidgetInstanceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'widgetConfiguration', sectionName: 'Widget Configuration', isExpanded: true },
            { sectionKey: 'relationships', sectionName: 'Relationships', isExpanded: true },
            { sectionKey: 'securityAndAccess', sectionName: 'Security and Access', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

