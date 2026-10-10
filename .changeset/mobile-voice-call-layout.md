---
'@memberjunction/mobile-app': patch
---

fix(mobile-app): the voice call's transcript card stays above the controls on small phones

The voice screen is now a column with the call controls and their hint in flow at the bottom, instead of pinned 80 and 36 pt above the screen's bottom edge on top of the rest, so nothing above them can run under them (#5344). The orb's stage and the transcript card share the space between the top row (and the avatar notice, while it shows) and the controls: the card always keeps room for its label and two caption lines at the phone's text size, and the stage takes the rest up to its full size, scaling the orb, its ripples and the waveform down evenly below that (`VoiceStageLayout`). A caption longer than the card's room scrolls inside the card, kept at its latest words. In a browser harness at 375 × 667, the card ran 64 pt under the controls, 120 pt with the notice shown and 250 pt with a long caption; it now ends above them in each case, with the orb at 162 pt, or 133 pt while the notice shows. Phones with room keep the full-size orb. The stage, the card and the controls move into `VoiceCallBody`, which holds no state, so the layout is tested without a renderer.
