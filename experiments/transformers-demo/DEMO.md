# Chrome Built-in AI mode — setup and demo guide

The **Chrome Built-in AI** mode calls Chrome's Prompt API (`LanguageModel`). The model ships inside Chrome, so the
app downloads nothing and needs no key or server. This guide gets it running, shows what to click, and gives a few
examples to try. Findings and numbers are in `FINDINGS-CHROME-BUILTIN-AI.md`.

## 1. Set up Chrome (once)

1. Install Chrome Canary 153 or newer: `brew install --cask google-chrome@canary` (or from google.com/chrome/canary).
2. In Canary open `chrome://flags/#gemma4-for-built-in-ai`, set it to **Enabled**, relaunch. (Requires membership of the
   Built-in AI Early Preview Program for the Gemma 4 dev trial; without the flag the same code runs Chrome's stock
   Gemini Nano.)
3. Optional — an isolated profile so the flag and the model don't touch your normal Chrome:

   ```bash
   "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary" \
     --user-data-dir="$HOME/Library/Application Support/ChromeCanary-GemmaEAP" \
     --enable-features=OptimizationGuideManifestBroker,AIApiFoundationalModel:model_version/v4 \
     --no-first-run
   ```

   Those two features are exactly what the flag enables (from Chromium's `about_flags.cc`).
4. Verify which model Chrome will serve: open `chrome://chrome-urls`, click *Enable internal debugging pages*, then
   `chrome://on-device-internals` → **Model Status**. With the flag on you should see `gemma4_component` = Ready and
   use case `prompt_api_gemma4` = Available. Hardware floor: >4 GB VRAM or 16 GB RAM + 4 cores, 22 GB free disk.

## 2. Run the app

```bash
cd experiments/transformers-demo
nvm use 20        # Angular 18 CLI; Node 24 is reported as unsupported
npm install
npm start         # http://localhost:4200
```

Open `http://localhost:4200/builtin-chat` **in Canary** and click **Connect**. The first connect on a profile
downloads the model (~2.4 GB, needs a click); afterwards it attaches in well under a second. Other browsers show a
setup screen instead of the chat.

## 3. Try the API by hand first (DevTools console, any page in Canary)

```js
await LanguageModel.availability();                 // 'available' | 'downloadable' | 'downloading' | 'unavailable'

const s = await LanguageModel.create({
  initialPrompts: [{ role: 'system', content: 'You are a concise assistant.' }],
});
await s.prompt('In one sentence, what is a professional association?');
`${s.contextUsage} / ${s.contextWindow} tokens`;      // e.g. "63 / 9216 tokens"

// streaming
for await (const chunk of s.promptStreaming('Give me three membership benefits.')) console.log(chunk);

// JSON-schema-constrained output — what the router uses
await s.prompt('Is this a greeting? "hi there!"', {
  responseConstraint: { type: 'object', properties: { IsGreeting: { type: 'boolean' } }, required: ['IsGreeting'] },
});
s.destroy();
```

Things you will notice: no `params()`, `topK` or `temperature` on web pages (extension-only); not available in Web
Workers; `create()` needs a user gesture only when a download is required.

## 4. Five-minute walkthrough

1. **Connect.** Watch the activity panel on the right: the exact call, the 9,216-token context window, and whether a
   download happened.
2. **Chat.** Ask *"In two sentences, why would an association want an AI assistant for members?"* The header shows
   tokens/s, first-token time, context usage and a `0 network requests` badge (counted with the Resource Timing API).
3. **Offline.** Turn Wi-Fi off; the badge flips to *offline — still working*. Ask *"Shorten that to one sentence."*
   It answers and remembers the previous turn. Turn Wi-Fi back on.
4. **Router probe.** Click *Router probe* → *Classify all*. Twelve association-style requests are classified into
   intent + target agent as schema-constrained JSON (~300 ms each on a long-lived session) and scored against hand
   labels. Replace the lines with your own to see how it handles them.
5. **Hybrid research.** Tick *Hybrid research* and ask *"What's the latest MemberJunction release and what changed?"*
   Follow the panel: local route → local plan (GitHub) → one fetch (blue row) → local answer with the source. Then
   *"Who founded the American Nurses Association and when?"* (Wikipedia, two requests) and *"What is 15% of 240?"*
   (planner says `none`, no request).

## 5. Examples worth trying

- **Your own probe lines.** Paste a dozen real support questions into the probe. Watch which land in the middle
  (`answer_from_knowledge` vs `needs_research`) — that boundary is where a 2B model is least reliable.
- **Tenant-aware routing.** Add one sentence to `ROUTER_SYSTEM_PROMPT` naming your organisation and stating that
  questions about it are knowledge-base territory; it roughly halved false skips in our tests.
- **Compare with Gemini Nano.** Quit Canary, disable the flag, relaunch, reconnect: same app, stock model, about half
  the throughput.
- **Stop mid-turn.** Click *Stop* during a long reply or during a hybrid turn; the panel shows exactly where it stopped.
- **Session strategy.** The service keeps one long-lived router session and recycles it near the context limit;
  `clone()` per request measured ~1 s in Canary 155, so avoid it.

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Setup screen instead of chat | Not Canary, flag off, or page not a secure context. Use Canary with the flag; `localhost` and `file://` qualify. |
| Availability `downloadable` | Model not in this profile yet; Connect downloads it (needs a click, ~2 min on a fast link). |
| Availability `unavailable` | Hardware floor not met, or the flag's model manifest not loaded; check `chrome://on-device-internals`. |
| First reply slow after launch | Weights load into the GPU on first use (~2 s); later replies are fast. |
| Hybrid lookup fails | No network or GitHub rate limit (60/hour unauthenticated); the app says so and answers locally, marked unverified. |
| Flag edits don't stick | Chrome rewrites its flag state on exit; quit Canary before editing, or set the flag in `chrome://flags` while it runs. |
