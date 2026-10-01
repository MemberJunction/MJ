import { NgModule } from '@angular/core';
import { RubricBuilderComponent } from './rubric-builder.component.js';
import { RubricResultComponent } from './rubric-result.component.js';
import { RubricScoringFormComponent } from './rubric-scoring-form.component.js';

@NgModule({
    imports: [RubricBuilderComponent, RubricScoringFormComponent, RubricResultComponent],
    exports: [RubricBuilderComponent, RubricScoringFormComponent, RubricResultComponent],
})
export class RubricsModule {}
