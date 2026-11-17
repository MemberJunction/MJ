/**
 * @fileoverview Server-side channel plugin for the **Artifact Workspace** channel (`ArtifactWorkspace`).
 *
 * Paired with the browser's `RealtimeArtifactWorkspaceChannel` (`@memberjunction/ng-conversations`)
 * via the `MJ: AI Agent Channels` metadata row `Name: 'ArtifactWorkspace'`
 * (`ServerPluginClass: 'ArtifactWorkspaceChannelServer'`, `ClientPluginClass: 'RealtimeArtifactWorkspaceChannel'`).
 *
 * Uses `ClientOnlyChannelServer` because live editing, outline inspection, and persistence are driven
 * by `GovernedArtifactService` + `MJArtifactCollaborationServer` (`/collaboration/yjs`) and the signed-in
 * user's Angular artifact viewers (`SpreadsheetArtifactViewerPlugin`, `MarkdownArtifactViewerPlugin`,
 * `SlideDeckArtifactViewerPlugin`). The server plugin exists for registry discovery and session policy
 * enforcement; workspace tab management (`open`, `focus`, `show_version`, `refresh`, `close`) and rendered
 * pixel/state awareness are bridged via `@memberjunction/ng-conversations`.
 *
 * @module @memberjunction/ai-agents
 */

import { BaseRealtimeChannelServer } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { ClientOnlyChannelServer, LoadClientOnlyChannelServer } from './client-only-channel-server';

/** Stable channel name matching the `MJ: AI Agent Channels` metadata seed. */
export const ARTIFACT_WORKSPACE_CHANNEL_NAME = 'ArtifactWorkspace';

@RegisterClass(BaseRealtimeChannelServer, 'ArtifactWorkspaceChannelServer')
export class ArtifactWorkspaceChannelServer extends ClientOnlyChannelServer {
    public override get ChannelName(): string {
        return ARTIFACT_WORKSPACE_CHANNEL_NAME;
    }
}

/**
 * Tree-shaking prevention for {@link ArtifactWorkspaceChannelServer}'s `@RegisterClass` registration.
 */
export function LoadArtifactWorkspaceChannelServer(): void {
    LoadClientOnlyChannelServer();
}
