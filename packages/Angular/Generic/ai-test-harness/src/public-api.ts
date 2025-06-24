// Prevent tree shaking of components
import './lib/ai-test-harness.component';
import './lib/ai-test-harness-dialog.component';
import './lib/ai-test-harness-window.component';
import './lib/test-harness-custom-window.component';

// Public API Surface
export * from './lib/ai-test-harness.component';
export * from './lib/ai-test-harness-dialog.component';
export * from './lib/ai-test-harness-window.component';
export * from './lib/test-harness-custom-window.component';
export * from './lib/test-harness-window.service';
export * from './lib/test-harness-window-manager.service';
export * from './lib/ai-test-harness-dialog.service';
export * from './lib/agent-execution-monitor.component';
export { ExecutionNodeComponent } from './lib/agent-execution-node.component';
export * from './lib/json-viewer-window.component';
export * from './module';