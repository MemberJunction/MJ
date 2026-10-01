import { NgModule } from '@angular/core';
import { RubricBuilderComponent } from './rubric-builder.component.js';
import { RubricComparisonMatrixComponent } from './comparison-matrix.component.js';
import { RubricPublishDialogComponent } from './publish-dialog.component.js';
import { RubricResultComponent } from './rubric-result.component.js';
import { RubricScoringFormComponent } from './rubric-scoring-form.component.js';
import { RubricVersionDiffComponent } from './version-diff.component.js';
import { RubricBandEditorComponent, RubricCategoryEditorComponent, RubricCriterionEditorComponent, RubricScaleFieldsComponent, RubricScaleLevelEditorComponent, RubricScoreEditorComponent } from './record-editors.component.js';

@NgModule({
    imports: [RubricBuilderComponent, RubricScoringFormComponent, RubricResultComponent, RubricPublishDialogComponent, RubricVersionDiffComponent, RubricComparisonMatrixComponent, RubricCriterionEditorComponent, RubricScoreEditorComponent, RubricScaleFieldsComponent, RubricScaleLevelEditorComponent, RubricBandEditorComponent, RubricCategoryEditorComponent],
    exports: [RubricBuilderComponent, RubricScoringFormComponent, RubricResultComponent, RubricPublishDialogComponent, RubricVersionDiffComponent, RubricComparisonMatrixComponent, RubricCriterionEditorComponent, RubricScoreEditorComponent, RubricScaleFieldsComponent, RubricScaleLevelEditorComponent, RubricBandEditorComponent, RubricCategoryEditorComponent],
})
export class RubricsModule {}
