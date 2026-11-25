// Checks the ./functions entry two ways. Run after `pnpm run build` of work-queue-core and work-queue-azure.
//  1. INSPECT: bundle with the Azure SDK *included* and fail when the graph reaches ServiceBusAdministrationClient
//     or any MemberJunction package other than work-queue-core.
//  2. SIZE: bundle as a consumer would (external: ['@azure/*']) and enforce the 150 KB budget on our own code.
import { build } from 'esbuild';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUDGET_BYTES = 150 * 1024;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowedRoots = [packageRoot, resolve(packageRoot, '..', 'core')].map((root) => root + sep);
const common = {
    entryPoints: [resolve(packageRoot, 'dist/functions/index.js')],
    bundle: true, platform: 'node', target: 'node22', format: 'esm', minify: true, write: false, metafile: true,
    logLevel: 'silent', absWorkingDir: packageRoot,
};

const inspected = await build(common);
const inputs = Object.keys(inspected.metafile.inputs).map((input) => resolve(packageRoot, input));
const isOurs = (input) => allowedRoots.some((root) => input.startsWith(root)) && !input.includes(`${sep}node_modules${sep}`);
const adminLeaks = inputs.filter((input) => input.endsWith(`${sep}adminClient.js`) || input.endsWith(`${sep}SdkServiceBusAdminGateway.js`));
const mjLeaks = inputs.filter((input) => !isOurs(input)
    && (input.includes(`${sep}@memberjunction${sep}`) || (input.includes(`${sep}packages${sep}`) && !input.includes(`${sep}node_modules${sep}`))));

if (adminLeaks.length > 0) {
    console.error(`work-queue-azure/functions reaches ServiceBusAdministrationClient (${adminLeaks.length} files):\n` + adminLeaks.join('\n'));
    process.exit(1);
}
if (mjLeaks.length > 0) {
    console.error('work-queue-azure/functions bundle includes forbidden modules:\n' + mjLeaks.join('\n'));
    process.exit(1);
}

const sized = await build({ ...common, metafile: false, external: ['@azure/*'] });
const bytes = sized.outputFiles[0].contents.byteLength;
if (bytes > BUDGET_BYTES) {
    console.error(`work-queue-azure/functions bundle is ${bytes} bytes; budget is ${BUDGET_BYTES}`);
    process.exit(1);
}
console.log(`work-queue-azure/functions bundle OK: ${bytes} bytes (budget ${BUDGET_BYTES}), no admin client, ${inputs.filter(isOurs).length} own input files`);
