import { NgModule } from '@angular/core';
import { RubricBuilderComponent } from './rubric-builder.component.js';
import { RubricComparisonMatrixComponent } from './comparison-matrix.component.js';
import { RubricPublishDialogComponent } from './publish-dialog.component.js';
import { RubricResultComponent } from './rubric-result.component.js';
import { RubricScoringFormComponent } from './rubric-scoring-form.component.js';
import { RubricVersionBoardComponent } from './version-board.component.js';
import { RubricVersionDiffComponent } from './version-diff.component.js';
import { RubricBandEditorComponent, RubricCategoryEditorComponent, RubricCriterionEditorComponent, RubricScaleFieldsComponent, RubricScaleLevelEditorComponent, RubricScoreEditorComponent } from './record-editors.component.js';
import { RubricCategoryHostComponent, RubricCriterionHostComponent, RubricScaleLevelHostComponent, RubricVersionHostComponent } from './form-hosts.component.js';

@NgModule({
    imports: [RubricBuilderComponent, RubricScoringFormComponent, RubricResultComponent, RubricPublishDialogComponent, RubricVersionBoardComponent, RubricVersionDiffComponent, RubricComparisonMatrixComponent, RubricCriterionEditorComponent, RubricScoreEditorComponent, RubricScaleFieldsComponent, RubricScaleLevelEditorComponent, RubricBandEditorComponent, RubricCategoryEditorComponent, RubricVersionHostComponent, RubricScaleLevelHostComponent, RubricCategoryHostComponent, RubricCriterionHostComponent],
    exports: [RubricBuilderComponent, RubricScoringFormComponent, RubricResultComponent, RubricPublishDialogComponent, RubricVersionBoardComponent, RubricVersionDiffComponent, RubricComparisonMatrixComponent, RubricCriterionEditorComponent, RubricScoreEditorComponent, RubricScaleFieldsComponent, RubricScaleLevelEditorComponent, RubricBandEditorComponent, RubricCategoryEditorComponent, RubricVersionHostComponent, RubricScaleLevelHostComponent, RubricCategoryHostComponent, RubricCriterionHostComponent],
})
export class RubricsModule {}
