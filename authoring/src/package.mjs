const CHAPTER_PATHS = [
  "01-overview.md",
  "02-mechanics.md",
  "03-content.md",
  "04-presentation.md",
  "05-build-plan.md"
];

export const SUPPORTED_OPENGDD_VERSION = "0.8";

const json = value => `${JSON.stringify(value, null, 2)}\n`;

export function packageIdFromTitle(title) {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled-package";
}

export function nextAvailablePackageId(base, occupiedIds) {
  const occupied = new Set(occupiedIds);
  if (!occupied.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = base + "-" + suffix;
    if (!occupied.has(candidate)) return candidate;
  }
}

export function createFiveChapterPackage({
  id,
  title,
  designer,
  target,
  chapters,
  tuning,
  manifest = {},
  files = []
}) {
  if (!Array.isArray(chapters) || chapters.length !== CHAPTER_PATHS.length) {
    throw new TypeError("A five-chapter package needs exactly five chapter texts.");
  }
  const packageFiles = new Map(CHAPTER_PATHS.map((path, index) => [path, chapters[index]]));
  packageFiles.set("manifest.json", json({
    opengdd: SUPPORTED_OPENGDD_VERSION,
    id,
    version: "0.1.0",
    title,
    designer,
    target,
    ...manifest
  }));
  packageFiles.set("tuning.json", json(tuning));
  for (const [path, contents] of files) packageFiles.set(path, contents);
  return { id, title, files: packageFiles, folders: new Set() };
}

export function createScaffoldPackage(id, title) {
  const files = new Map([
    ["01-overview.md", `# ${title}\n\n\`\`\`fantasy\nYou are an explorer charting a pocket world that rearranges itself as you walk.\nFeel: curious, playful, surprising.\nNOT: grim.\n\`\`\`\n`],
    ["02-mechanics.md", "# Mechanics\n\nFixed: State the complete rules of the game here.\n"],
    ["05-build-plan.md", `# Build plan\n\n## Phase 1: core-loop\n\n## Phase 2: content\n\n## Phase 3: tuning\n\n## Phase 4: presentation\n\n## Phase 5: polish\n\n## AT-1 — The starter behavior works\n\n\`\`\`test\n{\n  "type": "scenario",\n  "given": "the game is ready to test",\n  "when": "the designer performs the central action",\n  "then": "the game shows the intended result"\n}\n\`\`\`\n`],
    ["manifest.json", json({
      opengdd: SUPPORTED_OPENGDD_VERSION,
      id,
      version: "0.1.0",
      title,
      designer: { name: "Designer" },
      target: { platform: "web-2d", genre: "game" }
    })],
    ["tuning.json", json({ values: {} })]
  ]);
  return { id, title, files, folders: new Set() };
}
