---
"@memberjunction/ai": patch
"@memberjunction/ai-bridge-server": patch
"@memberjunction/ai-gemini": patch
---

In a multi-agent meeting with moderator mode on, a Gemini avatar's video between answers no longer takes the room's floor. The full-duplex floor gate counts an avatar piece by the audio it carries, and a piece with none (the face the avatar shows between answers) started a burst like speech: it held the floor until the 20 s safety release and counted as the agent's turn; the next piece was then cut, and each later one kept the muted burst alive, so the agent's next answer was dropped. A chunk with no speech now never starts a burst or keeps one going; inside a burst it goes with it. `RealtimeVideoFrame` gains `Idle`, which a driver sets on video the model streams between answers: the bridge engine counts such a piece as no speech, whatever its audio track holds, and the Gemini bridged avatar marks every piece outside an answer.

A bridged Gemini session now closes the client turn a context note left open, after a tool result, as the browser driver does. A note goes out as client content with `turnComplete: false`, and Gemini then holds the continuation after a tool result until a `turnComplete: true`, so the model could stay silent after a delegated result. `SendToolResult` follows the result with a bare `turnComplete: true` when a note left the turn open, on a model whose tools can block and while no answer is being generated; otherwise the model's own `turnComplete` takes the note in. Gemini 3.8 Live Extended Thinking, whose tools never block, gets no close: it may still be reasoning, and the close would cut it off.
