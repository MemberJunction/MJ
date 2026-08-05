import { RegisterClass } from '@memberjunction/global';
import { StdioJsonAdapter } from './StdioJsonAdapter.js';
import { BaseHarnessAdapter } from './BaseHarnessAdapter.js';
import { HarnessCapabilities } from '../types.js';

/**
 * Drives Pi.
 *
 * ## Why this subclasses the generic adapter instead of embedding an SDK
 *
 * Pi publishes no usable npm package. The obvious names are placeholders — `pi-coding-agent` on npm
 * literally describes itself as *"Placeholder package name reservation"* — so there is no SDK to
 * compile against and no stable published CLI contract to hard-code flags from. Inventing flags here
 * would produce an adapter that looks finished and fails at runtime, which is worse than one that is
 * honest about needing configuration.
 *
 * So Pi is driven through the documented stdio-JSON contract
 * ({@link StdioJsonAdapter}), and **`AIAgentHarness.ExecutablePath` must be set** to the Pi binary
 * for this harness row to work. Any argv the binary needs beyond the prompt goes through
 * {@link StdioJsonAdapter.Configure}.
 *
 * When Pi ships a real SDK or a documented JSON CLI, this class is where that lands — the rest of
 * the stack does not change.
 */
@RegisterClass(BaseHarnessAdapter, 'PiAdapter')
export class PiAdapter extends StdioJsonAdapter {
    public constructor() {
        super();
        this.executable = 'pi';
    }

    /** @inheritdoc */
    public override get Capabilities(): HarnessCapabilities {
        // Conservative until Pi's surface is pinned down: assume no native resume, so the runtime
        // replays context and budgets the extra tokens rather than silently losing continuity.
        // Override per-deployment via AIAgentHarness.CapabilitySettings.
        return (
            this.declaredCapabilities ?? {
                SessionResume: false,
                StructuredOutput: false,
                UsageReporting: true,
                PermissionHooks: false,
                McpClient: false,
                WorkspaceScoping: true,
                ModelSelection: true,
            }
        );
    }
}
