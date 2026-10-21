---
"@memberjunction/ng-livekit-room": patch
---

The meeting room lays out through the shared media stage (`LayoutMediaStage` and its selectors from `@memberjunction/ai-realtime-client/media`), as the realtime call does: the spotlight, the filmstrip beside it, the grid, and split view's sharer and speaker. The layouts show the same people as before, with one difference: split view shows a remote share once its screen track arrives, where it showed the sharer's tile without the screen for the moment between the share being announced and its track arriving. The room's own layout selectors (`SelectDisplayParticipants`, `SelectSpotlight`, `SelectFilmstrip`, `SelectScreenShare`, `SelectSplitSpeaker`) are deprecated in favor of the shared ones.
