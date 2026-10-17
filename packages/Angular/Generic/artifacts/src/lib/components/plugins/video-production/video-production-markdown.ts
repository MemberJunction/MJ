import type {
  VideoDataFormat,
  VideoDataSource,
  VideoGenerationSpec,
} from '@memberjunction/video-studio-core';

/**
 * Escapes arbitrary user/LLM/data text so markdown characters (`|`, `` ` ``, `*`, `_`, `[`, `]`, `<`, `>`, `#`, `\`)
 * and line breaks cannot break surrounding markdown tables or lists.
 */
export function EscapeMarkdown(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const raw = typeof value === 'string' ? value : String(value);
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/`/g, '\\`')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/#/g, '\\#')
    .replace(/\r?\n/g, ' ');
}

/**
 * Builds the Brief tab markdown from `Spec.Film` and `Spec.Archetype`.
 */
export function BuildBriefMarkdown(spec: VideoGenerationSpec): string {
  const film = spec?.Film;
  const archetype = spec?.Archetype;
  const lines: string[] = [];

  lines.push('## Film Brief');
  lines.push('');
  if (film) {
    const formats = Array.isArray(film.Formats)
      ? film.Formats.map(f => EscapeMarkdown(f)).join(', ')
      : '';
    lines.push('| Field | Value |');
    lines.push('| --- | --- |');
    lines.push(`| **One Sentence** | ${EscapeMarkdown(film.OneSentence)} |`);
    lines.push(`| **Audience** | ${EscapeMarkdown(film.Audience)} |`);
    lines.push(`| **Purpose** | ${EscapeMarkdown(film.Purpose)} |`);
    lines.push(`| **Duration (s)** | ${EscapeMarkdown(film.DurationSeconds)} |`);
    lines.push(`| **Formats** | ${formats} |`);
    lines.push(`| **Language** | ${EscapeMarkdown(film.Language ?? '—')} |`);
  } else {
    lines.push('_No film brief defined._');
  }

  lines.push('');
  lines.push('## Archetype');
  lines.push('');
  if (archetype) {
    lines.push('| Field | Value |');
    lines.push('| --- | --- |');
    lines.push(`| **Name** | ${EscapeMarkdown(archetype.Name)} |`);
    lines.push(`| **Archetype ID** | ${EscapeMarkdown(archetype.ArchetypeID ?? '—')} |`);
  } else {
    lines.push('_No archetype defined._');
  }

  return lines.join('\n');
}

/**
 * Builds the Style tab markdown from `Spec.Style` (palette names and values, typography,
 * composition/pacing, motion rules, texture, Keep/Avoid, and reference analyses with DoNotCopy).
 */
export function BuildStyleMarkdown(spec: VideoGenerationSpec): string {
  const style = spec?.Style;
  if (!style) {
    return '_No style specification defined._';
  }

  const lines: string[] = [];

  // Palette
  lines.push('## Palette');
  lines.push('');
  if (Array.isArray(style.Palette) && style.Palette.length > 0) {
    lines.push('| Token | Value | Usage |');
    lines.push('| --- | --- | --- |');
    for (const token of style.Palette) {
      lines.push(
        `| **${EscapeMarkdown(token.Name)}** | ${EscapeMarkdown(token.Value)} | ${EscapeMarkdown(token.Usage)} |`,
      );
    }
  } else {
    lines.push('_No palette defined._');
  }

  // Typography
  lines.push('');
  lines.push('## Typography');
  lines.push('');
  if (Array.isArray(style.Typography) && style.Typography.length > 0) {
    lines.push('| Role | Font Family | Weight | Sizes by Format | Line Height | Letter Spacing |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const typo of style.Typography) {
      const sizes = typo.SizeByFormat
        ? Object.entries(typo.SizeByFormat)
            .map(([fmt, size]) => `${EscapeMarkdown(fmt)}: ${EscapeMarkdown(size)}`)
            .join(', ')
        : '—';
      lines.push(
        `| ${EscapeMarkdown(typo.Role)} | ${EscapeMarkdown(typo.FontFamily)} | ${EscapeMarkdown(typo.Weight)} | ${sizes} | ${EscapeMarkdown(typo.LineHeight ?? '—')} | ${EscapeMarkdown(typo.LetterSpacing ?? '—')} |`,
      );
    }
  } else {
    lines.push('_No typography specifications defined._');
  }

  // Composition & Pacing
  lines.push('');
  lines.push('## Composition & Pacing');
  lines.push('');
  if (style.Composition) {
    lines.push(`- **Composition:** ${EscapeMarkdown(style.Composition)}`);
  }
  const pacing = style.Pacing;
  if (pacing) {
    lines.push(`- **Avg Seconds Between Changes:** ${EscapeMarkdown(pacing.AvgSecondsBetweenChanges)}`);
    lines.push(`- **Hold Rules:** ${EscapeMarkdown(pacing.HoldRules)}`);
    if (pacing.MinBeatDurationSeconds !== undefined) {
      lines.push(`- **Min Beat Duration (s):** ${EscapeMarkdown(pacing.MinBeatDurationSeconds)}`);
    }
    if (pacing.MaxBeatDurationSeconds !== undefined) {
      lines.push(`- **Max Beat Duration (s):** ${EscapeMarkdown(pacing.MaxBeatDurationSeconds)}`);
    }
  }

  // Motion Rules
  lines.push('');
  lines.push('## Motion Rules');
  lines.push('');
  if (Array.isArray(style.MotionRules) && style.MotionRules.length > 0) {
    lines.push('| Object Class | Easing | Duration (ms) | Notes |');
    lines.push('| --- | --- | --- | --- |');
    for (const rule of style.MotionRules) {
      lines.push(
        `| ${EscapeMarkdown(rule.ObjectClass)} | ${EscapeMarkdown(rule.Easing)} | ${EscapeMarkdown(rule.DurationMs)} | ${EscapeMarkdown(rule.Notes || '—')} |`,
      );
    }
  } else {
    lines.push('_No motion rules defined._');
  }

  // Texture
  if (style.Texture) {
    lines.push('');
    lines.push('## Texture');
    lines.push('');
    lines.push(EscapeMarkdown(style.Texture));
  }

  // Keep / Avoid
  lines.push('');
  lines.push('## Keep & Avoid');
  lines.push('');
  if (Array.isArray(style.Keep) && style.Keep.length > 0) {
    lines.push('### Keep');
    for (const item of style.Keep) {
      lines.push(`- ${EscapeMarkdown(item)}`);
    }
  }
  if (Array.isArray(style.Avoid) && style.Avoid.length > 0) {
    lines.push('');
    lines.push('### Avoid');
    for (const item of style.Avoid) {
      lines.push(`- ${EscapeMarkdown(item)}`);
    }
  }

  // Reference Analyses
  if (Array.isArray(style.References) && style.References.length > 0) {
    lines.push('');
    lines.push('## Reference Analyses');
    lines.push('');
    for (const ref of style.References) {
      lines.push(`### Reference: ${EscapeMarkdown(ref.SourceKey)}`);
      if (ref.PaletteLearned) {
        lines.push(`- **Palette Learned:** ${EscapeMarkdown(ref.PaletteLearned)}`);
      }
      if (ref.TypographyLearned) {
        lines.push(`- **Typography Learned:** ${EscapeMarkdown(ref.TypographyLearned)}`);
      }
      if (ref.CompositionLearned) {
        lines.push(`- **Composition Learned:** ${EscapeMarkdown(ref.CompositionLearned)}`);
      }
      if (ref.PacingLearned) {
        lines.push(`- **Pacing Learned:** ${EscapeMarkdown(ref.PacingLearned)}`);
      }
      if (ref.MotionLearned) {
        lines.push(`- **Motion Learned:** ${EscapeMarkdown(ref.MotionLearned)}`);
      }
      if (ref.TextureLearned) {
        lines.push(`- **Texture Learned:** ${EscapeMarkdown(ref.TextureLearned)}`);
      }
      if (Array.isArray(ref.DoNotCopy) && ref.DoNotCopy.length > 0) {
        lines.push(`- **Do Not Copy:** ${ref.DoNotCopy.map(d => EscapeMarkdown(d)).join(', ')}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function describeDataSourceId(source: VideoDataSource): string {
  switch (source.Kind) {
    case 'Query':
      return source.QueryID ?? '—';
    case 'View':
      return source.EntityName ?? '—';
    case 'Artifact':
      return source.ArtifactVersionID ?? '—';
    case 'Inline':
      return 'inline';
    default:
      return '—';
  }
}

function describeDataFormat(format?: VideoDataFormat): string {
  if (!format) {
    return '—';
  }
  const parts: string[] = [format.Kind];
  if (format.Currency) {
    parts.push(format.Currency);
  }
  if (format.Decimals !== undefined) {
    parts.push(`${format.Decimals} dec`);
  }
  return parts.join(' ');
}

function formatScalarInlineValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return EscapeMarkdown(value);
  }
  return EscapeMarkdown(JSON.stringify(value));
}

/**
 * Builds the Data tab markdown from `Spec.DataBindings` and `Spec.DataSnapshot`.
 */
export function BuildDataMarkdown(spec: VideoGenerationSpec): string {
  const bindings = spec?.DataBindings ?? [];
  const snapshot = spec?.DataSnapshot;
  const lines: string[] = [];

  lines.push('## Data Bindings');
  lines.push('');
  if (bindings.length > 0) {
    lines.push('| Key | Label | Source Kind | Source ID | Shape | Format | Inline Value |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const binding of bindings) {
      const sourceKind = binding.Source?.Kind ?? '—';
      const sourceId = binding.Source ? describeDataSourceId(binding.Source) : '—';
      const formatText = describeDataFormat(binding.Format);
      let inlineVal = '—';
      if (
        binding.Shape === 'Scalar' &&
        snapshot?.Inline &&
        Object.prototype.hasOwnProperty.call(snapshot.Inline, binding.Key)
      ) {
        inlineVal = formatScalarInlineValue(snapshot.Inline[binding.Key]);
      }
      lines.push(
        `| ${EscapeMarkdown(binding.Key)} | ${EscapeMarkdown(binding.Label ?? '—')} | ${EscapeMarkdown(sourceKind)} | ${EscapeMarkdown(sourceId)} | ${EscapeMarkdown(binding.Shape)} | ${EscapeMarkdown(formatText)} | ${inlineVal} |`,
      );
    }
  } else {
    lines.push('_No data bindings defined._');
  }

  lines.push('');
  lines.push('## Data Snapshot');
  lines.push('');
  if (snapshot) {
    lines.push(`- **As Of:** ${EscapeMarkdown(snapshot.AsOf)}`);
    if (snapshot.FileID) {
      lines.push(`- **Snapshot File ID:** ${EscapeMarkdown(snapshot.FileID)}`);
    }
    if (Array.isArray(snapshot.Sources) && snapshot.Sources.length > 0) {
      lines.push('');
      lines.push('### Snapshot Sources');
      lines.push('');
      for (const src of snapshot.Sources) {
        lines.push(`- ${EscapeMarkdown(src)}`);
      }
    }
  } else {
    lines.push('_No data snapshot captured._');
  }

  return lines.join('\n');
}
