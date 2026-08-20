export type Severity = "high" | "medium" | "low";
export type Finding = {
  ruleId: string;
  severity: Severity;
  title: string;
  detail: string;
  file: string;
};

export type Asset = { file: string; bytes: number };

export function sumAssets(assets: Asset[]): number {
  return assets.reduce((n, a) => n + a.bytes, 0);
}

export function budgetFindings(assets: Asset[], budgetKb: number): Finding[] {
  const total = sumAssets(assets);
  const budget = budgetKb * 1024;
  if (total <= budget) return [];
  const overKb = ((total - budget) / 1024).toFixed(1);
  return [
    {
      ruleId: "over-budget",
      severity: total > budget * 1.25 ? "high" : "medium",
      title: `Assets ${(total / 1024).toFixed(1)} KiB exceed budget ${budgetKb} KiB (+${overKb} KiB)`,
      detail: `Measured ${assets.length} file(s). Largest: ${
        [...assets].sort((a, b) => b.bytes - a.bytes)[0]?.file ?? "n/a"
      }`,
      file: assets[0]?.file ?? "dist",
    },
  ];
}
