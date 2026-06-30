import { Component } from '@angular/core';
import { MJConversationWidgetInstanceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Conversation Widget Instances') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjconversationwidgetinstance-form',
    templateUrl: './mjconversationwidgetinstance.form.component.html'
})
export class MJConversationWidgetInstanceFormComponent extends BaseFormComponent {
    public record!: MJConversationWidgetInstanceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

