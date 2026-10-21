---
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-realtime-media": minor
---

A new realtime channel shows the agent's video when the model sends one (an avatar): **Avatar** (`RealtimeAvatarChannel`), with an `MJ: AI Agent Channels` row on the generic `ClientOnlyChannelServer` whose `UIConfig` places its surface on the stage. It is in every call and inert without video: open from the start, it gives the agent no verbs, nouns or instructions (the agent's channel note leaves it out) and shows the agent nothing. It sinks outbound video, so the session requests the agent's video when it connects; when the video arrives, the runtime marks the channel as used and the overlay brings its surface up where the row places it. The surface (`mj-realtime-avatar-surface`) shows the video in an `mj-media-tile`. `mj-media-tile` now labels a shown avatar "AI-generated video" for as long as it shows one; its chips sit in a row in the tile's top-left corner, so the label and "Sharing" can show together.
