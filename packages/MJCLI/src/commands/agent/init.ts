import { Args, Command, Flags } from '@oclif/core';
import { existsSync, mkdirSync, cpSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import ora from 'ora-classic';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default class AgentInit extends Command {
  static description =
    'Initialize a MemberJunction Citizen Agent Builder environment in the current or specified directory, including Docker setup.';

  static aliases = ['ai:agents:init'];

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> ./my-agent-workspace',
    '<%= config.bin %> <%= command.id %> --no-start',
    '<%= config.bin %> <%= command.id %> --app https://github.com/BlueCypress/bc-sampledata',
  ];

  static args = {
    dir: Args.string({
      description: 'Target directory for the agent builder environment (default: current directory).',
      required: false,
      default: '.',
    }),
  };

  static flags = {
    force: Flags.boolean({
      char: 'f',
      description: 'Overwrite existing files in target directory if they already exist.',
      default: false,
    }),
    start: Flags.boolean({
      char: 's',
      description: 'Start Docker containers and run bootstrap immediately after initialization (pass --no-start to skip).',
      default: true,
      allowNo: true,
    }),
    app: Flags.string({
      description: 'Open App Git URL to install for business context (default: More Cheese).',
    }),
    'skip-docker-check': Flags.boolean({
      description: 'Skip verifying whether Docker Desktop is currently running.',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AgentInit);
    const targetDir = path.resolve(process.cwd(), args.dir);

    this.log(chalk.bold.cyan('\n🚀 MemberJunction Citizen Agent Builder\n'));

    // 1. Resolve template directory
    const templateDir = this.resolveTemplateDir();
    if (!templateDir) {
      this.error(
        chalk.red('✗ Citizen Agent Builder template assets could not be located.\n') +
          'Please ensure @memberjunction/cli is properly installed.'
      );
    }

    // 2. Check Docker availability & attempt auto-launch if stopped on macOS
    const dockerAvailable = flags['skip-docker-check'] ? false : this.ensureDockerRunning();

    // 3. Ensure target directory exists
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    // 4. Check for existing files
    const agentsMdPath = path.join(targetDir, 'AGENTS.md');
    if (existsSync(agentsMdPath) && !flags.force) {
      this.log(
        chalk.yellow(
          `Target directory '${targetDir}' already contains AGENTS.md.\nUse --force to overwrite existing files.\n`
        )
      );
      return;
    }

    // 5. Scaffold files
    const spinner = ora('Scaffolding agent builder workspace...').start();
    try {
      cpSync(templateDir, targetDir, { recursive: true });

      // Create .env from .env.example if missing
      const envExamplePath = path.join(targetDir, '.env.example');
      const envPath = path.join(targetDir, '.env');
      if (existsSync(envExamplePath) && !existsSync(envPath)) {
        copyFileSync(envExamplePath, envPath);
      }

      if (existsSync(envPath)) {
        // Pin the workspace to this CLI's own release. docker-compose.yml requires MJ_VERSION: the
        // container installs this exact CLI and passes it to `mj install --tag`, so the stack cannot
        // drift onto whatever npm's `latest` or the newest GitHub release happens to be.
        this.upsertEnvValue(envPath, 'MJ_VERSION', this.cliVersion());

        // If a custom app URL was supplied, point the workspace at it
        if (flags.app) {
          this.upsertEnvValue(envPath, 'OPEN_APP_INSTALL_URL', flags.app);
        }
      }

      spinner.succeed(chalk.green('Workspace scaffolded successfully!'));
    } catch (err: unknown) {
      spinner.fail(chalk.red('Failed to scaffold workspace.'));
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.error(errorMsg);
    }

    // 6. Start Docker and bootstrap if requested and available
    if (flags.start && dockerAvailable) {
      this.startEnvironment(targetDir);
    } else {
      if (!dockerAvailable && !flags['skip-docker-check']) {
        this.printDockerInstallInstructions();
      }
      this.printNextSteps(targetDir, dockerAvailable);
    }
  }

  /**
   * This CLI's own version, read from its package.json. Not `this.config.version`: that is the
   * version of whatever package root oclif resolved, which is this CLI only when the command runs
   * through the `mj` binary. Invoked programmatically it can be oclif's own, and a wrong pin here
   * would silently install an unrelated release into the container.
   */
  private cliVersion(): string {
    // Same depth from src/commands/agent and dist/commands/agent, and package.json always ships.
    const pkgPath = path.join(__dirname, '..', '..', '..', 'package.json');
    const pkg: { name?: string; version?: string } = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (pkg.name !== '@memberjunction/cli' || !pkg.version) {
      throw new Error(`Could not determine the @memberjunction/cli version from ${pkgPath}`);
    }
    return pkg.version;
  }

  /**
   * Set `key=value` in a dotenv file: replace the active assignment if there is one, otherwise
   * append it. Commented-out example lines are left untouched.
   */
  private upsertEnvValue(envPath: string, key: string, value: string): void {
    const content = readFileSync(envPath, 'utf8');
    const assignment = `${key}=${value}`;
    const activeLine = new RegExp(`^${key}=.*$`, 'm');
    const updated = activeLine.test(content)
      ? content.replace(activeLine, () => assignment)
      : `${content}${content.endsWith('\n') ? '' : '\n'}${assignment}\n`;
    writeFileSync(envPath, updated, 'utf8');
  }

  private resolveTemplateDir(): string | null {
    // 1. Check bundled template ({src,dist}/init-templates/citizen-builder)
    const bundledPath = path.join(__dirname, '..', '..', 'init-templates', 'citizen-builder');
    if (existsSync(bundledPath)) {
      return bundledPath;
    }

    // 2. Check src template when running from dist in dev mode
    const bundledSrcPath = path.join(__dirname, '..', '..', '..', 'src', 'init-templates', 'citizen-builder');
    if (existsSync(bundledSrcPath)) {
      return bundledSrcPath;
    }

    // 3. Check monorepo root fallback (5 levels up from commands/agent)
    const monorepoRootPath = path.resolve(__dirname, '../../../../../citizen-builder');
    if (existsSync(monorepoRootPath)) {
      return monorepoRootPath;
    }

    return null;
  }

  private ensureDockerRunning(): boolean {
    // Step 1: Check if docker daemon is already responsive
    try {
      execSync('docker info', { stdio: 'ignore' });
      return true;
    } catch {
      // Daemon not answering
    }

    // Step 2: If macOS and Docker.app exists, try launching it automatically
    if (process.platform === 'darwin' && existsSync('/Applications/Docker.app')) {
      const launchSpinner = ora('Docker Desktop is installed but not running. Launching Docker Desktop...').start();
      try {
        execSync('open -a Docker', { stdio: 'ignore' });
        // Poll for up to 20 seconds for the daemon socket
        for (let i = 0; i < 20; i++) {
          try {
            execSync('docker info', { stdio: 'ignore' });
            launchSpinner.succeed(chalk.green('Docker Desktop started!'));
            return true;
          } catch {
            execSync('sleep 1');
          }
        }
        launchSpinner.warn(chalk.yellow('Docker Desktop is still initializing in the background.'));
        return false;
      } catch {
        launchSpinner.fail(chalk.yellow('Could not launch Docker Desktop automatically.'));
        return false;
      }
    }

    return false;
  }

  private startEnvironment(targetDir: string): void {
    const spinner = ora('Starting MemberJunction container stack (docker compose up -d)...').start();
    try {
      execSync('docker compose up -d', { cwd: targetDir, stdio: 'pipe' });
      spinner.succeed(chalk.green('Containers started!'));
    } catch (err: unknown) {
      spinner.fail(chalk.red('Failed to start containers.'));
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.error(errorMsg);
    }

    let apiPort = '4000';
    let dbPort = '1433';
    let explorerPort = '4202';
    const envPath = path.join(targetDir, '.env');
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf8');
      const apiMatch = content.match(/^API_PORT=(\d+)/m);
      if (apiMatch) apiPort = apiMatch[1];
      const dbMatch = content.match(/^DB_PORT=(\d+)/m);
      if (dbMatch) dbPort = dbMatch[1];
      const explorerMatch = content.match(/^EXPLORER_PORT=(\d+)/m);
      if (explorerMatch) explorerPort = explorerMatch[1];
    }

    this.log(chalk.bold.cyan('\n🎉 Your MemberJunction local instance is running!'));
    this.log(`   API Endpoint:    ${chalk.green(`http://localhost:${apiPort}`)}`);
    this.log(`   Explorer UI:     ${chalk.green(`http://localhost:${explorerPort}`)}`);
    this.log(`   Database:        ${chalk.green(`localhost:${dbPort}`)} (DB: MemberJunction)`);
    this.log(`   Healthcheck:     ${chalk.gray(`http://localhost:${apiPort}/healthcheck`)}\n`);
    this.printCodingAgentInstructions();
  }

  private printDockerInstallInstructions(): void {
    this.log(chalk.yellow('\n⚠️  Docker Desktop is not installed or not running.'));
    this.log('MemberJunction Agent Builder requires Docker Desktop to run your local database and API.\n');
    this.log(chalk.bold('To install Docker Desktop:'));
    if (process.platform === 'darwin') {
      this.log('  • Download: ' + chalk.cyan('https://www.docker.com/products/docker-desktop'));
      this.log('  • Or install via Homebrew: ' + chalk.cyan('brew install --cask docker'));
    } else if (process.platform === 'win32') {
      this.log('  • Download: ' + chalk.cyan('https://www.docker.com/products/docker-desktop'));
    } else {
      this.log('  • Install Docker Engine: ' + chalk.cyan('https://docs.docker.com/engine/install/'));
    }
  }

  private printNextSteps(targetDir: string, dockerAvailable: boolean): void {
    this.log(chalk.bold.white('\n📋 Next Steps:'));
    this.log(`1. Navigate to your workspace:\n   ${chalk.cyan(`cd ${path.relative(process.cwd(), targetDir) || '.'}`)}`);
    this.log(`2. Add your LLM API keys in ${chalk.yellow('.env')}`);
    if (dockerAvailable) {
      this.log(`3. Start your local environment:\n   ${chalk.cyan('docker compose up -d')}`);
    } else {
      this.log(`3. Launch Docker Desktop and run:\n   ${chalk.cyan('docker compose up -d')}`);
    }
    this.printCodingAgentInstructions();
  }

  private printCodingAgentInstructions(): void {
    this.log(chalk.bold.green('\n🤖 Ready to Build with your Coding Agent:'));
    this.log('Open your coding agent (Claude Code, Antigravity, Cursor, etc.) in this folder and simply say:');
    this.log(
      chalk.italic.white(
        '  "Build me an agent that scans for overdue invoices and prepares reminder emails."'
      )
    );
    this.log(
      chalk.gray(
        'Your coding agent will read AGENTS.md, author the declarative metadata, and test it against your local database!\n'
      )
    );
  }
}
