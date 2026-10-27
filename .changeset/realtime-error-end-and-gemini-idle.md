---
"@memberjunction/realtime-runtime": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ng-conversations": patch
---

Follow-ups to the realtime runtime's new failure teardown. A call that ends over a failure now keeps its end reason when the host reacts to it: the runtime claims its `Error` teardown before it reports the `'error'` state, so a host that ends the call the moment it sees that state (MobileApp's voice screen does) joins that teardown instead of closing the row as `Explicit`. Explorer's chat area now tells the user when a voice call ends over a failure — a dropped connection, a start that failed, or a call that reached its time limit — where the call surface used to vanish without a word. On Gemini Live Extended Thinking, a reply requested as narration stays narration when the server ends the turn and the interaction in one frame (it used to be captioned and saved as a normal turn), and a context note the finished turn already consumed is no longer committed at the end of the interaction, which made the model speak a second, unprompted time; the commit is kept for the non-blocking tool response it exists for.
