import { Component } from '@angular/core';
import { AccountInsightEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAccountInsightDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Account Insights') // Tell MemberJunction about this class
@Component({
    selector: 'gen-accountinsight-form',
    templateUrl: './accountinsight.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AccountInsightFormComponent extends BaseFormComponent {
    public record!: AccountInsightEntity;
} 

export function LoadAccountInsightFormComponent() {
    LoadAccountInsightDetailsComponent();
}
