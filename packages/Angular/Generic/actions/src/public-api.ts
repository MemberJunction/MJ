/**
 * @memberjunction/ng-actions
 *
 * A reusable Angular module for testing and running MemberJunction Actions.
 * This package has no Kendo dependencies and can be used in any Angular application.
 */

// Module
export { ActionsModule, LoadActionsModule } from './lib/actions.module';

// Action Test Harness
export {
    ActionTestHarnessComponent,
    ActionParamValue,
    ActionResult,
    LoadActionTestHarnessComponent
} from './lib/action-test-harness/action-test-harness.component';

// Action Test Harness Dialog
export {
    ActionTestHarnessDialogComponent,
    LoadActionTestHarnessDialogComponent
} from './lib/action-test-harness-dialog/action-test-harness-dialog.component';

// Action Param Dialog
export {
    ActionParamDialogComponent,
    ActionParamDialogResult,
    LoadActionParamDialogComponent
} from './lib/action-param-dialog/action-param-dialog.component';

// Action Result Code Dialog
export {
    ActionResultCodeDialogComponent,
    ActionResultCodeDialogResult,
    LoadActionResultCodeDialogComponent
} from './lib/action-result-code-dialog/action-result-code-dialog.component';
