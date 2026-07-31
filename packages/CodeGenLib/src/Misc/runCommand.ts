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
          // Capture stderr into the combined output for diagnostics, but do NOT infer
          // failure from its content. Well-behaved tools routinely print the word "error"
          // to stderr in benign contexts (deprecation notices, diagnostic text, stack-trace
          // headers) while still exiting 0 — e.g. MemberJunction's own ClassFactory
          // "no registration … so this becomes a hard error." fallback diagnostic that
          // `mj codegen manifest` emits during an MJAPI `npm run build`. Success is decided
          // solely by the process exit code below (non-zero rejects; zero resolves success).
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
          if (code === 0) {
            const elapsedTime = new Date().getTime() - startTime.getTime();
            logStatus(`COMMAND: "${command.command}" COMPLETED SUCCESSFULLY: ${elapsedTime/1000} seconds`);
            resolve({ output: output,
                      error: null!,
                      success: true,
                      elapsedTime: elapsedTime
                    });
          } else {
            reject(new Error(`Process exited with code ${code}`));
          }
        });
      });

      if (command.timeout && command.timeout > 0) {
        const { timeout } = command;
        const timeoutPromise = new Promise<CommandExecutionResult>((resolve) => {
          setTimeout(() => {
            const elapsedTime = new Date().getTime() - startTime.getTime();
            if (!cp.killed) {
              treeKill(cp.pid!);
              logStatus(`COMMAND: "${command.command}" REACHED ITS TIMEOUT AND WAS KILLED (by design) AFTER ${elapsedTime / 1000} seconds`);
              output += `Process killed after ${timeout} ms`;
            }

            // A timeout is an intended stop for long-lived commands (e.g. `npm start`
            // with an explicit timeout): the process launched fine, so report success.
            resolve({
              output: output,
              error: null!,
              success: true,
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
