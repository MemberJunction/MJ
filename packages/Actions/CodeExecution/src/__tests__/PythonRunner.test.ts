import { describe, it, expect } from 'vitest';
import { PythonRunner } from '../PythonRunner';

const NAELK_ANTLER_CSV = [
  'Year,Division,Place,BullName,Ranch,Score',
  '2022,4-Year Typical,1,Thunder,High Country Elk,398.5',
  '2022,4-Year Typical,2,Storm,High Country Elk,382.0',
  '2023,4-Year Typical,1,Titan,Rocky Mountain Ranch,412.25',
  '2023,4-Year Typical,2,Apollo,Silver Creek,395.0',
  '2024,4-Year Typical,1,Goliath,North Star Elk,425.75',
  '2024,4-Year Typical,2,Atlas,High Country Elk,408.5',
  '2025,4-Year Typical,1,Monarch,Rocky Mountain Ranch,431.0',
  '2025,4-Year Typical,2,Orion,North Star Elk,415.25',
].join('\n');

const SFN_DEALS_CSV = [
  'DealID,CloseDate,Sector,DealSizeUSD,LenderCount',
  'D-101,2025-02-15,Healthcare,"$25,000,000",2',
  'D-102,2025-06-10,Manufacturing,"$40,500,000",3',
  'D-103,2026-01-20,Healthcare,"$32,000,000",2',
  'D-104,2026-04-05,Technology,"$58,000,000",4',
  'D-105,2026-08-12,Manufacturing,"$45,000,000",3',
].join('\n');

describe('PythonRunner', () => {
  const runner = new PythonRunner();

  it('computes 3-year winning antler score average from mounted CSV (NAELK scenario)', async () => {
    const result = await runner.Execute({
      language: 'python',
      files: [{ name: 'antler_results.csv', content: NAELK_ANTLER_CSV }],
      code: [
        'max_year = df["Year"].max()',
        'recent_winners = df[(df["Year"] >= max_year - 2) & (df["Place"] == 1)]',
        'avg_score = round(recent_winners["Score"].mean(), 2)',
        'by_year = recent_winners.groupby("Year")["Score"].mean().to_dict()',
        'print(f"3-year winning average: {avg_score}")',
        'output = {"avgWinningScore": avg_score, "byYear": by_year, "count": len(recent_winners)}',
      ].join('\n'),
    });

    expect(result.success).toBe(true);
    expect(result.logs).toContain('3-year winning average: 423.0');
    expect(result.output).toEqual({
      avgWinningScore: 423.0,
      byYear: { '2023': 412.25, '2024': 425.75, '2025': 431.0 },
      count: 3,
    });
  });

  it('cleans currency strings and aggregates average deal size by year and sector (SFN scenario)', async () => {
    const result = await runner.Execute({
      language: 'python',
      files: [{ name: 'sfn_deals.csv', content: SFN_DEALS_CSV }],
      code: [
        'df["Year"] = pd.to_datetime(df["CloseDate"]).dt.year',
        'df["DealSizeNumeric"] = pd.to_numeric(df["DealSizeUSD"].str.replace("$", "", regex=False).str.replace(",", "", regex=False), errors="coerce")',
        'deals_2026 = df[df["Year"] == 2026]',
        'avg_2026 = deals_2026["DealSizeNumeric"].mean()',
        'by_sector = df.groupby("Sector")["DealSizeNumeric"].agg(["count", "mean", "sum"]).reset_index().to_dict(orient="records")',
        'output = {"avgDealSize2026": avg_2026, "bySector": by_sector}',
      ].join('\n'),
    });

    expect(result.success).toBe(true);
    expect(result.output.avgDealSize2026).toBe(45000000);
    expect(result.output.bySector).toHaveLength(3);
  });

  it('supports reading /data/dataset.csv and writing files to /output', async () => {
    const result = await runner.Execute({
      language: 'python',
      files: [{ name: 'survey.csv', content: 'Respondent,Rating\nR1,5\nR2,4\nR3,5\n' }],
      code: [
        'loaded = pd.read_csv("/data/dataset.csv")',
        'loaded.to_csv("/output/cleaned.csv", index=False)',
        'output = loaded["Rating"].mean()',
      ].join('\n'),
    });

    expect(result.success).toBe(true);
    expect(result.output).toBeCloseTo(4.6667, 3);
    expect(result.files).toBeDefined();
    expect(result.files?.[0]?.name).toBe('cleaned.csv');
    expect(result.files?.[0]?.mimeType).toBe('text/csv');
  });

  it('reports SYNTAX_ERROR for invalid Python code', async () => {
    const result = await runner.Execute({
      language: 'python',
      code: 'def broken(:\n  pass',
    });

    expect(result.success).toBe(false);
    expect(result.errorType).toBe('SYNTAX_ERROR');
    expect(result.error).toContain('SyntaxError');
  });

  it('blocks network access and reading outside the sandbox via sys.addaudithook', async () => {
    const netResult = await runner.Execute({
      language: 'python',
      code: 'import socket\ns = socket.socket()\n',
    });
    expect(netResult.success).toBe(false);
    expect(netResult.errorType).toBe('SECURITY_ERROR');

    const fsResult = await runner.Execute({
      language: 'python',
      code: 'with open("/etc/hosts", "r") as f:\n    output = f.read()\n',
    });
    expect(fsResult.success).toBe(false);
    expect(fsResult.errorType).toBe('SECURITY_ERROR');
  });

  it('terminates runaway infinite loops with TIMEOUT', async () => {
    const result = await runner.Execute({
      language: 'python',
      timeoutSeconds: 1,
      code: 'while True:\n    pass\n',
    });

    expect(result.success).toBe(false);
    expect(result.errorType).toBe('TIMEOUT');
  });
});
