---
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-livekit-room": patch
---

Every meeting tile has a "Move to…" menu, beside its pin. It offers the spotlight and the strip (named Filmstrip, or Gallery in Gallery), with the tile's place disabled, then Reset layout, which puts every tile back where the call places it. The participant the call put in the spotlight is offered the spotlight alone, which pins them there. Moving to the spotlight from Gallery switches to Active speaker, as the pin does. There is no menu while pinning is off, or on the shared screen in split view.

To make room for it, `mj-media-tile` takes content marked `mjMediaTileActions` in its top corner, before the pin, shown on hover or focus; `mj-self-view` passes it on and puts its Hide button in the same corner, after it; `mj-share-preview` takes it in its top corner. `mj-media-move-menu` gains `OverVideo`, which gives its button the dark round scrim of the tile's pin.
