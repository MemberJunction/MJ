import { describe, it, expect, afterEach } from "vitest";
import { SetHostConnectionResolver, ResolveHostConnection, type HostSqlConnectionInfo } from "../hostConnection";

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
