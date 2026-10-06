import { describe, it, expect } from 'vitest';
import {
  ClampPipBox,
  DefaultPipBox,
  MovePipBox,
  PipBoxToRect,
  PipRectToBox,
  ResizePipBox,
  PIP_MIN_HEIGHT,
  PIP_MIN_WIDTH,
} from '../lib/pip-geometry';

const STAGE = { Width: 1000, Height: 800 };

describe('picture-in-picture geometry', () => {
  it('stacks default boxes upward from the bottom-right corner, the newest in the corner', () => {
    expect(DefaultPipBox(0, STAGE)).toEqual({ Left: 664, Top: 584, Width: 320, Height: 200 });
    expect(DefaultPipBox(1, STAGE)).toEqual({ Left: 664, Top: 376, Width: 320, Height: 200 });
  });

  it('keeps a stack taller than the stage inside it', () => {
    expect(DefaultPipBox(5, STAGE).Top).toBe(0);
  });

  it('pulls a box back inside the stage and holds it between the minimum and the stage size', () => {
    expect(ClampPipBox({ Left: -50, Top: 900, Width: 50, Height: 20 }, STAGE)).toEqual({
      Left: 0,
      Top: 800 - PIP_MIN_HEIGHT,
      Width: PIP_MIN_WIDTH,
      Height: PIP_MIN_HEIGHT,
    });
    expect(ClampPipBox({ Left: 0, Top: 0, Width: 5000, Height: 5000 }, STAGE)).toEqual({ Left: 0, Top: 0, Width: 1000, Height: 800 });
  });

  it('lets a box be as small as a stage smaller than the minimum', () => {
    expect(ClampPipBox({ Left: 0, Top: 0, Width: 320, Height: 200 }, { Width: 150, Height: 100 })).toEqual({
      Left: 0,
      Top: 0,
      Width: 150,
      Height: 100,
    });
  });

  it('moves a box by a delta, stopping at the edges', () => {
    const box = { Left: 100, Top: 100, Width: 320, Height: 200 };
    expect(MovePipBox(box, 50, -20, STAGE)).toEqual({ ...box, Left: 150, Top: 80 });
    expect(MovePipBox(box, 5000, 5000, STAGE)).toEqual({ ...box, Left: 680, Top: 600 });
  });

  it('resizes a box from its bottom-right corner, between the minimum and the stage edge', () => {
    const box = { Left: 600, Top: 500, Width: 320, Height: 200 };
    expect(ResizePipBox(box, 40, 30, STAGE)).toEqual({ ...box, Width: 360, Height: 230 });
    expect(ResizePipBox(box, 1000, 1000, STAGE)).toEqual({ ...box, Width: 400, Height: 300 });
    expect(ResizePipBox(box, -1000, -1000, STAGE)).toEqual({ ...box, Width: PIP_MIN_WIDTH, Height: PIP_MIN_HEIGHT });
  });

  it('saves a box as fractions of the stage and restores it for another stage size', () => {
    const rect = PipBoxToRect({ Left: 500, Top: 400, Width: 250, Height: 200 }, STAGE);
    expect(rect).toEqual({ X: 0.5, Y: 0.5, W: 0.25, H: 0.25 });
    expect(PipRectToBox(rect, { Width: 2000, Height: 1600 })).toEqual({ Left: 1000, Top: 800, Width: 500, Height: 400 });
  });

  it('restores a saved box in whole pixels', () => {
    expect(PipRectToBox({ X: 0.264, Y: 0.14, W: 0.32, H: 1 / 3 }, { Width: 1000, Height: 600 })).toEqual({ Left: 264, Top: 84, Width: 320, Height: 200 });
  });

  it('has no fractions for a stage with no size', () => {
    expect(PipBoxToRect({ Left: 1, Top: 1, Width: 1, Height: 1 }, { Width: 0, Height: 0 })).toEqual({ X: 0, Y: 0, W: 0, H: 0 });
  });
});
