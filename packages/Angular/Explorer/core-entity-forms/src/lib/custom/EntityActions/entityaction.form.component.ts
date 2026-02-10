import { Component, inject } from '@angular/core';
import { EntityActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import { EntityActionFormComponent } from '../../generated/Entities/EntityAction/entityaction.form.component';
import { TabEvent } from '@memberjunction/ng-tabstrip';

@RegisterClass(BaseFormComponent, 'Entity Actions')
@Component({
  standalone: false,
    selector: 'mj-custom-entity-action-extended-form',
    templateUrl: './entityaction.form.component.html',
    styleUrls: ['../../../shared/form-styles.css']
})
export class EntityActionExtendedFormComponent extends EntityActionFormComponent {
    public record!: EntityActionEntity;
    private sharedService = inject(SharedService);
    private currentTab: string | null = null;

    /**
     * Convenience method to resize application container when required
     */
    public InvokeManualResize(delay?: number) {
        this.sharedService.InvokeManualResize(delay);
    }

    /**
     * Handle tab selection events
     */
    public onTabSelect(e: TabEvent) {
        this.currentTab = e.tab?.Name || null;
        this.sharedService.InvokeManualResize();
    }

    /**
     * Check if a tab is currently active
     */
    public IsCurrentTab(tabName: string): boolean {
        return this.currentTab === tabName;
    }
}
