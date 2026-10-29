import { describe, it, expect, afterEach } from "vitest";
import { SetHostConnectionResolver, ResolveHostConnection, IsHostModeDatabaseAllowed, type HostSqlConnectionInfo } from "../hostConnection";

describe("IsHostModeDatabaseAllowed", () => {
    it.each(["MJ_Staging_abc_123", "mj_staging_X", "  MJ_STAGING_x  "])("allows the staging database %s", (name) => {
        expect(IsHostModeDatabaseAllowed(name)).toBe(true);
    });

    it.each(["HR_Payroll", "MJ_Main", "MJ_Staging_", "MJ_Staging", "xMJ_Staging_abc", ""])("refuses '%s'", (name) => {
        expect(IsHostModeDatabaseAllowed(name)).toBe(false);
    });
});

describe("host connection resolver", () => {
    afterEach(() => SetHostConnectionResolver(undefined));

    it("returns undefined when no resolver is set", () => {
        expect(ResolveHostConnection()).toBeUndefined();
    });

    it("returns the resolver value", () => {
        const info: HostSqlConnectionInfo = { Server: "localhost", Port: 1433, User: "sa", Password: "pw", Encrypt: true, Database: "MJ_Main" };
        SetHostConnectionResolver(() => info);
        expect(ResolveHostConnection()).toEqual(info);
    });

    it("returns undefined when the resolver throws", () => {
        SetHostConnectionResolver(() => {
            throw new Error("boom");
        });
        expect(ResolveHostConnection()).toBeUndefined();
    });
});
