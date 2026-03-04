import { Component } from '@angular/core';
import { DailyRevenueEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Daily Revenues') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dailyrevenue-form',
    templateUrl: './dailyrevenue.form.component.html'
})
export class DailyRevenueFormComponent extends BaseFormComponent {
    public record!: DailyRevenueEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

