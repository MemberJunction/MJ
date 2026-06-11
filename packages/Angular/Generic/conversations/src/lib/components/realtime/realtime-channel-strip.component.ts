import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/** A single channel chip in the session's channel strip. */
export interface RealtimeChannel {
  /** Stable id for tracking. */
  Id: string;
  /** Display label (e.g. "Voice", "Text"). */
  Label: string;
  /** Font Awesome icon class (e.g. "fa-microphone-lines"). */
  Icon: string;
  /** Channel status — drives the chip styling + live dot. */
  Status: 'live' | 'opening' | 'off';
}

/**
 * The channel strip (mirrors `.channel-bar` in live-session.html + the `.chan-strip` in
 * session-channels.html). Renders a LIST of channel chips so additional channels (whiteboard,
 * screen-share, …) slot in later without markup changes. Defaults to the always-present
 * "🎙 Voice live now" channel; hosts can override via {@link Channels}.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-channel-strip',
  imports: [CommonModule],
  templateUrl: './realtime-channel-strip.component.html',
  styleUrl: './realtime-channel-strip.component.css'
})
export class RealtimeChannelStripComponent {
  private _channels: RealtimeChannel[] = [
    { Id: 'voice', Label: 'Voice', Icon: 'fa-microphone-lines', Status: 'live' }
  ];

  /** The channels to render. Defaults to a single live Voice channel. */
  @Input()
  set Channels(value: RealtimeChannel[] | null) {
    this._channels = value && value.length > 0 ? value : this._channels;
  }
  get Channels(): RealtimeChannel[] {
    return this._channels;
  }

  /** track fn for the channel @for. */
  public TrackChannel(_index: number, channel: RealtimeChannel): string {
    return channel.Id;
  }
}
