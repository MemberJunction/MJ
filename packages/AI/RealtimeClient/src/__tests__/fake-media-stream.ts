export class FakeMediaStream extends EventTarget implements MediaStream {
    public readonly active = true;
    public readonly id = 'fake-stream';
    public onaddtrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => void) | null = null;
    public onremovetrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => void) | null = null;
    private tracks: MediaStreamTrack[];

    constructor(tracks: MediaStreamTrack[]) {
        super();
        this.tracks = tracks;
    }
    public addTrack(track: MediaStreamTrack): void {
        this.tracks.push(track);
    }
    public clone(): MediaStream {
        return this;
    }
    public getAudioTracks(): MediaStreamTrack[] {
        return this.tracks;
    }
    public getTrackById(_id: string): MediaStreamTrack | null {
        return null;
    }
    public getTracks(): MediaStreamTrack[] {
        return this.tracks;
    }
    public getVideoTracks(): MediaStreamTrack[] {
        return [];
    }
    public removeTrack(_track: MediaStreamTrack): void {}
}

