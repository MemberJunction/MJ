import { Command, Flags } from '@oclif/core';
import { resolve } from 'node:path';
import { ReadConfiguredPublicPages } from '../codegen/manifest.js';
import { WritePublicPageHtmlFiles, WriteStaticWebAppRoutes } from '../../lib/explorer-postbuild/public-page-html.js';
import { RunServiceWorkerCheck } from '../../lib/explorer-postbuild/service-worker-check.js';

export default class ExplorerPostbuild extends Command {
    static description = `Finish MJ Explorer's build. Run it as the host's \`postbuild\` script.

It does every step that follows \`ng build\`, so a new step reaches a host with a CLI update:
  1. Checks the service worker's cache list.
  2. Writes one HTML file per public page (public-pages/<slug>.html) from mj.config \`publicPages\`,
     with the page's title, link preview tags and Content Security Policy. The web host serves the
     file for /p/<slug>. Also writes public-pages/_fallback.html, with the same policy, for the
     /p/ addresses that have no page file.
  3. When the folder has a staticwebapp.config.json (Azure Static Web Apps), adds a rewrite for
     each page and for the fallback file to it.`;

    static examples = [
        {
            command: '<%= config.bin %> <%= command.id %> --dir dist/MJExplorer/browser',
            description: "Finish the build in the host's folder",
        },
    ];

    static flags = {
        dir: Flags.string({
            description: "The site folder: MJ Explorer's build output, with its index.html.",
            required: true,
        }),
        quiet: Flags.boolean({
            char: 'q',
            description: 'Do not print a summary.',
            default: false,
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(ExplorerPostbuild);
        const dir = resolve(process.cwd(), flags.dir);

        const serviceWorker = RunServiceWorkerCheck(dir, process.cwd());
        const entries = ReadConfiguredPublicPages();
        const written = WritePublicPageHtmlFiles(dir, entries);
        const routesChanged = WriteStaticWebAppRoutes(dir, entries);

        if (!flags.quiet) {
            if (serviceWorker === 'skipped') {
                this.log('[explorer-postbuild] Service worker check skipped: @memberjunction/ng-explorer-service-worker is not installed for this host');
            }
            this.log(`[explorer-postbuild] ${written} public ${written === 1 ? 'page' : 'pages'} written${routesChanged ? ', Static Web Apps routes updated' : ''}`);
        }
    }
}
