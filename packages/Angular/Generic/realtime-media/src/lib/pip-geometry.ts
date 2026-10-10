/**
 * Framework-free geometry for picture-in-picture boxes on `mj-media-stage`: where a box goes before the user moves it,
 * how a drag or a resize changes it, and how it is kept inside the stage. Boxes are pixels relative to the stage; a
 * saved box is fractions of the stage (`MediaPipRect`, from `@memberjunction/ai-realtime-client/media`, which also
 * reads and writes a host's saved boxes), so a layout survives a resized window.
 */
import type { MediaPipRect } from '@memberjunction/ai-realtime-client/media';

/** A box in pixels, relative to the stage's top-left corner. */
export interface MediaStageBox {
  Left: number;
  Top: number;
  Width: number;
  Height: number;
}

/** The stage's size in pixels. */
export interface MediaStageSize {
  Width: number;
  Height: number;
}

/** A picture-in-picture box's size before the user resizes it. */
export const PIP_DEFAULT_WIDTH = 320;
export const PIP_DEFAULT_HEIGHT = 200;

/** The smallest a picture-in-picture box may be resized to. */
export const PIP_MIN_WIDTH = 200;
export const PIP_MIN_HEIGHT = 120;

/** The space between the stage's edge and the boxes stacked in its corner, and between those boxes. */
export const PIP_MARGIN = 16;
export const PIP_GAP = 8;

/** How far one arrow key press moves or resizes a box. */
export const PIP_KEY_STEP = 16;

/**
 * Where a box goes before the user moves it: stacked upward from the stage's bottom-right corner, the newest
 * (`index` 0) in the corner. `keepClear` is a box along the stage's foot that the stack stands on, such as the host's
 * call controls: when the box in the corner would cover any of it, the stack starts above its top edge instead of at
 * the stage's bottom. A stack taller than the room keeps going past the top; {@link ClampPipBox} pulls each box back
 * inside.
 */
export function DefaultPipBox(index: number, stage: MediaStageSize, keepClear: MediaStageBox | null = null): MediaStageBox {
  const inCorner = {
    Left: stage.Width - PIP_MARGIN - PIP_DEFAULT_WIDTH,
    Top: stage.Height - PIP_MARGIN - PIP_DEFAULT_HEIGHT,
    Width: PIP_DEFAULT_WIDTH,
    Height: PIP_DEFAULT_HEIGHT,
  };
  const lift = keepClear && boxesOverlap(inCorner, keepClear) ? stage.Height - keepClear.Top : 0;
  const box = { ...inCorner, Top: inCorner.Top - lift - index * (PIP_DEFAULT_HEIGHT + PIP_GAP) };
  return ClampPipBox(box, stage);
}

/**
 * Keeps a box inside the stage: no smaller than the minimum (unless the stage itself is smaller), no larger than
 * the stage, and moved back inside when it crosses an edge.
 */
export function ClampPipBox(box: MediaStageBox, stage: MediaStageSize): MediaStageBox {
  const width = clamp(box.Width, Math.min(PIP_MIN_WIDTH, stage.Width), stage.Width);
  const height = clamp(box.Height, Math.min(PIP_MIN_HEIGHT, stage.Height), stage.Height);
  return {
    Left: clamp(box.Left, 0, stage.Width - width),
    Top: clamp(box.Top, 0, stage.Height - height),
    Width: width,
    Height: height,
  };
}

/** A box moved by a pointer or key delta, kept inside the stage. */
export function MovePipBox(box: MediaStageBox, dx: number, dy: number, stage: MediaStageSize): MediaStageBox {
  return ClampPipBox({ ...box, Left: box.Left + dx, Top: box.Top + dy }, stage);
}

/** A box resized from its bottom-right corner by a pointer or key delta, kept inside the stage. */
export function ResizePipBox(box: MediaStageBox, dw: number, dh: number, stage: MediaStageSize): MediaStageBox {
  const width = clamp(box.Width + dw, Math.min(PIP_MIN_WIDTH, stage.Width), stage.Width - box.Left);
  const height = clamp(box.Height + dh, Math.min(PIP_MIN_HEIGHT, stage.Height), stage.Height - box.Top);
  return ClampPipBox({ ...box, Width: width, Height: height }, stage);
}

/** A box as fractions of the stage, for saving. A stage with no size has no fractions: every value is 0. */
export function PipBoxToRect(box: MediaStageBox, stage: MediaStageSize): MediaPipRect {
  if (stage.Width <= 0 || stage.Height <= 0) {
    return { X: 0, Y: 0, W: 0, H: 0 };
  }
  return { X: box.Left / stage.Width, Y: box.Top / stage.Height, W: box.Width / stage.Width, H: box.Height / stage.Height };
}

/** A saved box back in whole pixels for the stage's current size, kept inside it. */
export function PipRectToBox(rect: MediaPipRect, stage: MediaStageSize): MediaStageBox {
  const box = {
    Left: Math.round(rect.X * stage.Width),
    Top: Math.round(rect.Y * stage.Height),
    Width: Math.round(rect.W * stage.Width),
    Height: Math.round(rect.H * stage.Height),
  };
  return ClampPipBox(box, stage);
}


function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Whether two boxes share any area; boxes that only touch do not. */
function boxesOverlap(a: MediaStageBox, b: MediaStageBox): boolean {
  return a.Left < b.Left + b.Width && b.Left < a.Left + a.Width && a.Top < b.Top + b.Height && b.Top < a.Top + a.Height;
}
