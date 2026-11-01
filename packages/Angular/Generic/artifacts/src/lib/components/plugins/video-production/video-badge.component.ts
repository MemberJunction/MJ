import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { type VideoBadgeVariant } from './video-status-badge';

/**
 * Pure L1 semantic badge pill component (`mj-video-badge`).
 * Renders a rounded status/category pill styled with `--mj-status-*-bg` / `-text` / `-border`
 * (or `--mj-bg-surface-sunken` / `--mj-text-secondary` for `'neutral'`) and an optional leading icon.
 */
@Component({
  standalone: true,
  selector: 'mj-video-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './video-badge.component.html',
  styleUrls: ['./video-badge.component.css'],
})
export class MJVideoBadgeComponent {
  @Input() Variant: VideoBadgeVariant = 'neutral';
  @Input() Icon: string | null = null;
}
