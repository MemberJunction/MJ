import { Component } from '@angular/core';
import { ChannelMessageTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadChannelMessageTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Channel Message Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-channelmessagetype-form',
    templateUrl: './channelmessagetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ChannelMessageTypeFormComponent extends BaseFormComponent {
    public record!: ChannelMessageTypeEntity;
} 

export function LoadChannelMessageTypeFormComponent() {
    LoadChannelMessageTypeDetailsComponent();
}
