import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { IGNORED_SEGMENTS, MAX_TEXT_BYTES } from "./constants.mjs";
import { runGit } from "./repository.mjs";

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function isIgnored(relativePath) {
  return relativePath.split("/").some((part) => IGNORED_SEGMENTS.has(part));
}

function gitFiles(root) {
  try {
    const topLevel = runGit(["-C", root, "rev-parse", "--show-toplevel"]);
    if (path.resolve(topLevel) !== path.resolve(root)) return null;
    const output = runGit(["-C", root, "ls-files", "-co", "--exclude-standard", "-z"], {
      maxBuffer: 64 * 1024 * 1024,
      trim: false
    });
    return output.split("\0").filter(Boolean).map(toPosix);
  } catch {
    return null;
  }
}

async function walk(root, relative = "", files = []) {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const next = toPosix(path.join(relative, entry.name));
    if (isIgnored(next)) continue;
    if (entry.isDirectory()) await walk(root, next, files);
    else files.push(next);
  }
  return files;
}

export async function listRepositoryFiles(root, maxFiles) {
  const listed = gitFiles(root) ?? (await walk(root));
  const candidates = [...new Set(listed
    .map((file) => toPosix(path.posix.normalize(file)).replace(/^\.\//, ""))
    .filter((file) => file && !file.startsWith("../") && !path.posix.isAbsolute(file) && !isIgnored(file)))].sort();
  const canonicalRoot = await realpath(root);
  const regularFiles = [];
  const skippedFiles = [];
  for (let offset = 0; offset < candidates.length; offset += 64) {
    const inspected = await Promise.all(candidates.slice(offset, offset + 64).map(async (file) => {
      const absolute = path.join(canonicalRoot, file);
      let info;
      try {
        info = await lstat(absolute);
      } catch {
        return { file, reason: "missing-or-unreadable" };
      }
      if (info.isSymbolicLink()) return { file, reason: "symbolic-link" };
      if (!info.isFile()) return { file, reason: "not-a-regular-file" };
      let canonical;
      try {
        canonical = await realpath(absolute);
      } catch {
        return { file, reason: "missing-or-unreadable" };
      }
      const relative = path.relative(canonicalRoot, canonical);
      if (relative === ".." || relative.startsWith(`..${path.sep}`)) return { file, reason: "outside-repository" };
      let handle;
      try {
        handle = await open(canonical, "r");
        await handle.close();
      } catch {
        if (handle) await handle.close().catch(() => {});
        return { file, reason: "missing-or-unreadable" };
      }
      return { file, reason: null };
    }));
    for (const item of inspected) {
      if (item.reason) skippedFiles.push({ path: boundedEvidenceText(item.file), reason: item.reason });
      else regularFiles.push(item.file);
    }
  }
  return {
    files: regularFiles.slice(0, maxFiles),
    fileCount: candidates.length,
    skippedFileCount: skippedFiles.length,
    skippedFiles: skippedFiles.slice(0, 100),
    truncated: regularFiles.length > maxFiles
  };
}

export async function readRepositoryText(root, relativePath, maxBytes = MAX_TEXT_BYTES) {
  const normalized = toPosix(path.posix.normalize(relativePath)).replace(/^\.\//, "");
  if (normalized.startsWith("../") || path.isAbsolute(normalized)) return null;
  const absolute = path.join(root, normalized);
  let info;
  try {
    info = await lstat(absolute);
  } catch {
    return null;
  }
  if (!info.isFile() || info.isSymbolicLink()) return null;
  let canonical;
  try {
    canonical = await realpath(absolute);
  } catch {
    return null;
  }
  let canonicalRoot;
  try {
    canonicalRoot = await realpath(root);
  } catch {
    return null;
  }
  const relative = path.relative(canonicalRoot, canonical);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || relative === "..") return null;
  let handle;
  try {
    handle = await open(canonical, "r");
  } catch {
    return null;
  }
  try {
    const buffer = Buffer.alloc(Math.min(info.size, maxBytes));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const bounded = buffer.subarray(0, bytesRead);
    if (bounded.includes(0)) return null;
    return bounded.toString("utf8");
  } finally {
    await handle.close();
  }
}

export function boundedEvidenceText(value, maxLength = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "[redacted-private-key]")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|gl(?:pat|ptt|rt|ft|dt|cbt|imt|soat)-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{20,}|(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}|npm_[A-Za-z0-9]{20,}|pypi-[A-Za-z0-9_-]{20,})\b/g, "[redacted-token]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, "$1[redacted]")
    .replace(/:\/\/[^\s/:]+:[^\s/@]+@/g, "://[redacted-credentials]@")
    .replace(/\b((?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
    .replace(/\b((?:--)?(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret|token)\s+)[^\s,;]+/gi, "$1[redacted]")
    .replace(/\b[A-Za-z0-9_+/=-]{32,}\b/g, (token) => /[A-Za-z]/.test(token) && /\d/.test(token) ? "[redacted-high-entropy]" : token)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function firstMatchingLine(text, matcher) {
  if (typeof text !== "string") return null;
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    matcher.lastIndex = 0;
    if (matcher.test(lines[index])) return { line: index + 1, text: boundedEvidenceText(lines[index]) };
  }
  return null;
}

export function matchingLines(text, matcher, limit = 20) {
  if (typeof text !== "string") return [];
  const results = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    matcher.lastIndex = 0;
    if (matcher.test(line)) results.push({ line: index + 1, text: boundedEvidenceText(line) });
    if (results.length >= limit) break;
  }
  return results;
}

export function fileEvidence(pathname, detail, line = null) {
  return { kind: "file", path: pathname, line, command: null, detail: boundedEvidenceText(detail) };
}

export function missingEvidence(pathname, detail) {
  return { kind: "missing", path: pathname, line: null, command: null, detail: boundedEvidenceText(detail) };
}

export function commandEvidence(command, detail, pathname = null, line = null) {
  return {
    kind: "command",
    path: pathname,
    line,
    command: boundedEvidenceText(command),
    detail: boundedEvidenceText(detail)
  };
}
