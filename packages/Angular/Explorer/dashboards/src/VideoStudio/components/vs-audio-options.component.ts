import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
  QueryList,
  ViewChildren,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective, MJSwitchComponent } from '@memberjunction/ng-ui-components';
import { VIDEO_CAPTION_MODES, VideoCaptionMode } from '@memberjunction/video-studio-core';

export interface VideoCaptionModeOption {
  Mode: VideoCaptionMode;
  Label: string;
}

const CAPTION_MODE_LABELS: Record<VideoCaptionMode, string> = {
  Burned: 'In the video',
  Sidecar: 'Separate file',
  None: 'Off',
};

const CAPTION_MODE_ORDER: readonly VideoCaptionMode[] = ['Burned', 'Sidecar', 'None'];

/**
 * Shared audio options control (`vs-audio-options`) for Video Studio.
 * Renders a Voiceover `mj-switch` and, when Voiceover is enabled, a Captions
 * toggle-button group built from the canonical `VideoCaptionMode` values.
 */
@Component({
  standalone: true,
  selector: 'vs-audio-options, mj-vs-audio-options',
  imports: [CommonModule, FormsModule, MJButtonDirective, MJSwitchComponent],
  templateUrl: './vs-audio-options.component.html',
  styleUrls: ['./vs-audio-options.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VSAudioOptionsComponent {
  @Input() NarrationEnabled = true;
  @Output() NarrationEnabledChange = new EventEmitter<boolean>();

  @Input() CaptionsMode: VideoCaptionMode = 'Burned';
  @Output() CaptionsModeChange = new EventEmitter<VideoCaptionMode>();

  @Input() Disabled = false;

  @ViewChildren(MJButtonDirective)
  private captionButtons?: QueryList<MJButtonDirective>;

  private readonly cdr = inject(ChangeDetectorRef);

  public readonly CaptionOptions: readonly VideoCaptionModeOption[] = CAPTION_MODE_ORDER.filter(
    (mode): mode is VideoCaptionMode => (VIDEO_CAPTION_MODES as readonly string[]).includes(mode),
  ).map((mode) => ({
    Mode: mode,
    Label: CAPTION_MODE_LABELS[mode],
  }));

  public OnNarrationSwitchChange(enabled: boolean): void {
    this.NarrationEnabled = Boolean(enabled);
    this.NarrationEnabledChange.emit(this.NarrationEnabled);
    this.cdr.markForCheck();
  }

  public SelectCaptionsMode(mode: VideoCaptionMode): void {
    if (this.Disabled) {
      return;
    }
    this.CaptionsMode = mode;
    this.CaptionsModeChange.emit(mode);
    // Keep MJButtonDirective.Selected in sync even if the user clicked the already-active option
    const buttons = this.captionButtons?.toArray() ?? [];
    this.CaptionOptions.forEach((opt, idx) => {
      const btn = buttons[idx];
      if (btn) {
        btn.Selected = opt.Mode === mode;
      }
    });
    this.cdr.markForCheck();
  }
}
