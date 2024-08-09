import { Component } from '@angular/core';
import { AIResultCacheEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIResultCacheDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'AI Result Cache') // Tell MemberJunction about this class
@Component({
    selector: 'gen-airesultcache-form',
    templateUrl: './airesultcache.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIResultCacheFormComponent extends BaseFormComponent {
    public record!: AIResultCacheEntity;
} 

export function LoadAIResultCacheFormComponent() {
    LoadAIResultCacheDetailsComponent();
}
