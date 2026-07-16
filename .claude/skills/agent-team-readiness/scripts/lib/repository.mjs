import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, realpath, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SAFE_GIT_OPTIONS = [
  "-c", "core.fsmonitor=false",
  "-c", "core.untrackedCache=false",
  "-c", `core.hooksPath=${os.devNull}`,
  "-c", `core.excludesFile=${os.devNull}`,
  "-c", "credential.helper=",
  "-c", "protocol.ext.allow=never"
];

function gitEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === "GIT_CONFIG_PARAMETERS" || key === "GIT_CONFIG_COUNT" || /^GIT_CONFIG_(?:KEY|VALUE)_/.test(key)) delete env[key];
  }
  return {
    ...env,
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_LFS_SKIP_SMUDGE: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_PAGER: "cat"
  };
}

export function runGit(args, options = {}) {
  const { trim = true, ...execOptions } = options;
  try {
    const output = execFileSync("git", [...SAFE_GIT_OPTIONS, ...args], {
      encoding: "utf8",
      env: gitEnvironment(),
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      ...execOptions
    });
    return trim ? output.trim() : output;
  } catch (error) {
    const stderr = error?.stderr?.toString?.()
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1000);
    throw new Error(stderr ? `git ${args[0]} failed: ${stderr}` : `git ${args[0]} failed`);
  }
}

function maybeGit(root, args) {
  try {
    return runGit(["-C", root, ...args]);
  } catch {
    return null;
  }
}

export function normalizeGitHubUrl(value) {
  const match = value.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
  if (!match) return null;
  return `https://github.com/${match[1]}/${match[2]}.git`;
}

function validateRemoteRef(ref) {
  if (ref === null) return;
  if (typeof ref !== "string" || ref.length < 1 || ref.length > 256 ||
      !/^[A-Za-z0-9._/-]+$/.test(ref) || ref.startsWith("-") || ref.includes("..") ||
      ref.includes("//") || ref.endsWith("/") || ref.endsWith(".lock")) {
    throw new Error("--ref must be a commit, branch, or tag name without Git option/refspec syntax");
  }
}

export async function materializeRepository(input, ref = null) {
  if (existsSync(input)) {
    if (ref !== null) throw new Error("--ref is supported only for remote GitHub scans; check out the desired local revision first");
    const root = await realpath(input);
    const info = await stat(root);
    if (!info.isDirectory()) throw new Error(`Local repository path is not a directory: ${input}`);
    const gitTopLevel = maybeGit(root, ["rev-parse", "--show-toplevel"]);
    const isGitRoot = gitTopLevel && path.resolve(gitTopLevel) === path.resolve(root);
    const status = isGitRoot ? maybeGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]) : null;
    const worktreeState = !isGitRoot ? "not-git" : status === null ? "unknown" : status === "" ? "clean" : "dirty";
    const revision = worktreeState === "clean" ? maybeGit(root, ["rev-parse", "HEAD"]) : null;
    return {
      root,
      source: path.resolve(input),
      name: path.basename(root),
      revision,
      worktreeState,
      temporary: false,
      cleanup: async () => {}
    };
  }

  const url = normalizeGitHubUrl(input);
  if (!url) {
    throw new Error("Repository must be a local directory or an https://github.com/<owner>/<repo> URL");
  }
  validateRemoteRef(ref);

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "atr-repo-"));
  try {
    runGit(["init", "--quiet", tempRoot]);
    runGit(["-C", tempRoot, "remote", "add", "origin", url]);
    runGit([
      "-C",
      tempRoot,
      "fetch",
      "--quiet",
      "--depth=1",
      "--filter=blob:none",
      "--no-tags",
      "origin",
      ref ?? "HEAD"
    ]);
    runGit(["-C", tempRoot, "checkout", "--quiet", "--detach", "FETCH_HEAD"]);
    const revision = runGit(["-C", tempRoot, "rev-parse", "HEAD"]);
    const [, owner, repoWithGit] = url.match(/^https:\/\/github\.com\/([^/]+)\/(.+)$/);
    return {
      root: await realpath(tempRoot),
      source: url.replace(/\.git$/, ""),
      name: `${owner}/${repoWithGit.replace(/\.git$/, "")}`,
      revision,
      worktreeState: "clean",
      temporary: true,
      cleanup: async () => rm(tempRoot, { recursive: true, force: true })
    };
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

async function canonicalProspectivePath(value) {
  let cursor = path.resolve(value);
  const missing = [];
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    missing.unshift(path.basename(cursor));
    cursor = parent;
  }
  const existing = existsSync(cursor) ? await realpath(cursor) : cursor;
  return path.join(existing, ...missing);
}

export async function assertOutputOutsideRepository(output, repositoryRoot) {
  const target = path.resolve(repositoryRoot);
  const candidate = await canonicalProspectivePath(output);
  const relative = path.relative(target, candidate);
  const inside = relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
  if (inside) {
    throw new Error(
      `Output must be outside the scanned repository. Target: ${target}; requested output: ${candidate}`
    );
  }
  return candidate;
}
