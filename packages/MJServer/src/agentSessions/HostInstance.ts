import { hostname } from 'os';
import { randomUUID } from 'crypto';
import { LogError } from '@memberjunction/core';

/** What follows an instance's prefix in a `HostInstanceID`: a process id, then a boot id. */
const PID_AND_BOOT_ID = /^\d+:[^:]+$/;

/**
 * Identity of one MJAPI instance and of one boot of it. A boot stamps its id into the `HostInstanceID` of the
 * `MJ: AI Agent Sessions` rows it owns, and of the `MJ: AI Agent Session Bridges` rows the realtime bridge engine
 * creates for it (see `BindBridgeEngineHostInstance`), so that after a restart the instance can tell the rows it left
 * behind from another server's live ones.
 *
 * An instance is one MJAPI on one host, named by the host and the port it serves on. Two MJAPIs running at the same
 * time on one host can't serve on the same port, so they are two instances; an MJAPI that restarts serves on its port
 * again, so it is the same instance. Each boot adds its process id and a UUID made at load:
 * `hostname:port:pid:bootId`.
 *
 * A row stamped by another boot of this instance was left by a process that has ended, since this boot holds the
 * port. A row of another instance (another port on this host, or another host) may belong to a server that is still
 * running.
 */
export class HostInstanceIdentity {
    /** The OS host name. */
    public readonly HostName: string;

    /**
     * What tells this instance apart from the other MJAPIs on the host: the port it serves on, or `pid-<pid>` for a
     * process that has not set one (see {@link SetHostInstancePort}).
     */
    public readonly InstanceKey: string;

    /** The OS process id of this boot. */
    public readonly ProcessID: number;

    /** A UUID made once per boot, so two boots never share an id, even when the OS reuses a process id. */
    public readonly BootID: string;

    /**
     * @param hostName The OS host name.
     * @param instanceKey The port the instance serves on, or `pid-<pid>` for a process that serves none.
     * @param processID The OS process id of this boot.
     * @param bootID A UUID made once per boot.
     */
    constructor(hostName: string, instanceKey: string, processID: number, bootID: string) {
        this.HostName = hostName;
        this.InstanceKey = instanceKey;
        this.ProcessID = processID;
        this.BootID = bootID;
    }

    /** The id this boot stamps into the rows it owns: `hostname:port:pid:bootId`. */
    public GetHostInstanceID(): string {
        return `${this.GetInstancePrefix()}${this.ProcessID}:${this.BootID}`;
    }

    /** The prefix every boot of this instance shares and no other instance has: `hostname:port:`. */
    public GetInstancePrefix(): string {
        return `${this.HostName}:${this.InstanceKey}:`;
    }

    /**
     * Whether a `HostInstanceID` was stamped by another boot of this instance: this instance's prefix, then a process
     * id and a boot id, and not this boot's own id. That boot has ended, since this one holds the instance's port.
     *
     * False for this boot's id, for another instance's (another port on this host, or another host), for the format
     * used before the port was added (`hostname:pid:bootId`), and for null. The match is exact: unlike a SQL `LIKE`,
     * a `_` in a host name matches only `_`.
     *
     * @param hostInstanceID A row's `HostInstanceID`.
     */
    public IsPriorBoot(hostInstanceID: string | null | undefined): boolean {
        if (!hostInstanceID || hostInstanceID === this.GetHostInstanceID()) {
            return false;
        }
        const prefix = this.GetInstancePrefix();
        return hostInstanceID.startsWith(prefix) && PID_AND_BOOT_ID.test(hostInstanceID.slice(prefix.length));
    }
}

/** The OS host name, read once at load. */
const HOST_NAME = hostname();

/** This boot's id, made once at load. */
const BOOT_ID = randomUUID();

/** The instance key until {@link SetHostInstancePort} sets the port: this process alone. */
let instanceKey = `pid-${process.pid}`;

/** This process's identity, made on first use and fixed from then on. */
let currentInstance: HostInstanceIdentity | null = null;

/**
 * Names this process's MJAPI instance by the port it serves on. `Serve` calls it first, before anything stamps a row,
 * so every `HostInstanceID` the server writes carries its port.
 *
 * Until it is called the instance is the process alone (`pid-<pid>`), and its startup recovery closes no other
 * process's sessions. The identity is fixed once read: a later call with another port is logged and ignored, so the
 * rows already stamped keep matching this process.
 *
 * @param port The port this MJAPI serves on (`graphqlPort`).
 */
export function SetHostInstancePort(port: number): void {
    const key = String(port);
    if (currentInstance && currentInstance.InstanceKey !== key) {
        LogError(
            `[HostInstance] Port ${key} was set after this process's identity (${currentInstance.GetHostInstanceID()}) ` +
                `was in use; keeping that identity so the rows it stamped still match this process`,
        );
        return;
    }
    instanceKey = key;
}

/**
 * This process's identity: the one place MJServer reads it, to stamp the rows it owns and to recover them after a
 * restart. Made on first call from the host name, the port {@link SetHostInstancePort} set (or `pid-<pid>`), the
 * process id and this boot's id.
 */
export function GetCurrentHostInstance(): HostInstanceIdentity {
    if (!currentInstance) {
        currentInstance = new HostInstanceIdentity(HOST_NAME, instanceKey, process.pid, BOOT_ID);
    }
    return currentInstance;
}

/**
 * Returns this boot's id (`hostname:port:pid:bootId`), stamped into `AIAgentSession.HostInstanceID` at session
 * create. Same as `GetCurrentHostInstance().GetHostInstanceID()`.
 */
export function GetHostInstanceID(): string {
    return GetCurrentHostInstance().GetHostInstanceID();
}

/**
 * Returns `hostname:`, the prefix of every `HostInstanceID` stamped on this host by any MJAPI.
 *
 * @deprecated Not an ownership test: several MJAPIs can run on one host. Match this instance's rows with
 * {@link HostInstanceIdentity.GetInstancePrefix} and {@link HostInstanceIdentity.IsPriorBoot} on
 * {@link GetCurrentHostInstance}.
 */
export function GetHostNamePrefix(): string {
    return `${HOST_NAME}:`;
}

/** Returns the UUID made once at process start. For diagnostics and tests. */
export function GetBootID(): string {
    return BOOT_ID;
}
