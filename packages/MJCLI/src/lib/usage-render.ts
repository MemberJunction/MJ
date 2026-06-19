import chalk from 'chalk';
import { SerializeResult, type MJCLIResult, type OutputFormat, type PluginUsage, type UsageDomainDetail, type UsageDomainMap } from '@memberjunction/cli-core';

type LogFn = (message: string) => void;

/**
 * Serializes a usage {@link MJCLIResult} per `--format`, via the same
 * {@link SerializeResult} the runtime host uses (single source of truth). For
 * `text`, the caller supplies pre-rendered human lines.
 */
export function emitUsage(log: LogFn, format: string, result: MJCLIResult, textLines: string[]): void {
  if (format === 'json' || format === 'md') {
    log(SerializeResult(result, format as OutputFormat));
  } else {
    textLines.forEach((line) => log(line));
  }
}

/** Human-readable tier-1 domain map. */
export function renderDomainMap(map: UsageDomainMap): string[] {
  const lines: string[] = [];
  lines.push(chalk.bold('\nmj — command domains'));
  lines.push(chalk.gray(map.guidance) + '\n');
  const pad = Math.max(...map.domains.map((d) => d.domain.length), 4);
  for (const d of map.domains) {
    const name = chalk.cyan(d.domain.padEnd(pad));
    const rt = chalk.gray(`[${d.runtime}]`);
    lines.push(`  ${name}  ${d.summary} ${rt}`);
  }
  lines.push('');
  lines.push(chalk.gray('Next: `mj <domain> usage` for that domain\'s commands, flags, and timeouts.'));
  return lines;
}

/** Human-readable tier-2 domain detail. */
export function renderDomainDetail(detail: UsageDomainDetail): string[] {
  const lines: string[] = [];
  lines.push(chalk.bold(`\nmj ${detail.domain} — commands`));
  if (detail.commands.length === 0) {
    lines.push(chalk.gray(`  (no commands registered for domain "${detail.domain}")`));
    return lines;
  }
  for (const cmd of detail.commands) {
    lines.push('');
    lines.push(`  ${chalk.cyan(cmd.command)} — ${cmd.summary}`);
    if (cmd.description) lines.push(chalk.gray(`    ${cmd.description}`));
    lines.push(`    ${chalk.gray('runtime:')} ${formatRuntime(cmd)}`);
    if (cmd.flags?.length) {
      lines.push(`    ${chalk.gray('flags:')}`);
      for (const f of cmd.flags) lines.push(`      ${chalk.yellow(f.name)} (${f.type}) — ${f.description}`);
    }
    if (cmd.examples?.length) {
      lines.push(`    ${chalk.gray('examples:')}`);
      for (const e of cmd.examples) lines.push(`      ${e}`);
    }
  }
  return lines;
}

function formatRuntime(cmd: PluginUsage): string {
  const r = cmd.runtime;
  const secs = r.typicalSeconds ? `~${r.typicalSeconds}s` : '';
  const note = r.note ? ` — ${r.note}` : '';
  return `${r.class}${secs ? ` (${secs})` : ''}${note}`;
}
