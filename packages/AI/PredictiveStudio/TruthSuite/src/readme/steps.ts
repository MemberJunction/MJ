// src/readme/steps.ts — the README's runnable steps (the README is verified by executing it).
export interface ReadmeStep {
  /** 1-based order of the step in the README. */
  Index: number;
  /** 1-based README line of the opening fence. */
  Line: number;
  /** The block's text, run as one `bash -euo pipefail` script. */
  Script: string;
}

/** The README's runnable steps: the `bash readme-step` fences, in order. */
export class ReadmeSteps {
  private static readonly fenceOpen = /^```bash readme-step\s*$/;
  private static readonly placeholder = /<[a-z][a-z0-9 _-]*>/i;

  /** Every `bash readme-step` block, in order. Throws on an unclosed block or a `<placeholder>` a script cannot run. */
  public static Extract(markdown: string): ReadmeStep[] {
    const lines = markdown.split('\n');
    const steps: ReadmeStep[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!ReadmeSteps.fenceOpen.test(lines[i] || '')) continue;
      const start = i;
      const body: string[] = [];
      for (i += 1; i < lines.length && (lines[i] || '') !== '```'; i++) body.push(lines[i] || '');
      if (i >= lines.length) throw new Error(`README line ${start + 1}: readme-step block is not closed`);
      const script = body.join('\n');
      const hole = ReadmeSteps.placeholder.exec(script);
      if (hole) throw new Error(`README line ${start + 1}: readme-step block contains the placeholder ${hole[0]}; read it from .env`);
      steps.push({ Index: steps.length + 1, Line: start + 1, Script: script });
    }
    return steps;
  }
}
