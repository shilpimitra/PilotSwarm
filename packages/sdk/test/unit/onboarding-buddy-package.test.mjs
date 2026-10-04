/**
 * The onboarding-buddy sample agent package: offline checks that it parses,
 * validates, and that its one worker tool behaves deterministically.
 *
 * Run: node --test test/unit/onboarding-buddy-package.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadAgentFiles } from "../../dist/agent-loader.js";
import { validateAgentPackageDir } from "../../dist/agent-package-format.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const pkgDir = path.join(repoRoot, "agent-packages/onboarding-buddy");
const agent = loadAgentFiles(path.join(pkgDir, "agents"))[0];

test("the package directory validates with no errors", async () => {
    const result = await validateAgentPackageDir(pkgDir);
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);
});

test("the agent parses with the expected identity and declared tools", () => {
    assert.ok(agent, "onboarding-buddy.agent.md did not load");
    assert.equal(agent.name, "onboarding-buddy");
    assert.ok((agent.description || "").length > 20, "description looks truncated");
    assert.ok(agent.tools?.includes("list_directory_stats"), "frontmatter does not declare list_directory_stats");
});

/** The tool resolves relativePath against process.cwd() — the worker's
 *  repo root at runtime. Pin cwd to the package dir for the duration of
 *  the call so the test doesn't depend on where `node --test` was invoked. */
async function runToolFromPackageDir(relativePath) {
    const moduleUrl = pathToFileURL(path.join(pkgDir, "tools/worker-module.js"));
    const toolsModule = await import(moduleUrl).then((m) => m.default);
    const [tool] = toolsModule.createTools({ workerNodeId: "test-worker" });
    const originalCwd = process.cwd();
    process.chdir(pkgDir);
    try {
        return { tool, result: await tool.handler({ relativePath }) };
    } finally {
        process.chdir(originalCwd);
    }
}

test("list_directory_stats reports folders and extension counts for a known fixture", async () => {
    const { tool, result } = await runToolFromPackageDir("agents");
    assert.equal(tool.name, "list_directory_stats");
    assert.deepEqual(result.folders, []);
    assert.equal(result.fileCount, 1);
    assert.deepEqual(result.extensionCounts, { ".md": 1 });
    assert.equal(result.inspectedByWorker, "test-worker");
});

test("list_directory_stats refuses to escape the repo root", async () => {
    const { result } = await runToolFromPackageDir("../../../../etc");
    assert.equal(result.error, "relativePath escapes the repository root");
});
