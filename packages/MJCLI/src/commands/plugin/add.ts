import { Args, Command, Flags } from '@oclif/core';
import { PLUGIN_CONFIG_FILENAME } from '@memberjunction/cli-core';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Phase 3 convenience: register a third-party CLI plugin by appending its
 * package specifier to `mj-cli-plugins.json` (created if absent). No MJCLI
 * changes needed to extend the CLI — add a package, register it here (plan D9).
 */
export default class PluginAdd extends Command {
  static description = 'Register a CLI plugin package in mj-cli-plugins.json so `mj` loads it at startup.';

  static examples = [
    `<%= config.bin %> <%= command.id %> @my-org/mj-plugin/plugins`,
    `<%= config.bin %> <%= command.id %> ./local-plugins/my-tool`,
  ];

  static args = {
    package: Args.string({ required: true, description: 'Plugin entry-point specifier (package name, subpath, or relative path)' }),
  };

  static flags = {
    format: Flags.string({ options: ['text', 'json'], default: 'text', description: 'Output format' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(PluginAdd);
    const configPath = resolve(process.cwd(), PLUGIN_CONFIG_FILENAME);

    // Preserve any other keys (e.g. "$comment") when rewriting.
    const config: Record<string, unknown> = existsSync(configPath)
      ? (JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>)
      : {};
    const plugins = Array.isArray(config.plugins) ? (config.plugins as string[]) : [];

    const alreadyPresent = plugins.includes(args.package);
    if (!alreadyPresent) {
      plugins.push(args.package);
      config.plugins = plugins;
      writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    }

    const result = {
      success: true,
      command: 'plugin:add',
      durationSeconds: 0,
      data: { package: args.package, configPath, alreadyPresent, plugins },
    };

    if (flags.format === 'json') {
      this.log(JSON.stringify(result, null, 2));
    } else if (alreadyPresent) {
      this.log(`Plugin "${args.package}" is already registered in ${PLUGIN_CONFIG_FILENAME}.`);
    } else {
      this.log(`Registered plugin "${args.package}" in ${PLUGIN_CONFIG_FILENAME}.`);
    }
  }
}
