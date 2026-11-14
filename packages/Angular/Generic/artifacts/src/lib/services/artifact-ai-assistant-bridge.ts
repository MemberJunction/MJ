import { GetGlobalObjectStore } from '@memberjunction/global';

const GLOBAL_STORE_BRIDGE_KEY = '___MJ_ARTIFACT_AI_ASSISTANT_BRIDGE__';

/**
 * Payload dispatched when a user invokes `/ai` or clicks "Ask AI" inside MJ Docs,
 * Slides, or Sheets so the slide-in AI Assistant opens with active editor context.
 */
export interface ArtifactAskAiRequest {
  /** Target `MJ: Artifacts.ID` currently open in the editor (if persisted). */
  ArtifactID?: string | null;
  /** Display title of the document, deck, or workbook. */
  ArtifactTitle: string;
  /** Editor surface kind. */
  ArtifactKind: 'doc' | 'slides' | 'sheet';
  /** Short human-readable context badge label (e.g., heading, slide title, or range `B2:D12`). */
  ContextLabel: string;
  /** Current text, markdown, slide JSON, or range values snippet around the cursor/selection. */
  SelectedContent?: string;
  /** Optional pre-filled prompt text for the AI Assistant composer. */
  InitialPrompt?: string;
  /** When true (Docs default), AI proposals insert as tracked suggestions rather than silent overwrites. */
  SuggestingModeDefault: boolean;
  /** Optional document segment identifier. */
  TargetSegmentID?: string;
  /** Optional slide identifier. */
  TargetSlideID?: string;
  /** Optional worksheet identifier. */
  TargetSheetID?: string;
  /** Optional cell or range reference (e.g., `'C4:E10'`). */
  TargetCellRange?: string;
  /** Callback allowing the AI Assistant widget to push proposed text back into the open editor. */
  ApplySuggestion?: (proposedText: string, asSuggestion: boolean) => void;
}

/** Handler registered by the slide-in AI Assistant widget host (`@memberjunction/ng-conversations`). */
export type ArtifactAskAiHandler = (request: ArtifactAskAiRequest) => void;

interface ArtifactAiAssistantBridgeStore {
  Handler: ArtifactAskAiHandler | null;
  PendingQueue: ArtifactAskAiRequest[];
}

const localFallbackBridgeStore: ArtifactAiAssistantBridgeStore = { Handler: null, PendingQueue: [] };

function getBridgeStore(): ArtifactAiAssistantBridgeStore {
  const store = GetGlobalObjectStore();
  if (!store) {
    return localFallbackBridgeStore;
  }
  let bridge = store[GLOBAL_STORE_BRIDGE_KEY] as ArtifactAiAssistantBridgeStore | undefined;
  if (!bridge) {
    bridge = { Handler: null, PendingQueue: [] };
    store[GLOBAL_STORE_BRIDGE_KEY] = bridge;
  }
  return bridge;
}

/**
 * Registers the active slide-in AI Assistant handler and replays any buffered request.
 * Returns an unregister callback for Angular `ngOnDestroy`.
 */
export function RegisterArtifactAiAssistantHandler(handler: ArtifactAskAiHandler): () => void {
  const bridge = getBridgeStore();
  bridge.Handler = handler;
  if (bridge.PendingQueue.length > 0) {
    const queued = bridge.PendingQueue.splice(0, bridge.PendingQueue.length);
    for (const req of queued) {
      handler(req);
    }
  }
  return () => {
    if (bridge.Handler === handler) {
      bridge.Handler = null;
    }
  };
}

/**
 * Sends an `Ask AI` request from any MJ Artifact viewer/editor to the registered
 * slide-in AI Assistant widget (queuing briefly if the overlay mounts lazily).
 */
export function RequestArtifactAiAssistant(request: ArtifactAskAiRequest): boolean {
  const bridge = getBridgeStore();
  if (bridge.Handler) {
    bridge.Handler(request);
    return true;
  }
  bridge.PendingQueue.push(request);
  return false;
}
