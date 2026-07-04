export * from './omnibar-provider';
export * from './providers/omnibar-search.provider';
export * from './providers/omnibar-record.provider';
export * from './providers/omnibar-command.provider';
export * from './providers/omnibar-agent.provider';
export * from './omnibar-palette.component';

import { LoadOmnibarSearchProvider } from './providers/omnibar-search.provider';
import { LoadOmnibarRecordProvider } from './providers/omnibar-record.provider';
import { LoadOmnibarCommandProvider } from './providers/omnibar-command.provider';
import { LoadOmnibarAgentProvider } from './providers/omnibar-agent.provider';

/**
 * Tree-shaking guard: referencing each provider's Load* keeps its
 * `@RegisterClass(OmnibarProvider, …)` registration in the bundle. Called by the
 * shell (and the class-registration manifest provides a second static path).
 */
export function LoadOmnibarProviders(): void {
    LoadOmnibarSearchProvider();
    LoadOmnibarRecordProvider();
    LoadOmnibarCommandProvider();
    LoadOmnibarAgentProvider();
}
