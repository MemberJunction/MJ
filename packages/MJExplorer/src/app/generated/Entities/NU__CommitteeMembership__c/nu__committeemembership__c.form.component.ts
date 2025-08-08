import { Component } from '@angular/core';
import { NU__CommitteeMembership__cEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadNU__CommitteeMembership__cDetailsComponent } from "./sections/details.component"
import { LoadNU__CommitteeMembership__cTopComponent } from "./sections/top.component"

@RegisterClass(BaseFormComponent, 'Committee Memberships') // Tell MemberJunction about this class
@Component({
    selector: 'gen-nu__committeemembership__c-form',
    templateUrl: './nu__committeemembership__c.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class NU__CommitteeMembership__cFormComponent extends BaseFormComponent {
    public record!: NU__CommitteeMembership__cEntity;
} 

export function LoadNU__CommitteeMembership__cFormComponent() {
    LoadNU__CommitteeMembership__cDetailsComponent();
    LoadNU__CommitteeMembership__cTopComponent();
}
