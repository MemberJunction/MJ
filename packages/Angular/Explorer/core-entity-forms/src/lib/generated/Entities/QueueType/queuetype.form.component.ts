import { Component } from '@angular/core';
import { QueueTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadQueueTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Queue Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-queuetype-form',
    templateUrl: './queuetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QueueTypeFormComponent extends BaseFormComponent {
    public record!: QueueTypeEntity;
} 

export function LoadQueueTypeFormComponent() {
    LoadQueueTypeDetailsComponent();
}
