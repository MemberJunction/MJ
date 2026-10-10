/**
 * The notes a realtime model gets when the video it sees changes. A browser call (the video source arbiter) and a meeting
 * (the bridge engine) both send them, so the exact text is pinned here. These are the strings each sent before the wording
 * moved into one module; changing one changes what every model reads, in a call and in a meeting.
 */
import { describe, it, expect } from 'vitest';
import { VideoSourceEndedNote, VideoSourceSeenNote, VideoSourceTurnedOffNote, VideoSourceTurnedOnNote } from '../generic/realtimeVisionNotes';

/** A label with an apostrophe, a non-ASCII letter, brackets and a comma. */
const ODD_LABEL = "Zoë's screen [draft], v2";

describe('realtime vision notes', () => {
    describe('VideoSourceSeenNote (a meeting: a source new to the model; a call: what is in view after a switch)', () => {
        it('names one source', () => {
            expect(VideoSourceSeenNote('Camera')).toBe('[You can now see: Camera]');
            expect(VideoSourceSeenNote("Ada's screen")).toBe("[You can now see: Ada's screen]");
            expect(VideoSourceSeenNote("a participant's camera")).toBe("[You can now see: a participant's camera]");
        });

        it('names every source in view, in the order given, joined with a comma', () => {
            expect(VideoSourceSeenNote(['Screen', 'Camera'])).toBe('[You can now see: Screen, Camera]');
            expect(VideoSourceSeenNote(['Screen', 'Camera', 'Whiteboard'])).toBe('[You can now see: Screen, Camera, Whiteboard]');
        });

        it('reads the same for one source given alone or as a list of one', () => {
            expect(VideoSourceSeenNote(['Camera'])).toBe('[You can now see: Camera]');
        });
    });

    describe('VideoSourceEndedNote (a meeting: a source the model saw stopped)', () => {
        it('names the source', () => {
            expect(VideoSourceEndedNote("Bob's camera")).toBe("[You can no longer see: Bob's camera]");
            expect(VideoSourceEndedNote("Ada's camera")).toBe("[You can no longer see: Ada's camera]");
            expect(VideoSourceEndedNote("a participant's screen")).toBe("[You can no longer see: a participant's screen]");
        });
    });

    describe('VideoSourceTurnedOffNote and VideoSourceTurnedOnNote (a call: the user turned a source off, or back on)', () => {
        it('says the user turned it off', () => {
            expect(VideoSourceTurnedOffNote('Whiteboard')).toBe('[You can no longer see: Whiteboard (the user turned it off)]');
            expect(VideoSourceTurnedOffNote('Camera')).toBe('[You can no longer see: Camera (the user turned it off)]');
            expect(VideoSourceTurnedOffNote('Screen')).toBe('[You can no longer see: Screen (the user turned it off)]');
        });

        it('says it was turned back on', () => {
            expect(VideoSourceTurnedOnNote('Whiteboard')).toBe('[You can now see: Whiteboard (turned back on)]');
            expect(VideoSourceTurnedOnNote('Camera')).toBe('[You can now see: Camera (turned back on)]');
            expect(VideoSourceTurnedOnNote('Screen')).toBe('[You can now see: Screen (turned back on)]');
        });
    });

    it('puts a label in as given, with no escaping or quoting', () => {
        expect(VideoSourceSeenNote(ODD_LABEL)).toBe("[You can now see: Zoë's screen [draft], v2]");
        expect(VideoSourceEndedNote(ODD_LABEL)).toBe("[You can no longer see: Zoë's screen [draft], v2]");
        expect(VideoSourceTurnedOffNote(ODD_LABEL)).toBe("[You can no longer see: Zoë's screen [draft], v2 (the user turned it off)]");
        expect(VideoSourceTurnedOnNote(ODD_LABEL)).toBe("[You can now see: Zoë's screen [draft], v2 (turned back on)]");
    });
});
