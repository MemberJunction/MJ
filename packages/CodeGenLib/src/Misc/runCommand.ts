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
      let output = '';
      let startTime = new Date();
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
          const elapsedTime = new Date().getTime() - startTime.getTime();
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
            if (!cp.killed) {
              treeKill(cp.pid!);
              console.error(`COMMAND: "${command.command}" TIMED OUT after ${elapsedTime / 1000} seconds`);
              output += `Process killed after ${timeout} ms`;
            }

            resolve({
              output: output,
              error: null!,
              success: false,
              elapsedTime: elapsedTime,
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
