/**
 * Runtime Rules - Phase 4A (Self-Registering Architecture)
 *
 * Collection of lint rules that validate runtime behavior and patterns.
 * Rules are self-contained and automatically register with RuleRegistry when imported.
 *
 * Usage:
 *   // Simply import this module to trigger all rule registrations
 *   import './runtime-rules';
 *
 *   // Rules are now available via:
 *   RuleRegistry.getInstance().getRuntimeRules();
 *
 * Architecture:
 *   - Each rule file self-registers when imported (module-level side effect)
 *   - This index.ts imports all rules, triggering their registration
 *   - No manual registration needed in component-linter.ts
 *   - Adding a new rule: Create the file, add self-registration line, import it here
 */

// Importing these modules triggers their self-registration with RuleRegistry
// Original 13 runtime rules
import './no-import-statements';
import './no-export-statements';
import './no-require-statements';
import './no-iife-wrapper';
import './single-function-only';
import './use-function-declaration';
import './react-component-naming';
import './no-react-destructuring';
import './use-unwrap-components';
import './callbacks-passthrough-only';
import './callbacks-usage-validation';
import './pass-standard-props';
import './no-return-component';

// Phase 4A - Batch 1: 15 additional runtime rules
import './component-name-mismatch';
import './dependency-shadowing';
import './no-window-access';
import './no-use-reducer';
import './no-data-prop';
import './library-variable-names';
import './undefined-component-usage';
import './component-not-in-dependencies';
import './property-name-consistency';
import './noisy-settings-updates';
import './prop-state-sync';
import './react-hooks-rules';
import './useeffect-unstable-dependencies';
import './server-reload-on-client-operation';
import './saved-user-settings-pattern';

// Phase 4A - Batch 2: 4 complex query-related rules
import './runview-runquery-valid-properties';
import './runquery-missing-categorypath';
import './runquery-parameters-validation';
import './query-parameter-type-validation';

// Total: 32 runtime rules registered automatically
