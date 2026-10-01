import { describe, it, expect } from 'vitest';
import {
    BuildHostEnvironment,
    DOCKER_CLI_ENV_ALLOWLIST,
    IsValidEnvName,
    LOCAL_HARNESS_ENV_ALLOWLIST,
    OPENSHELL_CLI_ENV_ALLOWLIST,
} from '../sandbox/HostEnvironment';

const hostile: NodeJS.ProcessEnv = {
    PATH: '/usr/bin',
    HOME: '/home/mj',
    DOCKER_HOST: 'unix:///var/run/docker.sock',
    OPENSHELL_GATEWAY: 'prod',
    DB_PASSWORD: 'hunter2',
    ANTHROPIC_API_KEY: 'sk-ant',
    AWS_SECRET_ACCESS_KEY: 'shh',
};

describe('BuildHostEnvironment', () => {
    it('copies only allowlisted variables that are set', () => {
        expect(BuildHostEnvironment(['PATH', 'HOME', 'NOT_SET'], hostile)).toEqual({ PATH: '/usr/bin', HOME: '/home/mj' });
    });

    it.each([
        ['local harness', LOCAL_HARNESS_ENV_ALLOWLIST],
        ['docker CLI', DOCKER_CLI_ENV_ALLOWLIST],
        ['openshell CLI', OPENSHELL_CLI_ENV_ALLOWLIST],
    ])('the %s allowlist never lets a credential through', (_name, allowlist) => {
        const env = BuildHostEnvironment(allowlist, hostile);
        expect(env).not.toHaveProperty('DB_PASSWORD');
        expect(env).not.toHaveProperty('ANTHROPIC_API_KEY');
        expect(env).not.toHaveProperty('AWS_SECRET_ACCESS_KEY');
    });

    it('the docker CLI gets DOCKER_HOST but not openshell variables, and vice versa', () => {
        expect(BuildHostEnvironment(DOCKER_CLI_ENV_ALLOWLIST, hostile)).toHaveProperty('DOCKER_HOST');
        expect(BuildHostEnvironment(DOCKER_CLI_ENV_ALLOWLIST, hostile)).not.toHaveProperty('OPENSHELL_GATEWAY');
        expect(BuildHostEnvironment(OPENSHELL_CLI_ENV_ALLOWLIST, hostile)).toHaveProperty('OPENSHELL_GATEWAY');
        expect(BuildHostEnvironment(OPENSHELL_CLI_ENV_ALLOWLIST, hostile)).not.toHaveProperty('DOCKER_HOST');
    });
});

describe('IsValidEnvName', () => {
    it.each(['A', '_x', 'ANTHROPIC_API_KEY', 'a1'])('accepts %s', (n) => expect(IsValidEnvName(n)).toBe(true));
    it.each(['', '1a', 'a=b', 'a b', 'a-b', 'a\0b'])('rejects %j', (n) => expect(IsValidEnvName(n)).toBe(false));
});
