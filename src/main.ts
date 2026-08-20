import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { budgetFindings, type Asset, type Finding } from "./rules";

const MARKER = "<!-- simple-bundle-check -->";
const NAME = "Simple Bundle Check";

function walkAssets(root: string, suffixes: string[]): Asset[] {
  const out: Asset[] = [];
  const roots = ["dist", "build", "out", ".next/static"].map((r) => path.join(root, r));
  function rec(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        rec(full);
        continue;
      }
      if (suffixes.some((s) => e.name.endsWith(s))) {
        out.push({ file: path.relative(root, full), bytes: fs.statSync(full).size });
      }
    }
  }
  for (const r of roots) rec(r);
  return out;
}

function formatFindings(findings: Finding[], assets: Asset[]): string {
  const totalKb = (assets.reduce((n, a) => n + a.bytes, 0) / 1024).toFixed(1);
  if (!findings.length) {
    return [
      MARKER,
      `## ${NAME}`,
      "",
      `Within budget. Measured **${assets.length}** asset(s), **${totalKb} KiB** total.`,
    ].join("\n");
  }
  const rows = findings.map((f) => `| ${f.severity} | \`${f.ruleId}\` | ${f.file} | ${f.title} |`).join("\n");
  return [
    MARKER,
    `## ${NAME}`,
    "",
    `Found **${findings.length}** issue(s). Total **${totalKb} KiB**.`,
    "",
    "| Severity | Rule | Location | Detail |",
    "| --- | --- | --- | --- |",
    rows,
  ].join("\n");
}

async function upsertPrComment(token: string, body: string): Promise<void> {
  const { context } = github;
  if (context.eventName !== "pull_request" && context.eventName !== "pull_request_target") return;
  const issue_number = context.payload.pull_request?.number;
  if (!issue_number) return;
  const octokit = github.getOctokit(token);
  const { data: comments } = await octokit.rest.issues.listComments({ ...context.repo, issue_number });
  const existing = comments.find((c) => c.body?.includes(MARKER));
  if (existing) {
    await octokit.rest.issues.updateComment({ ...context.repo, comment_id: existing.id, body });
    return;
  }
  await octokit.rest.issues.createComment({ ...context.repo, issue_number, body });
}

async function run(): Promise<void> {
  const token = core.getInput("github-token") || process.env.GITHUB_TOKEN || "";
  const failOn = (core.getInput("fail-on") || "none").toLowerCase();
  const budgetKb = Number(core.getInput("budget-kb") || "512");
  const suffixes = (core.getInput("asset-glob") || ".js,.css")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const assets = walkAssets(process.cwd(), suffixes);
  if (!assets.length) {
    core.info("No build assets found under dist/build/out/. Build before this step.");
    core.setOutput("finding-count", "0");
    return;
  }

  const findings = budgetFindings(assets, budgetKb);
  const summary = formatFindings(findings, assets);
  await core.summary.addRaw(summary, true).write();
  for (const f of findings) {
    if (f.severity === "high") core.error(`${f.title} (${f.ruleId})`);
    else core.warning(`${f.title} (${f.ruleId})`);
  }
  if (token) {
    try {
      await upsertPrComment(token, summary);
    } catch (e) {
      core.warning(`Could not post PR comment: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  core.setOutput("finding-count", String(findings.length));
  const shouldFail =
    failOn === "high"
      ? findings.some((f) => f.severity === "high")
      : failOn === "medium"
        ? findings.some((f) => f.severity === "high" || f.severity === "medium")
        : false;
  if (shouldFail) core.setFailed(`simple-bundle-check: ${findings.length} finding(s)`);
  else core.info(`Done. ${findings.length} finding(s).`);
}

run().catch((e) => core.setFailed(e instanceof Error ? e.message : String(e)));
