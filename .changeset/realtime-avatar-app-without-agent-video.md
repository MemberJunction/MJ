---
"@memberjunction/ai": patch
"@memberjunction/ai-agents": patch
"@memberjunction/server": patch
"@memberjunction/realtime-runtime": patch
"@memberjunction/realtime-widget": patch
"@memberjunction/integration-test-suite": patch
---

An app that shows no agent video now tells the mint, and the mint asks the model for no avatar. Every browser session counted as one that could show an avatar, so a video-enabled agent's call from the embeddable widget or the mobile app, which have no channel that shows the agent's video, was steered to a model that renders avatars and minted with the avatar asked for; the browser then dropped it at connect (`host`). `StartRealtimeClientSession` takes `showsAgentVideo`: with `false` the session prep (`PrepareClientSessionInput.ShowsAgentVideo`) asks the driver for no avatar, keeps the avatar persona's voice, prefers no avatar model in the default model walk, and returns `AvatarStatusJson` with the existing reason `host` ("Audio only: this app can't show the avatar"); absent or `true` behaves as before. The argument only ever turns video off. The realtime runtime works it out from the session's channels before the mint: when no channel that could be in the session shows the agent's video (an Avatar channel switched off in the registry counts as none), the launch request carries `ShowsAgentVideo: false` (`RealtimeSessionLaunchRequest.ShowsAgentVideo`) and the stock launcher sends `showsAgentVideo: false`; a host whose Avatar channel can show it sends nothing new. The embeddable support widget's guest mint always sends it. Against a server that predates the argument, both mint without it, once, and remember (the launcher's fallback pattern). Integration check RD13 also checks that an app without agent video asks for no avatar and keeps the persona's voice.
