import { describe, it, expect } from 'vitest';
import { ParseFitCalibrationArgs, ParseTargetPrior } from '../calibration-fit/args';

describe('ParseFitCalibrationArgs', () => {
    it('reads a points run with its options', () => {
        const args = ParseFitCalibrationArgs([
            '--points', '/tmp/points.jsonl', '--out', '/tmp/out', '--target-prior', '0.9',
            '--min-points', '40', '--min-per-class', '8', '--folds', '4', '--seed', '7',
            '--threshold', '0.6', '--corpus-label', 'routing corpus 08dd187a', '--force'
        ]);
        expect(args).toEqual({
            Source: { Kind: 'points', PointsPath: '/tmp/points.jsonl' },
            OutDir: '/tmp/out',
            TargetPrior: 0.9,
            MinPoints: 40,
            MinPerClass: 8,
            Folds: 4,
            Seed: 7,
            Threshold: 0.6,
            CorpusLabel: 'routing corpus 08dd187a',
            Force: true
        });
    });

    it('reads a labels run with a default use, and leaves the options unset', () => {
        const args = ParseFitCalibrationArgs(['--labels', 'labels.jsonl', '--use', 'memory-note-gate', '--out', 'out']);
        expect(args.Source).toEqual({ Kind: 'labels', LabelsPath: 'labels.jsonl', Use: 'memory-note-gate' });
        expect(args.TargetPrior).toBeUndefined();
        expect(args.MinPoints).toBeUndefined();
        expect(args.Force).toBe(false);
    });

    it('needs --out and exactly one source', () => {
        expect(() => ParseFitCalibrationArgs(['--points', 'p.jsonl'])).toThrow(/exactly one of --points and --labels/);
        expect(() => ParseFitCalibrationArgs(['--out', 'o'])).toThrow(/exactly one of --points and --labels/);
        expect(() => ParseFitCalibrationArgs(['--out', 'o', '--points', 'p', '--labels', 'l'])).toThrow(/exactly one/);
    });

    it('refuses --use with a points file, a missing value, and out-of-range numbers', () => {
        expect(() => ParseFitCalibrationArgs(['--out', 'o', '--points', 'p', '--use', 'x'])).toThrow(/--use applies to --labels only/);
        expect(() => ParseFitCalibrationArgs(['--out', '--points', 'p'])).toThrow(/--out needs a value/);
        expect(() => ParseFitCalibrationArgs(['--out', 'o', '--points', 'p', '--folds', '0'])).toThrow(/positive integer/);
        expect(() => ParseFitCalibrationArgs(['--out', 'o', '--points', 'p', '--seed', '1.5'])).toThrow(/integer/);
        expect(() => ParseFitCalibrationArgs(['--out', 'o', '--points', 'p', '--threshold', '1'])).toThrow(/share in \(0, 1\)/);
    });
});

describe('ParseTargetPrior', () => {
    it('reads one share, or shares by use with a * default', () => {
        expect(ParseTargetPrior(undefined)).toBeUndefined();
        expect(ParseTargetPrior('0.42')).toBe(0.42);
        expect(ParseTargetPrior('conversation-routing=0.9,*=0.3')).toEqual({ 'conversation-routing': 0.9, '*': 0.3 });
    });

    it('refuses a malformed pair or a share outside (0, 1)', () => {
        expect(() => ParseTargetPrior('routing')).toThrow(/share in \(0, 1\)/);
        expect(() => ParseTargetPrior('routing=0.9=1')).toThrow(/<use>=<share>/);
        expect(() => ParseTargetPrior('=0.9')).toThrow(/<use>=<share>/);
        expect(() => ParseTargetPrior('routing=1.2')).toThrow(/--target-prior routing must be a share/);
    });
});
