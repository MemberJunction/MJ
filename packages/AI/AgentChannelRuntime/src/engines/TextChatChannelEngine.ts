/**
 * Trivial pass-through engine for the `text-chat` channel.
 *
 * Phase 1(c)(vi): the channel runtime is intentionally minimal for text chat —
 * existing direct text-agent invocations just need to flow through
 * `ChannelSession` so the resulting `AIAgentRun.AIAgentChannelID` points at the
 * text-chat channel row. There is no real-time transport, no STT/TTS, and no
 * per-turn audio loop to drive.
 *
 * This engine exists so `MJGlobal.ClassFactory.CreateInstance('TextChatChannelEngine')`
 * resolves to a concrete class registered under `AIAgentChannel.DriverClass =
 * 'TextChatChannelEngine'`. The actual orchestration (loading messages,
 * persisting results) sits on the `ChannelSession` layer and on the calling
 * site; this engine itself is a no-op surface today.
 *
 * See `plans/audio-agent-architecture.md` section 2.1 / 3.3.
 */
import { RegisterClass } from '@memberjunction/global';
import { BaseChannelEngine, ChannelRunContext, ChannelStopReason } from '../BaseChannelEngine';

@RegisterClass(BaseChannelEngine, 'TextChatChannelEngine')
export class TextChatChannelEngine extends BaseChannelEngine {
    public async Run(_ctx: ChannelRunContext): Promise<void> {
        // Phase 1(c)(vi): trivial pass-through. The caller already has the user
        // message via the AIAgentRun + ConversationDetail flow, so there is no
        // per-turn loop for this engine to drive. `ChannelSession.Run()` is
        // responsible for any actual delegation; this method exists purely so
        // the ClassFactory can resolve 'TextChatChannelEngine'.
        throw new Error(
            'TextChatChannelEngine.Run() — direct invocation not supported in Phase 1(c). ' +
            'Use ChannelSession.Run() which delegates appropriately.'
        );
    }

    public async Stop(_reason: ChannelStopReason): Promise<void> {
        // No transport, no audio buffers, no per-turn loop — nothing to tear
        // down for the trivial engine.
    }
}
