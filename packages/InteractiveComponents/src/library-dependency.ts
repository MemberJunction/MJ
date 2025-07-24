/**
 * Library dependency information for a component
 */
export interface ComponentLibraryDependency {
    /**
     * Unique name of the library from our registry. Typically
     * reuses npm style package names such as
     * "recharts", "lodash", "dayjs", "antd" or "@memberjunction/lib-name"
     */
    libraryName: string;

    /**
     * The global variable name used by the component to access the library in code.
     * When the component is bootstrapped, the library is loaded into a variable in a
     * Factory/wrapper function around it by the host.
     */
    globalVariable: string;

    /**
     * SemVer string describing minimum version requirement
     * Example: "2.5.0" for fixed version, "^1.0.0" for minimum version
     */
    minVersion?: string;
}