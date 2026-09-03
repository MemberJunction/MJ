# Five-minute demo: Chrome built-in Gemma 4 in the MJ in-browser demo

Prereqs: Chrome Canary 153+ with `chrome://flags/#gemma4-for-built-in-ai` enabled and the model downloaded once;
`npm start` in `experiments/transformers-demo` (Node 20); open `http://localhost:4200/builtin-chat` **in Canary**.

1. **Connect** (5 s). Availability pill reads `available`; click Connect. Point at the activity panel: the exact API call, the session-ready line with the 9,216-token context window, and the note that no download happened.
2. **Chat** (30 s). Ask "In two sentences, why would an association want an AI assistant?" Watch the header: tokens/s, first-token time, context usage — and the green `0 network requests` badge. Expand the completion row in the activity panel to show the tokenizer-counted reply.
3. **Offline** (20 s). Turn Wi-Fi off. Badge flips to `offline — still working`. Ask "Shorten that to one sentence." It answers; still 0 requests. Turn Wi-Fi back on.
4. **Router probe** (45 s). Click Router probe, then Classify all. Twelve Betty-style requests classified into intent + target agent with JSON-schema-constrained output, ~300 ms each, scored against hand labels. Note the misses — this is a coarse router.
5. **Hybrid** (60 s). Tick Hybrid research. Ask "What's the latest MemberJunction release and what changed?" Follow the activity panel: local route → local plan (GitHub) → one fetch (blue row, URL and bytes) → local answer with the source appended. Badge shows `1 network request`. Then ask "What is 15% of 240?" — planner says `none`, 0 requests.
6. **The number** (30 s). Show the replay table in `FINDINGS-CHROME-BUILTIN-AI.md`: 447 real Betty turns, 79% agreement with Betty's own research decision, 4–5% false skips under the conservative rule, 270 ms vs Betty's 1.5 s planning prompt.

Close with the decision: wait-and-see, re-evaluate every three months; blended-inference design notes in `BLENDED-INFERENCE-ARCHITECTURE.md`.
