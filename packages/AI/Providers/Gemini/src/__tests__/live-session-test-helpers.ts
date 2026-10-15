import type { LiveServerMessage } from '@google/genai';
import type { GeminiConnectArgs } from '../geminiRealtime';

/** What Google sends once it has applied a connection's setup. */
export const GEMINI_SETUP_COMPLETE = { setupComplete: {} } as LiveServerMessage;

/**
 * Confirms a fake connection's setup through its message callback, as Google does once it has applied the setup. A
 * Gemini Live session puts a connection to use only after that.
 */
export function ConfirmGeminiSetup(args: Pick<GeminiConnectArgs, 'OnMessage'>): void {
    args.OnMessage(GEMINI_SETUP_COMPLETE);
}
