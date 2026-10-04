/**
 * Export default { createTools({ workerNodeId }) => [tool, …] }.
 * Tools are plain objects: { name, description, parameters, handler }.
 *
 * This package ships one deterministic, offline tool: it lists the
 * immediate children of a directory under the worker's current working
 * directory and counts files by extension. No network, no credentials.
 */
import fs from "node:fs";
import path from "node:path";

function resolveSafeRelativePath(baseDir, relativePath) {
    const basePath = path.resolve(baseDir);
    const target = path.resolve(basePath, relativePath || ".");
    const withinBase = target === basePath || target.startsWith(`${basePath}${path.sep}`);
    if (!withinBase) return null;
    return target;
}

export default {
    createTools: ({ workerNodeId }) => [
        {
            name: "list_directory_stats",
            description:
                "List the immediate subfolders and files of a directory relative to the worker's " +
                "working directory, plus a count of files grouped by extension. Use this to help " +
                "someone explore an unfamiliar repository one directory at a time.",
            parameters: {
                type: "object",
                properties: {
                    relativePath: {
                        type: "string",
                        description: "Directory to inspect, relative to the repo root (default: '.').",
                    },
                },
            },
            handler: async ({ relativePath = "." } = {}) => {
                const baseDir = process.cwd();
                const targetDir = resolveSafeRelativePath(baseDir, relativePath);
                if (!targetDir) {
                    return { error: "relativePath escapes the repository root", relativePath };
                }
                if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
                    return { error: "not a directory", relativePath };
                }

                const entries = fs.readdirSync(targetDir, { withFileTypes: true });
                const folders = [];
                const extensionCounts = {};
                let fileCount = 0;

                for (const entry of entries) {
                    if (entry.name.startsWith(".")) continue; // skip dotfiles/dotfolders
                    if (entry.isDirectory()) {
                        folders.push(entry.name);
                    } else if (entry.isFile()) {
                        fileCount += 1;
                        const ext = path.extname(entry.name) || "(no extension)";
                        extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
                    }
                }

                return {
                    inspectedPath: relativePath,
                    folders: folders.sort(),
                    fileCount,
                    extensionCounts,
                    inspectedByWorker: workerNodeId,
                };
            },
        },
    ],
};
