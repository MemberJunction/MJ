/**
 * A fake `navigator.mediaDevices` for camera and microphone capture: devices that can be listed and
 * unplugged, a `getUserMedia` that honours `deviceId` (`exact`, `ideal` or none) and can be made to fail or
 * wait, and tracks whose device can go away. Remove it with `vi.unstubAllGlobals()`.
 */
import { vi } from 'vitest';

/** A camera or microphone track. `stop()` fires no `ended` event, as in browsers; {@link Lose} does. */
export class FakeCaptureTrack extends EventTarget implements MediaStreamTrack {
    public contentHint = '';
    public enabled = true;
    public readonly id: string;
    public readonly muted = false;
    public onended: ((this: MediaStreamTrack, ev: Event) => void) | null = null;
    public onmute: ((this: MediaStreamTrack, ev: Event) => void) | null = null;
    public onunmute: ((this: MediaStreamTrack, ev: Event) => void) | null = null;
    public readyState: MediaStreamTrackState = 'live';
    public Stopped = false;

    constructor(
        public readonly kind: 'audio' | 'video',
        public readonly DeviceID: string,
        public readonly label: string
    ) {
        super();
        this.id = `${kind}-${DeviceID}-${Math.random().toString(36).slice(2, 8)}`;
    }

    public async applyConstraints(_constraints?: MediaTrackConstraints): Promise<void> {}
    public clone(): MediaStreamTrack {
        return this;
    }
    public getCapabilities(): MediaTrackCapabilities {
        return {};
    }
    public getConstraints(): MediaTrackConstraints {
        return {};
    }
    public getSettings(): MediaTrackSettings {
        return { deviceId: this.DeviceID };
    }
    public stop(): void {
        this.Stopped = true;
        this.readyState = 'ended';
    }
    /** The device going away: the track ends on its own and says so. */
    public Lose(): void {
        this.readyState = 'ended';
        this.dispatchEvent(new Event('ended'));
    }
}

/** A stream whose `addTrack` and `removeTrack` really change its tracks. */
export class FakeCaptureStream extends EventTarget implements MediaStream {
    public readonly active = true;
    public readonly id = `stream-${Math.random().toString(36).slice(2, 8)}`;
    public onaddtrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => void) | null = null;
    public onremovetrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => void) | null = null;

    constructor(private tracks: MediaStreamTrack[]) {
        super();
    }
    public addTrack(track: MediaStreamTrack): void {
        this.tracks.push(track);
    }
    public clone(): MediaStream {
        return this;
    }
    public getAudioTracks(): MediaStreamTrack[] {
        return this.tracks.filter((track) => track.kind === 'audio');
    }
    public getTrackById(id: string): MediaStreamTrack | null {
        return this.tracks.find((track) => track.id === id) ?? null;
    }
    public getTracks(): MediaStreamTrack[] {
        return [...this.tracks];
    }
    public getVideoTracks(): MediaStreamTrack[] {
        return this.tracks.filter((track) => track.kind === 'video');
    }
    public removeTrack(track: MediaStreamTrack): void {
        this.tracks = this.tracks.filter((t) => t !== track);
    }
}

/** One input device the fake lists. The first device of a kind is that kind's system default. */
export interface FakeInputDevice {
    DeviceID: string;
    Kind: 'videoinput' | 'audioinput';
    Label: string;
    GroupID: string;
}

class FakeDeviceInfo implements MediaDeviceInfo {
    constructor(
        public readonly deviceId: string,
        public readonly kind: MediaDeviceKind,
        public readonly label: string,
        public readonly groupId: string
    ) {}
    public toJSON(): { deviceId: string; kind: MediaDeviceKind; label: string; groupId: string } {
        return { deviceId: this.deviceId, kind: this.kind, label: this.label, groupId: this.groupId };
    }
}

/** A stand-in for `navigator.mediaDevices`. */
export class FakeMediaDevices extends EventTarget {
    public Devices: FakeInputDevice[] = [
        { DeviceID: 'cam-built-in', Kind: 'videoinput', Label: 'Built-in Camera', GroupID: 'g-built-in' },
        { DeviceID: 'cam-usb', Kind: 'videoinput', Label: 'USB Camera', GroupID: 'g-usb' },
        { DeviceID: 'mic-built-in', Kind: 'audioinput', Label: 'Built-in Microphone', GroupID: 'g-built-in' },
        { DeviceID: 'mic-headset', Kind: 'audioinput', Label: 'Headset', GroupID: 'g-headset' },
    ];
    /** Every `getUserMedia` request, in order. */
    public readonly Requests: MediaStreamConstraints[] = [];
    /** Every track handed out, in order. */
    public readonly Tracks: FakeCaptureTrack[] = [];
    /** For each request, how many tracks of the requested kind were still live when it arrived. */
    public readonly LiveAtRequest: number[] = [];
    /** Labels are hidden until a request succeeds, as browsers do before permission. */
    public Permitted = false;
    private errors: Error[] = [];
    private hold: Promise<void> | null = null;
    private release: (() => void) | null = null;

    /** Makes the next requests reject, one error each, in order. */
    public RejectNextWith(...errors: Error[]): void {
        this.errors.push(...errors);
    }

    /** Makes the next request wait until {@link ReleaseHeld} is called. */
    public HoldNext(): void {
        this.hold = new Promise<void>((resolve) => {
            this.release = resolve;
        });
    }

    public ReleaseHeld(): void {
        this.release?.();
    }

    public async getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
        this.Requests.push(constraints);
        const kind = constraints.video ? 'video' : 'audio';
        this.LiveAtRequest.push(this.Tracks.filter((t) => t.kind === kind && t.readyState === 'live').length);
        const held = this.hold;
        this.hold = null;
        if (held) {
            await held;
        }
        const error = this.errors.shift();
        if (error) {
            throw error;
        }
        const device = this.pickDevice(constraints);
        const track = new FakeCaptureTrack(device.Kind === 'videoinput' ? 'video' : 'audio', device.DeviceID, device.Label);
        this.Tracks.push(track);
        this.Permitted = true;
        return new FakeCaptureStream([track]);
    }

    public async enumerateDevices(): Promise<MediaDeviceInfo[]> {
        return this.Devices.map((d) => new FakeDeviceInfo(d.DeviceID, d.Kind, this.Permitted ? d.Label : '', d.GroupID));
    }

    /** Unplugs a device: live tracks on it end, and the browser fires `devicechange`. */
    public Unplug(deviceId: string): void {
        this.Devices = this.Devices.filter((d) => d.DeviceID !== deviceId);
        this.Tracks.filter((t) => t.DeviceID === deviceId && t.readyState === 'live').forEach((t) => t.Lose());
        this.dispatchEvent(new Event('devicechange'));
    }

    private pickDevice(constraints: MediaStreamConstraints): FakeInputDevice {
        const kind = constraints.video ? 'videoinput' : 'audioinput';
        const request = typeof constraints.video === 'object' ? constraints.video : typeof constraints.audio === 'object' ? constraints.audio : {};
        const ofKind = this.Devices.filter((d) => d.Kind === kind);
        const wanted = request.deviceId;
        const exact = typeof wanted === 'object' && !Array.isArray(wanted) ? wanted.exact : undefined;
        const ideal = typeof wanted === 'string' ? wanted : typeof wanted === 'object' && !Array.isArray(wanted) ? wanted.ideal : undefined;
        if (typeof exact === 'string') {
            const match = ofKind.find((d) => d.DeviceID === exact);
            if (!match) {
                throw NamedError('OverconstrainedError', `No device ${exact}`);
            }
            return match;
        }
        const chosen = ofKind.find((d) => d.DeviceID === ideal) ?? ofKind[0];
        if (!chosen) {
            throw NamedError('NotFoundError', 'Requested device not found');
        }
        return chosen;
    }
}

/** An error with the given name, as `getUserMedia` rejects with. */
export function NamedError(name: string, message: string): Error {
    const error = new Error(message);
    error.name = name;
    return error;
}

/** Installs a {@link FakeMediaDevices} as `navigator.mediaDevices`. */
export function InstallFakeMediaDevices(): FakeMediaDevices {
    const devices = new FakeMediaDevices();
    vi.stubGlobal('navigator', { mediaDevices: devices });
    return devices;
}
