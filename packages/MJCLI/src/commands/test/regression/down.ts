import { Command, Flags } from '@oclif/core';
import {
  dockerComposeArgs,
  requireMonorepoRoot,
  spawnInherit,
  latestRunDir,
  readRunSnapshot,
} from '../../../lib/regression/docker-helpers.js';

export default class TestRegressionDown extends Command {
  static description =
    'Stop the regression stack. The DB volume is KEPT by default so the ' +
    'run stays inspectable/resumable; pass --volumes to wipe it.';

  static examples = [
    '<%= config.bin %> <%= command.id %>                # stop, keep the DB volume',
    '<%= config.bin %> <%= command.id %> --volumes      # stop and WIPE the DB volume',
    '<%= config.bin %> <%= command.id %> --force        # tear down even if a run looks in-progress',
  ];

  static flags = {
    // default is now KEEP (was wipe). --volumes opts into destruction.
    volumes: Flags.boolean({
      char: 'v',
      description: 'WIPE the DB volume too (docker compose down -v). Destroys the database.',
      default: false,
    }),
    // Kept for backward compatibility — keeping the volume is the default now,
    // so this is a no-op that documents intent. Ignored if --volumes is given.
    'keep-volumes': Flags.boolean({
      description: 'Deprecated — keeping volumes is the default. Has no effect.',
      default: false,
      hidden: true,
    }),
    force: Flags.boolean({
      char: 'f',
      description: 'Skip the in-progress guard and tear down anyway.',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TestRegressionDown);
    requireMonorepoRoot();

 // guard against tearing down mid-run. The partial snapshot tells
    // us whether the most recent run is still Running; refuse unless --force so a
    // stray `down` can't kill an in-flight multi-hour run (and, with --volumes,
    // destroy its DB-resident artifacts).
    const wipe = flags.volumes;
    if (!flags.force) {
      const runDir = latestRunDir();
      if (runDir) {
        const snap = readRunSnapshot(runDir);
        if (snap.status === 'Running') {
          this.error(
            `Run "${snap.runId}" appears to be in progress (status: Running, ${snap.completed} test(s) done).\n` +
              `Refusing to ${wipe ? 'tear down + WIPE' : 'tear down'} the stack. ` +
              `Re-run with --force if you really mean to${wipe ? ' (this will destroy the DB and its artifacts)' : ''}.`,
            { exit: 1 },
          );
        }
      }
    }

    // Use `--profile *` so compose tears down services in every profile,
    // not just the active one. Otherwise `down` leaves orphan containers
    // from a profile we haven't named.
    const composeArgs = dockerComposeArgs(undefined, ['--profile', '*', 'down']);
    if (wipe) composeArgs.push('-v');

    this.log(wipe ? 'Tearing down and WIPING the DB volume…' : 'Stopping the stack (DB volume kept; use --volumes to wipe)…');
    const code = await spawnInherit('docker', composeArgs);
    if (code !== 0) this.exit(code);
  }
}
