import { CommandInfo, currentWorkingDirectory } from '../Config/config';
import { spawn, ChildProcess } from 'child_process';
import { logError, logStatus } from './status_logging';
import path from 'path';
import treeKill from 'tree-kill';

export type CommandExecutionResult = {
  output: string;
  error: string;
  success: boolean;
  elapsedTime: number;
}

const FAILURE_OUTPUT_TAIL_LINES = 40;

/**
 * Combine the exit-code message with a tail of captured stdout/stderr so AFTER
 * failures show the actual tsc/pnpm diagnostic instead of just "exited with code N".
 */
export function formatCommandFailureDetail(result: CommandExecutionResult, tailLines: number = FAILURE_OUTPUT_TAIL_LINES): string {
  const parts: string[] = [];
  const errorText = (result.error || '').trim();
  if (errorText) {
    parts.push(errorText);
  }
  const output = (result.output || '').trim();
  if (output) {
    const lines = output.split(/\r?\n/);
    const kept = lines.length > tailLines ? ['…', ...lines.slice(-tailLines)] : lines;
    parts.push(kept.join('\n'));
  }
  return parts.join('\n');
}

/**
 * Base class that handles the process of running commands which can be done executed from any other area of the system, typically done by the main runMemberJunctionCodeGen process
 */
export class RunCommandsBase {
  public async runCommands(commands: CommandInfo[]): Promise<CommandExecutionResult[]>{
    try {
      const results: CommandExecutionResult[] = [];

      for (const command of commands) {
        try {
          // do this in a safe way so that if one command fails, the others can still run
          results.push(await this.runCommand(command));
        }
        catch (e) {
          // A failed command (non-zero exit / spawn error) rejects. Record it as a
          // failed result instead of dropping it — so callers can detect and report
          // the failure, and `results` stays index-aligned with `commands`. We still
          // don't rethrow, so the remaining commands continue to run.
          const message = e instanceof Error ? e.message : String(e);
          logError(message);
          results.push({ output: '', error: message, success: false, elapsedTime: 0 });
        }
      }

      return results
    }
    catch (e) {
      logError(e as string)
      throw e;
    }
  }


  public async runCommand(command: CommandInfo ): Promise<CommandExecutionResult> {
    let cp: ChildProcess = null!;
    try {
      if (command.isDaemon === true && !(command.timeout && command.timeout > 0)) {
        const message =
          `Command "${command.command}" is marked isDaemon but has no timeout. A daemon never exits on its own, ` +
          `so CodeGen would wait forever. Set timeout (ms) to how long the service needs to boot.`;
        logError(message);
        return { output: '', error: message, success: false, elapsedTime: 0 };
      }

      let output = '';
      let startTime = new Date();
      // Set when the timeout ends the observation window and kills the child itself.
      // The child's `close` then fires moments later for a kill we performed, which is
      // not the daemon coming down on its own — see the daemon branch in `close`.
      let endedByObservationWindow = false;
      const commandName = command.command;
      const absPath = path.resolve(currentWorkingDirectory, command.workingDirectory);

      logStatus(`STARTING COMMAND: "${command.command}" in location "${absPath}" with args "${command.args.join(' ')}"`);

      // When shell:true, Node deprecates passing a separate args array (DEP0190) because
      // the shell concatenates them anyway. Build the full command line ourselves and pass
      // it as a single string so the spawn behavior is identical without the warning.
      const fullCommand = command.args.length > 0
        ? `${commandName} ${command.args.join(' ')}`
        : commandName;

      const commandExecution = new Promise<CommandExecutionResult>((resolve, reject) => {
        cp = spawn(fullCommand, {
          cwd: absPath,
          stdio: 'pipe',
          shell: true,
        });

        cp.stdout?.on('data', (data) => {
          output += data.toString();
        });

        cp.stderr?.on('data', (data) => {
          // tsc / npm / pnpm write the word "error" to stderr on successful
          // builds (TS diagnostics that were not emitted, deprecation banners,
          // progress). Exit code is the only honest success signal.
          output += data.toString();
        });

        cp.on('error', (error) => {
          const elapsedTime = new Date().getTime() - startTime.getTime();
          console.error(`COMMAND: "${command.command}" FAILED: ${elapsedTime/1000} seconds`);
          if (!cp.killed)
            treeKill(cp.pid!);
          reject(error);
        });

        cp.on('close', (code) => {
          // We ended the window ourselves and killed the child, so this close is our
          // own doing and the race has already settled. Every branch below would
          // narrate it as an outcome: the daemon branch as a daemon failure, and —
          // because a killed child closes with a null code, never 0 — the generic
          // branch as `FAILED: … (Process exited with code null)`, printed directly
          // under `STAYED UP … boot check passed`. The verdict stays right either way,
          // but the AFTER log and the diagnostic report would say pass and fail back to
          // back, and a misread log is the failure this whole change exists to prevent.
          if (endedByObservationWindow) {
            return;
          }

          const elapsedTime = new Date().getTime() - startTime.getTime();

          // A daemon's entire assertion is that it STAYS UP, so any close before the
          // timeout is a failure — exit 0 included. Exit 0 is not the harmless case
          // here, it is the dangerous one: MJAPI's entry point is
          // `createMJServer({ resolverPaths }).catch(console.error)`, so a boot failure
          // is caught, logged and never re-thrown, and Node then exits 0 once the event
          // loop drains. Treating that as success would report a server that never came
          // up as a passing boot check — the inverse of the bug isDaemon was added for.
          // ...unless WE ended the window. The timeout kills the child on the way out,
          // so its close arrives for a kill we performed, after the race has already
          // settled as a pass. Reporting that as a daemon failure would print the
          // opposite of what happened right after a successful boot check.
          if (command.isDaemon === true && !endedByObservationWindow) {
            const message = `Daemon exited with code ${code} after ${elapsedTime} ms instead of staying up for its ${command.timeout} ms boot window`;
            console.error(`COMMAND: "${command.command}" FAILED: ${elapsedTime / 1000} seconds (${message})`);
            resolve({
              output,
              error: message,
              success: false,
              elapsedTime,
            });
            return;
          }

          if (code === 0) {
            logStatus(`COMMAND: "${command.command}" COMPLETED SUCCESSFULLY: ${elapsedTime/1000} seconds`);
            resolve({
              output,
              error: null!,
              success: true,
              elapsedTime,
            });
            return;
          }

          // Resolve (do not reject) so callers keep stdout/stderr. The previous
          // reject-on-nonzero path dropped the captured output and left AFTER
          // failures looking like a bare "Process exited with code N".
          const message = `Process exited with code ${code}`;
          console.error(`COMMAND: "${command.command}" FAILED: ${elapsedTime/1000} seconds (${message})`);
          resolve({
            output,
            error: message,
            success: false,
            elapsedTime,
          });
        });
      });

      if (command.timeout && command.timeout > 0) {
        const { timeout } = command;
        const timeoutPromise = new Promise<CommandExecutionResult>((resolve) => {
          setTimeout(() => {
            const elapsedTime = new Date().getTime() - startTime.getTime();
            // A daemon has no exit of its own — staying up for the whole budget is
            // the pass. Anything else that reaches the timeout has hung.
            const isDaemon = command.isDaemon === true;
            endedByObservationWindow = true;
            if (!cp.killed) {
              treeKill(cp.pid!);
              if (isDaemon) {
                logStatus(`COMMAND: "${command.command}" STAYED UP for ${elapsedTime / 1000} seconds — daemon boot check passed.`);
              } else {
                console.error(`COMMAND: "${command.command}" TIMED OUT after ${elapsedTime / 1000} seconds`);
              }
              output += `Process killed after ${timeout} ms`;
            }

            resolve({
              output,
              error: isDaemon ? null! : `Timed out after ${timeout} ms`,
              success: isDaemon,
              elapsedTime,
            });
          }, timeout);
        });

        return Promise.race([
          commandExecution,
          timeoutPromise,
        ]);
      }
      else
        return commandExecution
    }
    catch (e) {
      logError(e as string)
      try {
        if (cp && !cp.killed)
          treeKill(cp.pid!);
      }
      catch (e) {
        logError(e as string)
      }
      throw e;
    }
  }
}
