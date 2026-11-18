---
"@memberjunction/ai": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-assemblyai": minor
"@memberjunction/ai-elevenlabs": minor
"@memberjunction/ai-gemini": minor
"@memberjunction/ai-inworld": minor
"@memberjunction/ai-openai": minor
"@memberjunction/ai-xai": minor
"@memberjunction/ai-realtime-client": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/server": minor
"@memberjunction/realtime-runtime": minor
---

Realtime long-call reconnect fixes from the final review of #6462.

- Security: a relay session (Vertex, HuggingFace) now persists only routing fields on its `MJ: AI Agent Sessions` row, so its owner, including a `Widget Guest`, can no longer read the system prompt, tools or initial context the relay keeps from the browser. A relay refresh that reaches an MJAPI instance without the in-memory snapshot is refused with a clear error instead of minting from the persisted copy. A direct session's persisted copy drops the duplicate provider config.
- A credential refresh re-authorizes the agent the session was minted for, from server-written state, not from the editable `Config.targetAgentID`.
- A failed planned move that goes back to the old connection now mints at most one credential per reconnect cycle, so a provider outage during the soft window no longer exhausts the per-session mint limit.
- A loss of the old connection while the call waits on it, or while an attempt is in flight, goes to the running reconnect at once: input is held from that moment, Gemini no longer ends the call, and OpenAI-protocol drivers no longer go back to a dead transport.
- The wait on the old connection follows a goAway, a shrinking connection limit and early timers; a host state handler that throws while the call goes back no longer wedges the cycle.
- A credential that a refresh replaced after the attempt connected still gets its move before it expires (Gemini).
- OpenAI Live reports `listening` again after a move; HuggingFace keeps the call when its old socket closes during a move; Gemini holds a reply owed to speech held during a failed attempt.
- Server sessions (OpenAI family, OpenAI Live, ElevenLabs, AssemblyAI, Inworld) hold a tool result sent during a reconnect and deliver it once on the new connection. The server OpenAI session keeps user turns in order and no longer merges two utterances, keeps frames that arrive with `session.created` on a reconnect, and no longer leaves an unhandled rejection when it discards a connecting socket.
- Overlapping `CloseSession` calls are shared on the normalized session ID, and the runtime skips its page-close beacon only after its own close succeeded.
