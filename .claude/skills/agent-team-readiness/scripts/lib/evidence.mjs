import path from "node:path";
import { EVIDENCE_SCHEMA_VERSION, ROOT_INSTRUCTION_PATHS } from "./constants.mjs";
import {
  boundedEvidenceText,
  fileEvidence,
  firstMatchingLine,
  matchingLines,
  readRepositoryText
} from "./files.mjs";

const COMMAND_START = /^(?:sudo\s+)?(?:npm|pnpm|yarn|bun|make|just|cargo|go|python(?:3)?|pytest|uv|poetry|tox|nox|mvn|gradle|\.\/gradlew|dotnet|docker\s+compose|task)\b/i;
const BOUNDARY_RE = /\b(?:do not|don't|never|must not|read[ -]?only|generated|edit boundar|ownership|only edit|avoid editing|off limits|scope)\b/i;
const REQUIRED_READING_RE = /\b(?:required reading|read .{0,80}(?:before|for guidelines|for instructions)|must read|single source of truth)\b/i;
const ISOLATION_RE = /\b(?:git worktrees?|worktrees?|one task|one branch|branch(?:es)? per task|separate branch(?:es)?|separate workspaces?|parallel (?:work|tasks?|agents?)|concurrent (?:work|tasks?|agents?)|workspace isolation|do not share|branch naming|(?:shared|same|common|main|single) (?:branch(?:es)?|workspaces?|worktrees?|checkouts?)|share(?:d|s|ing)?\s+(?:a\s+|the\s+)?(?:branch|workspace|worktree|checkout)|(?:use(?:s|d|ing)?|work(?:s|ed|ing)?|edit(?:s|ed|ing)?|commit(?:s|ted|ting)?|stay(?:s|ed|ing)?|remain(?:s|ed|ing)?)\b.{0,30}\bmain)\b/i;
const STRONG_ISOLATION_RE = /\b(?:git worktrees?|worktrees?|one task|branch(?:es)? per task|separate workspaces?|parallel (?:work|tasks?|agents?)|concurrent (?:work|tasks?|agents?)|workspace isolation|do not share)\b/i;
const ACCEPTANCE_RE = /\b(?:acceptance criteria|definition of done|done when|completion criteria|checklist)\b/i;
const TESTING_RE = /\b(?:tests? added|tests? pass|verification|how (?:was|is) this tested|test plan|quality checks?)\b/i;
const DOC_EXT_RE = /\.(?:md|rst|adoc|txt)$/i;
const NON_AUTHORITATIVE_SEGMENTS = new Set(["fixture", "fixtures", "__fixtures__", "testdata", "test-data", "sample", "samples", "example", "examples"]);

function toLines(text) {
  return typeof text === "string" ? text.split(/\r?\n/) : [];
}

function normalizeCommand(line) {
  const stripped = line
    .trim()
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^\$\s*/, "")
    .replace(/^`+|`+$/g, "")
    .trim();
  if (!COMMAND_START.test(stripped)) return null;
  return boundedEvidenceText(stripped);
}

function classifyCommand(command) {
  if (/\b(?:test|pytest|tox|nox)\b/i.test(command)) return "test";
  if (/\b(?:typecheck|type-check|tsc)\b/i.test(command)) return "typecheck";
  if (/\b(?:lint|check|biome|eslint|ruff|clippy)\b/i.test(command)) return "lint";
  if (/\bbuild\b/i.test(command)) return "build";
  if (/\b(?:install|setup|bootstrap)\b/i.test(command)) return "setup";
  return "other";
}

function isInstructionPath(file) {
  if (ROOT_INSTRUCTION_PATHS.has(file)) return true;
  if (/(^|\/)(AGENTS|CLAUDE)\.md$/.test(file)) return true;
  if (/^\.cursor\/rules\/.*\.mdc?$/.test(file)) return true;
  return /^\.github\/instructions\/.*\.md$/.test(file);
}

function instructionScope(file) {
  if (ROOT_INSTRUCTION_PATHS.has(file)) return ".";
  if (file.startsWith(".cursor/") || file.startsWith(".github/")) return ".";
  return path.posix.dirname(file);
}

function isRootInstruction(file) {
  return instructionScope(file) === ".";
}

function distinctBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function isNonAuthoritativePath(file) {
  return file.split("/").some((segment) => NON_AUTHORITATIVE_SEGMENTS.has(segment.toLowerCase()));
}

function topLevelDirectories(files) {
  return [...new Set(files.filter((file) => file.includes("/")).map((file) => file.split("/")[0]))]
    .filter((directory) => !directory.startsWith("."))
    .sort();
}

function signalLines(text, matcher, detail, limit) {
  return matchingLines(text, matcher, limit).map(({ line }) => ({ line, detail }));
}

function stripLeadingFrontmatter(text) {
  const lines = toLines(text);
  if (lines[0]?.trim() !== "---") return text;
  const end = lines.findIndex((line, index) => index > 0 && ["---", "..."].includes(line.trim()));
  return end === -1 ? text : lines.slice(end + 1).join("\n");
}

function isUnsafeIsolationClause(normalized) {
  const negativePolicy = String.raw`(?:do not|don't|never|must not|should not|shall not|may not|cannot|can't|avoid|(?:is|are)\s+(?:forbidden|prohibited)(?:\s+from)?|not allowed(?:\s+to)?)`;
  const isolationTarget = String.raw`(?:(?:separate|isolated|dedicated)\s+(?:branch(?:es)?|workspaces?|worktrees?|checkouts?)|(?:one|a)\s+(?:branch|workspace|worktree|checkout)\s+per\s+(?:task|agent)|(?:branch(?:es)?|workspaces?|worktrees?|checkouts?)\s+per\s+(?:task|agent)|each\b.{0,30}\b(?:own|separate|isolated|dedicated)\s+(?:branch|workspace|worktree|checkout))`;
  const sharingTarget = String.raw`(?:share(?:d|s|ing)?|same|common|single|main(?:\s+branch)?|one\s+(?:branch|workspace|worktree|checkout)\s+(?:for|across|between)\s+(?:all|parallel|multiple|agents?))`;
  const trailingProhibition = String.raw`(?:(?:is|are)\s+(?:forbidden|prohibited)|(?:is|are)\s+not allowed)`;
  const forbidsIsolation = new RegExp(
    String.raw`\b${negativePolicy}\b.{0,80}\b${isolationTarget}\b|\b${isolationTarget}\b.{0,40}\b${trailingProhibition}\b`,
    "i"
  ).test(normalized);
  const concurrent = /\b(?:parallel (?:work|tasks?|agents?)|concurrent (?:work|tasks?|agents?)|multiple agents?|all agents?|every agent|each agent|agents|agent tasks?)\b/i.test(normalized);
  const sharedTarget = /\b(?:(?:shared|same|common|single)\s+(?:branch(?:es)?|workspaces?|worktrees?|checkouts?)|main\s+branch|share(?:d|s|ing)?\s+(?:a\s+|the\s+)?(?:branch|workspace|worktree|checkout)|one\s+(?:branch|workspace|worktree|checkout)\s+(?:for|across|between)\s+(?:all|parallel|multiple|agents?)|(?:all|every)\s+agents?\b.{0,40}\bone\s+(?:branch|workspace|worktree|checkout)|(?:branch(?:es)?|workspaces?|worktrees?|checkouts?)\s+(?:is|are|must be|should be|stays?|remains?)\s+(?:shared|the same|common|single)|(?:use|uses|using|work|works|working|edit|edits|commit|commits|stays?|remains?)\b.{0,30}\b(?:on|in|to)?\s*(?:the\s+)?main)\b/i.test(normalized);
  const forbidsSharing = new RegExp(
    String.raw`\b${negativePolicy}\b.{0,80}\b${sharingTarget}\b|\b${sharingTarget}\b.{0,40}\b${trailingProhibition}\b`,
    "i"
  ).test(normalized);
  const affirmativeShared = /\b(?:must|should|shall|always|required to)\b(?!\s+not\b).{0,50}\b(?:use|share|edit|work|stay|remain|commit)\b/i.test(normalized);
  return forbidsIsolation || ((concurrent || affirmativeShared) && sharedTarget && !forbidsSharing);
}

function isUnsafeIsolationPolicy(text) {
  return text
    .split(/[\r\n;,.]+|\b(?:instead|however)\b/i)
    .map((clause) => clause.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .some(isUnsafeIsolationClause);
}

function isNoopScript(script) {
  const normalized = script.trim().replace(/\s+/g, " ");
  if (/\b(?:no tests?|no test specified|not implemented|todo)\b/i.test(normalized)) return true;
  const segments = normalized.split(/\s*(?:&&|\|\||;|\|(?!\|))\s*/).filter(Boolean);
  return segments.length > 0 && segments.every((segment) =>
    /^(?:true|false|:|exit(?:\s+\d+)?|echo(?:\s+.*)?|printf(?:\s+.*)?)$/i.test(segment)
  );
}

function normalizedYamlCommand(value) {
  let normalized = value.trim().replace(/\s+#.*$/, "").trim();
  if ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'"))) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function isSubstantiveCiCommand(value) {
  const normalized = normalizedYamlCommand(value).replace(/^[-]\s+/, "").trim();
  return Boolean(normalized) && !["[]", "{}", "null", "~"].includes(normalized.toLowerCase()) && !isNoopScript(normalized);
}

function nestedYamlCommands(lines, start, parentIndent) {
  const commands = [];
  for (let cursor = start + 1; cursor < lines.length; cursor += 1) {
    const candidate = lines[cursor];
    if (!candidate.trim() || /^\s*#/.test(candidate)) continue;
    const indentation = candidate.match(/^\s*/)[0].length;
    if (indentation <= parentIndent) break;
    commands.push(candidate.trim().replace(/^-\s+/, ""));
  }
  return commands;
}

function hasCiExecutionStep(text) {
  const lines = toLines(text);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const step = line.match(/^(\s*)-?\s*(run|uses|script|task)\s*:\s*(.*)$/i);
    if (!step) continue;
    const parentIndent = step[1].length;
    const kind = step[2].toLowerCase();
    const inline = step[3].trim();
    if (kind === "uses") {
      if (isSubstantiveCiCommand(inline)) return true;
      continue;
    }
    if (inline && !/^[>|][+-]?$/.test(inline)) {
      if (isSubstantiveCiCommand(inline)) return true;
      continue;
    }
    if (nestedYamlCommands(lines, index, parentIndent).some(isSubstantiveCiCommand)) return true;
  }
  return false;
}

function isPlaceholderText(value) {
  const normalized = value
    .trim()
    .replace(/^[-*+]\s+/, "")
    .replace(/^\[[ x-]\]\s*/i, "")
    .replace(/^[`*_~]+|[`*_~]+$/g, "")
    .trim();
  return /^(?:(?:todo|tbd|fixme|xxx|placeholder)\b.*|coming soon\b.*|under construction\b.*|not implemented\b.*|(?:none|n\/a)\s*[.!]*|to be (?:added|defined|determined|documented|completed|written)\b.*|(?:owners?|maintainers?|architecture|decisions?|details?|content)\s*:\s*(?:todo|tbd|placeholder|none|n\/a)\b.*)$/i.test(normalized);
}

function hasSubstantiveText(text) {
  if (text.startsWith("version https://git-lfs.github.com/spec/v1")) return false;
  const withoutHtmlComments = stripLeadingFrontmatter(text).replace(/<!--[\s\S]*?-->/g, "");
  return toLines(withoutHtmlComments).some((line) => {
    const value = line.trim();
    return value &&
      !value.startsWith("#") &&
      !value.startsWith("//") &&
      !value.startsWith("<!--") &&
      value !== "-->" &&
      value !== "---" &&
      value !== "{}" &&
      value !== "[]" &&
      !value.startsWith("```") &&
      !value.startsWith("~~~") &&
      !/^[=~`^"'-]{3,}$/.test(value) &&
      !isPlaceholderText(value);
  });
}

function hasSubstantiveMarkdownTemplate(text) {
  if (hasSubstantiveText(text)) return true;
  const guidance = [...text.matchAll(/<!--([\s\S]*?)-->/g)]
    .map((match) => match[1])
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return guidance.length >= 80 &&
    !isPlaceholderText(guidance) &&
    /\b(?:change|description|issue|test|verification|risk|motivation|solution|summary|purpose|review|contribut)\b/i.test(guidance);
}

async function filterContentFiles(root, candidates, predicate = hasSubstantiveText) {
  const accepted = [];
  for (const file of candidates) {
    const text = await readRepositoryText(root, file);
    if (text !== null && predicate(text, file)) accepted.push(file);
  }
  return accepted;
}

async function collectInstructions(root, files) {
  const records = [];
  for (const file of files.filter(isInstructionPath).slice(0, 200)) {
    const text = await readRepositoryText(root, file);
    if (text === null) continue;
    const commands = [];
    for (const [index, line] of toLines(text).entries()) {
      const command = normalizeCommand(line);
      if (command) commands.push({ command, action: classifyCommand(command), line: index + 1 });
    }
    records.push({
      path: file,
      scope: instructionScope(file),
      substantive: hasSubstantiveText(text),
      line_count: toLines(text).length,
      commands: distinctBy(commands, (entry) => `${entry.command}:${entry.line}`),
      boundaries: signalLines(text, BOUNDARY_RE, "Explicit edit or scope boundary", 30),
      required_reading: signalLines(text, REQUIRED_READING_RE, "Required-reading or canonical-source reference", 20),
      isolation_policies: matchingLines(text, ISOLATION_RE, 20).map(({ line, text: matchedText }) => ({
        line,
        detail: isUnsafeIsolationPolicy(matchedText) ? "Unsafe shared-workspace policy" : "Task/workspace isolation policy",
        unsafe: isUnsafeIsolationPolicy(matchedText),
        strength: STRONG_ISOLATION_RE.test(matchedText) ? "strong" : "branch-only"
      }))
    });
  }

  const conflicts = [];
  const substantiveRecords = records.filter((record) => record.substantive);
  const rootRecords = substantiveRecords.filter((record) => isRootInstruction(record.path));
  for (const action of ["test", "lint", "typecheck", "build", "setup"]) {
    const byFile = rootRecords
      .map((record) => ({
        path: record.path,
        commands: [...new Set(record.commands.filter((item) => item.action === action).map((item) => item.command))]
      }))
      .filter((entry) => entry.commands.length > 0);
    if (byFile.length < 2) continue;
    const unique = new Set(byFile.flatMap((entry) => entry.commands.map((command) => command.toLowerCase())));
    const intersection = byFile[0].commands.filter((command) =>
      byFile.every((entry) => entry.commands.some((candidate) => candidate.toLowerCase() === command.toLowerCase()))
    );
    if (unique.size > 1 && intersection.length === 0) conflicts.push({ action, sources: byFile });
  }

  return {
    files: substantiveRecords,
    hollow_files: records.filter((record) => !record.substantive).map((record) => record.path),
    hollow_root_files: records.filter((record) => !record.substantive && isRootInstruction(record.path)).map((record) => record.path),
    root_files: rootRecords.map((record) => record.path),
    conflicts,
    command_count: substantiveRecords.reduce((sum, record) => sum + record.commands.length, 0),
    boundary_count: substantiveRecords.reduce((sum, record) => sum + record.boundaries.length, 0),
    required_reading_count: substantiveRecords.reduce((sum, record) => sum + record.required_reading.length, 0),
    root_command_count: rootRecords.reduce((sum, record) => sum + record.commands.length, 0),
    root_boundary_count: rootRecords.reduce((sum, record) => sum + record.boundaries.length, 0),
    root_required_reading_count: rootRecords.reduce((sum, record) => sum + record.required_reading.length, 0)
  };
}

async function readJson(root, file) {
  const text = await readRepositoryText(root, file);
  if (text === null) return null;
  try {
    return { text, value: JSON.parse(text) };
  } catch {
    return null;
  }
}

function packageManager(files) {
  if (files.includes("pnpm-lock.yaml")) return "pnpm";
  if (files.includes("yarn.lock")) return "yarn";
  if (files.includes("bun.lock") || files.includes("bun.lockb")) return "bun";
  return "npm";
}

function packageInvocation(manager, packageFile, script) {
  const directory = path.posix.dirname(packageFile);
  if (directory === ".") return manager === "npm" ? `npm run ${script}` : `${manager} ${script}`;
  if (manager === "pnpm") return `pnpm --dir ${directory} ${script}`;
  if (manager === "yarn") return `yarn --cwd ${directory} ${script}`;
  if (manager === "bun") return `bun --cwd ${directory} run ${script}`;
  return `npm --prefix ${directory} run ${script}`;
}

function makeTargetLine(text, target) {
  const lines = toLines(text);
  const declaration = new RegExp(`^${target}\\s*:(.*)$`);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(declaration);
    if (!match) continue;
    const remainder = match[1].replace(/\s+#.*$/, "").trim();
    const separator = remainder.indexOf(";");
    const prerequisites = (separator === -1 ? remainder : remainder.slice(0, separator)).trim();
    const inlineRecipe = separator === -1 ? "" : remainder.slice(separator + 1).trim().replace(/^[@+-]+\s*/, "");
    if (prerequisites || (inlineRecipe && !isNoopScript(inlineRecipe))) return index + 1;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];
      if (!candidate.trim() || /^\s*#/.test(candidate)) continue;
      if (!candidate.startsWith("\t")) break;
      const recipe = candidate.slice(1).trim().replace(/^[@+-]+\s*/, "");
      if (recipe && !isNoopScript(recipe)) return index + 1;
    }
  }
  return null;
}

async function collectVerification(root, files) {
  const lockCandidates = files.filter((file) =>
    /(^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|Gemfile\.lock|go\.sum)$/.test(file)
  );
  const lockfiles = await filterContentFiles(root, lockCandidates);
  const manager = packageManager(lockfiles);
  const commands = [];
  for (const packageFile of files.filter((file) => file.endsWith("package.json")).slice(0, 300)) {
    const parsed = await readJson(root, packageFile);
    const scripts = parsed?.value?.scripts;
    if (!scripts || typeof scripts !== "object") continue;
    for (const script of ["test", "check", "lint", "typecheck", "build", "verify", "ci"]) {
      if (typeof scripts[script] !== "string" || !scripts[script].trim() || isNoopScript(scripts[script])) continue;
      const match = firstMatchingLine(parsed.text, new RegExp(`"${script}"\\s*:`));
      commands.push({
        command: packageInvocation(manager, packageFile, script),
        action: classifyCommand(script),
        path: packageFile,
        line: match?.line ?? 1,
        detail: `${script} script declared in package manifest`
      });
    }
  }

  if (files.includes("Makefile")) {
    const text = await readRepositoryText(root, "Makefile");
    for (const target of ["test", "check", "lint", "build", "verify"]) {
      const line = makeTargetLine(text, target);
      if (line) commands.push({ command: `make ${target}`, action: classifyCommand(target), path: "Makefile", line, detail: `Makefile target ${target}` });
    }
  }
  if (files.includes("Cargo.toml")) {
    const cargo = await readRepositoryText(root, "Cargo.toml");
    if (/^\s*\[(?:package|workspace)\]\s*$/m.test(cargo ?? "")) commands.push({ command: "cargo test", action: "test", path: "Cargo.toml", line: 1, detail: "Rust package/workspace manifest" });
  }
  if (files.includes("go.mod")) {
    const goModule = await readRepositoryText(root, "go.mod");
    if (/^\s*module\s+\S+/m.test(goModule ?? "")) commands.push({ command: "go test ./...", action: "test", path: "go.mod", line: 1, detail: "Go module declaration" });
  }
  for (const pathName of ["pyproject.toml", "pytest.ini", "tox.ini"]) {
    if (!files.includes(pathName)) continue;
    const configuration = await readRepositoryText(root, pathName);
    const configured = pathName === "pyproject.toml"
      ? /^\s*\[tool\.pytest(?:\.|\])/m.test(configuration ?? "")
      : pathName === "pytest.ini"
        ? /^\s*\[pytest\]\s*$/m.test(configuration ?? "")
        : /^\s*\[(?:tox|testenv(?::[^\]]+)?)\]\s*$/m.test(configuration ?? "");
    if (configured) commands.push({ command: pathName === "tox.ini" ? "tox" : "pytest", action: "test", path: pathName, line: 1, detail: "Python test configuration" });
  }

  const ciCandidates = files.filter((file) =>
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file) ||
    file === ".gitlab-ci.yml" ||
    file === "azure-pipelines.yml" ||
    /^\.circleci\/config\.ya?ml$/.test(file)
  );
  const ciFiles = await filterContentFiles(root, ciCandidates, hasCiExecutionStep);
  const testCandidates = files.filter((file) =>
    /(^|\/)(?:tests?|__tests__)(\/|$)/i.test(file) || /(?:\.test|\.spec)\.[A-Za-z0-9]+$/.test(file)
  );
  const testFiles = await filterContentFiles(root, testCandidates);
  const environmentCandidates = files.filter((file) =>
    /(^|\/)(?:\.env\.example|\.env\.sample|docker-compose[^/]*\.ya?ml|compose\.ya?ml|flake\.nix|shell\.nix|devbox\.json|mise\.toml|\.tool-versions)$/.test(file) || file.startsWith(".devcontainer/")
  );
  const environmentFiles = await filterContentFiles(root, environmentCandidates);
  const setupCandidates = files.filter((file) =>
    /(^|\/)(?:README|CONTRIBUTING|DEVELOPING|INSTALL)(?:\.[A-Za-z0-9_-]+)?\.(?:md|rst|adoc|txt)$/i.test(file) || /(^|\/)docs\/(?:setup|development|contributing)/i.test(file)
  );
  const setupDocs = await filterContentFiles(root, setupCandidates);

  return {
    commands: distinctBy(commands, (entry) => entry.command),
    ci_files: ciFiles,
    test_files: testFiles,
    lockfiles,
    environment_files: environmentFiles,
    setup_docs: setupDocs
  };
}

async function collectWorkspace(root, files, instructions) {
  const policyRecords = instructions.files.flatMap((record) =>
    record.isolation_policies.map((policy) => ({ path: record.path, ...policy }))
  );
  const contributionPolicyFiles = files.filter((file) => /(^|\/)(?:CONTRIBUTING|DEVELOPING|WORKFLOW)\.md$/i.test(file));
  for (const file of contributionPolicyFiles.slice(0, 100)) {
    const text = await readRepositoryText(root, file);
    for (const { line, text: matchedText } of matchingLines(text, ISOLATION_RE, 20)) {
      const unsafe = isUnsafeIsolationPolicy(matchedText);
      policyRecords.push({
        path: file,
        line,
        detail: unsafe ? "Unsafe shared-workspace policy" : "Task/workspace isolation policy",
        unsafe,
        strength: STRONG_ISOLATION_RE.test(matchedText) ? "strong" : "branch-only"
      });
    }
  }
  const manifestCandidates = files.filter((file) =>
    ["pnpm-workspace.yaml", "turbo.json", "nx.json", "lerna.json", "go.work"].includes(file)
  );
  const workspaceManifests = await filterContentFiles(root, manifestCandidates, (text, file) => {
    if (file === "pnpm-workspace.yaml") return /^\s*packages\s*:/m.test(text);
    if (file === "go.work") return /^\s*(?:go\s+\S+|use\s+)/m.test(text);
    try {
      const value = JSON.parse(text);
      if (file === "turbo.json") return Boolean(value?.tasks || value?.pipeline);
      if (file === "lerna.json") return Array.isArray(value?.packages) && value.packages.length > 0;
      return Object.keys(value ?? {}).length > 0;
    } catch {
      return false;
    }
  });
  if (files.includes("Cargo.toml")) {
    const cargo = await readRepositoryText(root, "Cargo.toml");
    if (/^\s*\[workspace\]\s*$/m.test(cargo ?? "")) workspaceManifests.push("Cargo.toml");
  }
  const environmentCandidates = files.filter((file) =>
    file.startsWith(".devcontainer/") ||
    /(^|\/)(?:docker-compose[^/]*\.ya?ml|compose\.ya?ml|flake\.nix|shell\.nix|devbox\.json|mise\.toml)$/.test(file)
  );
  const environmentIsolation = await filterContentFiles(root, environmentCandidates);
  const generatedPaths = files.filter((file) =>
    /(?:^|\/)(?:generated|gen)(?:\/|$)/i.test(file) || /(?:\.generated\.|\.g\.)[^/]+$/.test(file)
  );
  return {
    policies: distinctBy(policyRecords.filter((entry) => !entry.unsafe), (entry) => `${entry.path}:${entry.line}`),
    unsafe_policies: distinctBy(policyRecords.filter((entry) => entry.unsafe), (entry) => `${entry.path}:${entry.line}`),
    workspace_manifests: workspaceManifests,
    environment_isolation: environmentIsolation,
    generated_paths: generatedPaths.slice(0, 50),
    top_level_directories: topLevelDirectories(files)
  };
}

async function collectOwnership(root, files, instructions, workspace) {
  const codeownersFiles = files.filter((file) => /(^|\/)(?:CODEOWNERS|OWNERS)$/.test(file));
  const codeowners = [];
  for (const file of codeownersFiles.slice(0, 20)) {
    const text = await readRepositoryText(root, file);
    const rules = toLines(text)
      .map((line, index) => ({ line: index + 1, value: line.trim() }))
      .filter((entry) => entry.value && !entry.value.startsWith("#") && entry.value.split(/\s+/).slice(1).some((owner) => owner.startsWith("@") || owner.includes("@")))
      .slice(0, 100);
    codeowners.push({ path: file, rule_count: rules.length, sample_rule_lines: rules.slice(0, 10).map((rule) => rule.line) });
  }
  const ownershipCandidates = files.filter((file) =>
    /(^|\/)(?:MAINTAINERS|GOVERNANCE|OWNERSHIP)(?:\.[A-Za-z0-9_-]+)?(?:\.md)?$/i.test(file) ||
    /(^|\/)docs\/[^/]*ownership[^/]*\.md$/i.test(file)
  );
  const ownershipDocs = await filterContentFiles(root, ownershipCandidates);
  const securityCandidates = files.filter((file) => /(^|\/)(?:SECURITY\.md|\.env\.example|\.env\.sample)$/.test(file));
  const securityDocs = await filterContentFiles(root, securityCandidates);
  const explicitBoundaries = instructions.files.flatMap((record) =>
    record.boundaries.map((line) => ({ path: record.path, ...line }))
  );
  return {
    codeowners,
    ownership_docs: ownershipDocs,
    generated_boundaries: workspace.generated_paths,
    security_guidance: securityDocs,
    explicit_boundaries: explicitBoundaries.slice(0, 50)
  };
}

async function collectContext(root, files) {
  const architectureCandidates = files.filter((file) => {
    const lower = file.toLowerCase();
    return /(^|\/)(architecture|design|system-overview|repo-structure|threat-model|security-model|design-principles)\.(?:md|rst|adoc|txt)$/.test(lower) ||
      /(^|\/)docs\/(architecture|design)(?:\/.*)?\.(?:md|rst|adoc|txt)$/.test(lower);
  });
  const decisionCandidates = files.filter((file) => {
    const lower = file.toLowerCase();
    return ((/(^|\/)(adr|adrs|decisions|rfcs)\//.test(lower) && DOC_EXT_RE.test(lower)) || /(^|\/)(adr|decision)-?\d+.*\.(?:md|rst|adoc|txt)$/.test(lower));
  });
  const architectureDocs = await filterContentFiles(root, architectureCandidates);
  const decisionDocs = await filterContentFiles(root, decisionCandidates);
  const moduleCandidates = files.filter((file) => file.includes("/") && /(^|\/)README(?:\.[A-Za-z0-9_-]+)?\.(?:md|rst|adoc|txt)$/i.test(file));
  const moduleDocs = await filterContentFiles(root, moduleCandidates);
  const rootReadme = files.find((file) => /^README(?:\.[A-Za-z0-9_-]+)?\.(?:md|rst|adoc|txt)$/i.test(file));
  let rootMap = null;
  let contextTree = null;
  if (rootReadme) {
    const text = await readRepositoryText(root, rootReadme);
    const mapMatch = firstMatchingLine(text, /\b(?:architecture|repository structure|repo structure|project structure|monorepo (?:layout|structure)|workspace (?:layout|structure))\b/i);
    if (mapMatch) rootMap = { path: rootReadme, line: mapMatch.line, detail: "Root architecture or repository-map reference" };
    const treeMatch = firstMatchingLine(text, /\bContext Tree\b/i);
    if (treeMatch) contextTree = { path: rootReadme, line: treeMatch.line, detail: "Context Tree reference" };
  }
  if (!contextTree) {
    for (const file of [...architectureDocs, ...decisionDocs].slice(0, 50)) {
      const text = await readRepositoryText(root, file);
      const match = firstMatchingLine(text, /\bContext Tree\b/i);
      if (match) {
        contextTree = { path: file, line: match.line, detail: "Context Tree reference" };
        break;
      }
    }
  }
  return {
    architecture_docs: architectureDocs,
    decision_docs: decisionDocs,
    module_docs: moduleDocs.slice(0, 100),
    root_map: rootMap,
    context_tree_reference: contextTree,
    context_tree_binding_file: (await filterContentFiles(root, files.includes(".first-tree/workspace.json") ? [".first-tree/workspace.json"] : [], (text) => {
      try {
        return Object.keys(JSON.parse(text) ?? {}).length > 0;
      } catch {
        return false;
      }
    }))[0] ?? null
  };
}

async function collectHandoff(root, files) {
  const issueCandidates = files.filter((file) =>
    /^\.github\/ISSUE_TEMPLATE\/[^/]+\.(?:md|ya?ml)$/i.test(file) || /(^|\/)ISSUE_TEMPLATE\.md$/i.test(file)
  ).filter((file) => !/(^|\/)config\.ya?ml$/i.test(file));
  const pullRequestCandidates = files.filter((file) =>
    /^\.github\/(?:PULL_REQUEST_TEMPLATE(?:\/[^/]+)?|pull_request_template)\.md$/i.test(file) ||
    /(^|\/)PULL_REQUEST_TEMPLATE\.md$/i.test(file)
  );
  const contributionCandidates = files.filter((file) =>
    /(^|\/)(?:CONTRIBUTING|DEVELOPING|WORKFLOW)(?:\.[A-Za-z0-9_-]+)?\.(?:md|rst|adoc|txt)$/i.test(file)
  );
  const issueTemplates = await filterContentFiles(root, issueCandidates, (text, file) => /\.ya?ml$/i.test(file) ? /^\s*body\s*:/m.test(text) : hasSubstantiveMarkdownTemplate(text));
  const pullRequestTemplates = await filterContentFiles(root, pullRequestCandidates, hasSubstantiveMarkdownTemplate);
  const contributionDocs = await filterContentFiles(root, contributionCandidates);
  const signals = [];
  for (const file of [...issueTemplates, ...pullRequestTemplates, ...contributionDocs].slice(0, 100)) {
    const text = await readRepositoryText(root, file);
    const acceptance = matchingLines(text, ACCEPTANCE_RE, 20);
    const testing = matchingLines(text, TESTING_RE, 20);
    for (const { line } of acceptance) signals.push({ type: "acceptance", path: file, line, detail: "Acceptance or definition-of-done signal" });
    for (const { line } of testing) signals.push({ type: "testing", path: file, line, detail: "Verification evidence prompt" });
  }
  return {
    issue_templates: issueTemplates,
    pull_request_templates: pullRequestTemplates,
    contribution_docs: contributionDocs,
    acceptance_signals: signals.filter((signal) => signal.type === "acceptance"),
    testing_signals: signals.filter((signal) => signal.type === "testing")
  };
}

export async function collectEvidence({ root, source, name, revision, worktreeState, inventory }) {
  const semanticFiles = inventory.files.filter((file) => !isNonAuthoritativePath(file));
  const instructions = await collectInstructions(root, semanticFiles);
  const verification = await collectVerification(root, semanticFiles);
  const workspace = await collectWorkspace(root, semanticFiles, instructions);
  workspace.top_level_directories = topLevelDirectories(inventory.files);
  const ownership = await collectOwnership(root, semanticFiles, instructions, workspace);
  const context = await collectContext(root, semanticFiles);
  const handoff = await collectHandoff(root, semanticFiles);

  return {
    schema_version: EVIDENCE_SCHEMA_VERSION,
    repository: {
      source,
      name,
      revision,
      worktree_state: worktreeState,
      file_count: inventory.fileCount,
      analyzed_file_count: inventory.files.length,
      skipped_file_count: inventory.skippedFileCount,
      skipped_files: inventory.skippedFiles,
      inventory_truncated: inventory.truncated,
      top_level_directories: workspace.top_level_directories
    },
    instructions,
    workspace,
    ownership,
    context,
    verification,
    handoff,
    strongest_inventory_evidence: inventory.files.length > 0
      ? fileEvidence(inventory.files[0], `First of ${inventory.files.length} analyzed repository files`, 1)
      : null
  };
}
