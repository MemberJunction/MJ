// @memberjunction/ng-entity-action-ux
// Pluggable runtime-UX framework for entity actions.

// Framework
export * from './lib/runtime-ux-context';
export * from './lib/base-entity-action-runtime-ux';
export * from './lib/entity-action-ux-host.component';

// Pure model + helpers (Angular-free, unit-testable)
export * from './lib/field-rules-model';
export * from './lib/prompt-grouping';
export * from './lib/scope';

// Drivers
export * from './lib/record-process-runner/record-process-runner-ux.component';

// Authoring components
export * from './lib/ai-prompt-selector/ai-prompt-selector.component';
export * from './lib/field-rules-builder/field-rules-builder.component';

import { RecordProcessRunnerUXComponent } from './lib/record-process-runner/record-process-runner-ux.component';

/**
 * Tree-shaking guard: references the driver classes so bundlers keep their `@RegisterClass` side effects.
 * Call once from a consumer's bootstrap (the way other MJ packages keep dynamically-resolved classes alive).
 */
export function LoadEntityActionUX(): void {
    const _keep = [RecordProcessRunnerUXComponent];
    if (_keep.length === 0) {
        throw new Error('unreachable');
    }
}
