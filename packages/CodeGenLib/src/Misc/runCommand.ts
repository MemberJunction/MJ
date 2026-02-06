import { CommandInfo } from '../Config/config';
import { spawn, ChildProcess } from 'child_process';
import { logError, logStatus } from './status_logging';
import path from 'path';
import treeKill from 'tree-kill';
import { RegisterClass } from '@memberjunction/global';

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
          // LOG but do not throw because we want to continue running the other commands
          logError(e as string);
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
      let bErrors: boolean = false;
      const commandName = command.command;
      const absPath = path.resolve(command.workingDirectory);

      logStatus(`STARTING COMMAND: "${command.command}" in location "${absPath}" with args "${command.args.join(' ')}"`);

      const commandExecution = new Promise<CommandExecutionResult>((resolve, reject) => {
        cp = spawn(commandName, command.args, {
          cwd: absPath,
          stdio: 'pipe',
          shell: true,
        });

        cp.stdout?.on('data', (data) => {
          output += data.toString();
        });

        cp.stderr?.on('data', (data) => {
          const elapsedTime = new Date().getTime() - startTime.getTime();
          const message: string = data.toString();
          output += message
          if (message.toUpperCase().indexOf('ERROR') >= 0) {
            console.error(`COMMAND: "${command.command}" FAILED: ${elapsedTime/1000} seconds`);
            bErrors = true;
          }
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
                      success: !bErrors,
                      elapsedTime: elapsedTime
                    });
          } else {
            reject(new Error(`Process exited with code ${code}`));
          }
        });
      });

      if (command.timeout && command.timeout > 0) {
        const { timeout } = command;
        const timeoutPromise = new Promise<CommandExecutionResult>((resolve, reject) => {
          setTimeout(() => {
            const elapsedTime = new Date().getTime() - startTime.getTime();
            if (!cp.killed) {
              treeKill(cp.pid!);
              console.error(`COMMAND: "${command.command}" COMPLETED ${bErrors ? ' - FAILED' : ' - SUCCESS'} IN ${elapsedTime / 1000} seconds`);
              output += `Process killed after ${timeout} ms`;
            }

            resolve({
              output: output,
              error: null!,
              success: !bErrors,
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
