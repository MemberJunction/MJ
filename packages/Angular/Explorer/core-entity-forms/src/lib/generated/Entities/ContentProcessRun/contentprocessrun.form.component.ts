import { Component } from '@angular/core';
import { ContentProcessRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContentProcessRunDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Content Process Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contentprocessrun-form',
    templateUrl: './contentprocessrun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContentProcessRunFormComponent extends BaseFormComponent {
    public record!: ContentProcessRunEntity;
} 

export function LoadContentProcessRunFormComponent() {
    LoadContentProcessRunDetailsComponent();
}
