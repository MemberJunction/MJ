#!/usr/bin/env node
// ==============================================================================
// Citizen Agent Builder - setup status file
//
// Writes .mj-status.json in the workspace folder so a coding agent (and anyone
// curious) can see what the container is doing, how long that step usually
// takes, and what went wrong, without reading container logs.
//
// Usage (from scripts/docker-entrypoint.sh):
//   node builder-status.mjs phase <id> <step> <steps> <label> <typical> [message]
//   node builder-status.mjs heartbeat
//   node builder-status.mjs waiting <message> [until-iso]
//   node builder-status.mjs resume
//   node builder-status.mjs warn <message>
//   node builder-status.mjs fail <summary> <what-to-do> [log-file]
//   node builder-status.mjs ready <explorer-url> <api-url>
// ==============================================================================
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

const STATUS_FILE = process.env.MJ_STATUS_FILE || '/work/.mj-status.json';
const LOG_TAIL_LINES = 40;

function load() {
  if (!existsSync(STATUS_FILE)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(STATUS_FILE, 'utf8'));
  } catch {
    return null; // A half-written or hand-edited file is replaced, not trusted.
  }
}

/** A container start begins a fresh status, so a stale "failed" from an earlier boot never lingers. */
function fresh() {
  const now = new Date().toISOString();
  return { schema: 1, state: 'starting', startedAt: now, updatedAt: now, phase: null, message: '', warnings: [], error: null, urls: null };
}

/** Write atomically: readers never see a partial file. */
function save(status) {
  status.updatedAt = new Date().toISOString();
  const temp = `${STATUS_FILE}.tmp`;
  writeFileSync(temp, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
  renameSync(temp, STATUS_FILE);
}

function tail(file) {
  if (!file || !existsSync(file)) {
    return '';
  }
  const lines = readFileSync(file, 'utf8').split('\n');
  return lines.slice(-LOG_TAIL_LINES).join('\n').trim();
}

const [command, ...args] = process.argv.slice(2);
const status = command === 'start' ? fresh() : (load() ?? fresh());

switch (command) {
  case 'start':
    status.message = 'The container is starting.';
    break;
  case 'phase': {
    const [id, step, steps, label, typical, message] = args;
    status.state = 'working';
    status.phase = { id, step: Number(step), steps: Number(steps), label, typical, startedAt: new Date().toISOString() };
    status.message = message || `${label}. This usually takes ${typical}.`;
    status.error = null;
    break;
  }
  case 'heartbeat':
    break; // save() refreshes updatedAt, which is how a reader tells "busy" from "dead".
  case 'waiting': {
    const [message, until] = args;
    status.state = 'waiting';
    status.message = message;
    status.waitingUntil = until || null;
    break;
  }
  case 'resume':
    status.state = 'working';
    status.waitingUntil = null;
    status.message = status.phase ? `${status.phase.label}. This usually takes ${status.phase.typical}.` : '';
    break;
  case 'warn':
    status.warnings = [...(status.warnings ?? []), args[0]];
    break;
  case 'fail': {
    const [summary, whatToDo, logFile] = args;
    status.state = 'failed';
    status.message = summary;
    status.error = { phase: status.phase?.id ?? null, summary, whatToDo, logTail: tail(logFile) };
    break;
  }
  case 'ready': {
    const [explorer, api] = args;
    status.state = 'ready';
    status.phase = null;
    status.error = null;
    status.waitingUntil = null;
    status.urls = { explorer, api };
    status.message = (status.warnings ?? []).length > 0
      ? 'MemberJunction is running, with warnings. See "warnings".'
      : 'MemberJunction is running.';
    break;
  }
  default:
    console.error(`builder-status: unknown command '${command}'`);
    process.exit(2);
}

save(status);
