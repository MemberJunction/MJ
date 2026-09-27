// Fails (exit 1) when a Terraform plan deletes or replaces a resource that holds or routes messages, unless
// --allow-destructive is passed (the pipeline passes it only for PRs labelled work-queue-destructive-approved).
// Usage: terraform show -json tfplan > plan.json && node check-destructive-plan.mjs plan.json [--allow-destructive]
import { readFileSync } from 'node:fs';

const GUARDED_TYPES = new Set([
    'azurerm_servicebus_namespace', 'azurerm_servicebus_topic', 'azurerm_servicebus_subscription', 'azurerm_servicebus_subscription_rule',
    'azurerm_role_assignment',
]);

const [planPath, ...flags] = process.argv.slice(2);
if (!planPath) {
    console.error('usage: node check-destructive-plan.mjs <plan.json> [--allow-destructive]');
    process.exit(2);
}
const allow = flags.includes('--allow-destructive');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const destructive = (plan.resource_changes ?? [])
    .filter((change) => GUARDED_TYPES.has(change.type) && (change.change?.actions ?? []).includes('delete'))
    .map((change) => `${(change.change.actions.length > 1 ? 'replace' : 'delete').padEnd(7)} ${change.address}`);

if (destructive.length === 0) {
    console.log('No destructive work-queue changes.');
    process.exit(0);
}
console.log(`Destructive work-queue changes (${destructive.length}):\n${destructive.join('\n')}`);
if (allow) {
    console.log('Allowed: the pull request carries the work-queue-destructive-approved label.');
    process.exit(0);
}
console.error('\nBlocked. Complete the procedure in GOVERNANCE.md ("Destructive changes"), link it in the pull request, ' +
    'and have an approver add the label work-queue-destructive-approved.');
process.exit(1);
