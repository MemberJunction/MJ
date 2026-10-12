// Checks the ./lambda entry two ways. Run after `pnpm run build` of work-queue-core and work-queue-aws.
//  1. INSPECT: bundle with the AWS SDK *included* and fail when the graph reaches @aws-sdk/client-sns or any
//     MemberJunction package other than work-queue-core. (Marking @aws-sdk/* external here would hide an SNS import,
//     which is exactly the leak this check exists to catch.)
//  2. SIZE: bundle as a consumer would (the Lambda Node.js runtime provides the SDK, so it is external) and enforce
//     the budget on our own code.
import { build } from 'esbuild';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUDGET_BYTES = 150 * 1024;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowedRoots = [packageRoot, resolve(packageRoot, '..', 'core')].map((root) => root + sep);
const common = {
    entryPoints: [resolve(packageRoot, 'dist/lambda/index.js')],
    bundle: true, platform: 'node', target: 'node22', format: 'esm', minify: true, write: false, metafile: true,
    logLevel: 'silent', absWorkingDir: packageRoot,
};

const inspected = await build(common);
const inputs = Object.keys(inspected.metafile.inputs).map((input) => resolve(packageRoot, input));
const isOurs = (input) => allowedRoots.some((root) => input.startsWith(root)) && !input.includes(`${sep}node_modules${sep}`);
const snsLeaks = inputs.filter((input) => input.includes(`${sep}@aws-sdk${sep}client-sns${sep}`));
const mjLeaks = inputs.filter((input) => !isOurs(input)
    && (input.includes(`${sep}@memberjunction${sep}`) || (input.includes(`${sep}packages${sep}`) && !input.includes(`${sep}node_modules${sep}`))));

if (snsLeaks.length > 0) {
    console.error(`work-queue-aws/lambda reaches the SNS client (${snsLeaks.length} files), e.g.\n` + snsLeaks.slice(0, 5).join('\n'));
    process.exit(1);
}
if (mjLeaks.length > 0) {
    console.error('work-queue-aws/lambda bundle includes forbidden modules:\n' + mjLeaks.join('\n'));
    process.exit(1);
}

const sized = await build({ ...common, metafile: false, external: ['@aws-sdk/*'] });
const bytes = sized.outputFiles[0].contents.byteLength;
if (bytes > BUDGET_BYTES) {
    console.error(`work-queue-aws/lambda bundle is ${bytes} bytes; budget is ${BUDGET_BYTES}`);
    process.exit(1);
}
console.log(`work-queue-aws/lambda bundle OK: ${bytes} bytes (budget ${BUDGET_BYTES}), no SNS client, ${inputs.filter(isOurs).length} own input files`);
