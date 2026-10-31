/**
 * Builds the error raised when a Code dashboard's `DriverClass` has no `BaseDashboard`
 * registration in this Explorer build.
 *
 * One message covers three different causes, so it names each one and what to check:
 * the package that provides the class is not installed, it is installed but never imported so
 * the build tree-shook it out, or the `DriverClass` does not match the `@RegisterClass` key.
 *
 * @param driverClass - the dashboard's `DriverClass` value
 * @param registrationDescription - `ClassFactory.DescribeMissingRegistration(BaseDashboard, driverClass)`,
 *   which lists the keys that ARE registered for `BaseDashboard`
 */
export function BuildDashboardClassNotRegisteredMessage(driverClass: string, registrationDescription: string): string {
    return (
        `Dashboard class '${driverClass}' is not registered. ${registrationDescription} ` +
        `Likely causes: (1) the package that provides '${driverClass}' is not installed in this Explorer ` +
        `(for an Open App, its Angular package is missing even though its database migrations ran); ` +
        `(2) the package is installed but nothing imports it, so the build tree-shook it out — ` +
        `reference it from the app's class-registration manifest; ` +
        `(3) the dashboard's DriverClass does not match the class's @RegisterClass key.`
    );
}
