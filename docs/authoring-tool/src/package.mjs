const CHAPTER_PATHS = [
  "01-overview.md",
  "02-mechanics.md",
  "03-content.md",
  "04-presentation.md",
  "05-build-plan.md"
];

const json = value => `${JSON.stringify(value, null, 2)}\n`;

export function packageIdFromTitle(title) {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled-package";
}

export function createFiveChapterPackage({
  id,
  title,
  designer,
  target,
  chapters,
  tuning,
  build = {},
  manifest = {},
  files = []
}) {
  if (!Array.isArray(chapters) || chapters.length !== CHAPTER_PATHS.length) {
    throw new TypeError("A five-chapter package needs exactly five chapter texts.");
  }
  const packageFiles = new Map(CHAPTER_PATHS.map((path, index) => [path, chapters[index]]));
  packageFiles.set("manifest.json", json({
    opengdd: "0.5",
    id,
    version: "0.1.0",
    title,
    designer,
    target,
    build: {
      chapters: CHAPTER_PATHS.slice(0, 4),
      plan: CHAPTER_PATHS[4],
      tuning: "tuning.json",
      ...build
    },
    ...manifest
  }));
  packageFiles.set("tuning.json", json(tuning));
  for (const [path, contents] of files) packageFiles.set(path, contents);
  return { id, title, files: packageFiles, folders: new Set() };
}

export function createScaffoldPackage(id, title) {
  return createFiveChapterPackage({
    id,
    title,
    designer: { name: "[DESIGNER: replace with your name]" },
    target: { platform: "web-2d", genre: "[DESIGNER: replace with your genre]" },
    chapters: [
      `# ${title}\n\n\`\`\`fantasy\nDESIGNER PLACEHOLDER: Replace this with one sentence describing the player's central promise.\nFeel: curious, capable, surprised\nNOT: DESIGNER PLACEHOLDER — replace with a nearby experience this game must avoid\n\`\`\`\n\n[DESIGNER: Replace every bracketed prompt and every DESIGNER PLACEHOLDER with your own design. Delete this note when the package is ready.]\n\n[DESIGNER: Describe the game and its player.] A first session is planned for \`play.session_minutes\` minutes.\n`,
      `# Mechanics\n\n[DESIGNER: Explain the rules and how the player changes the game state.]\n\n## Core loop {#core-loop}\n\n[DESIGNER: Replace this with the repeated decisions and feedback that form the game.] The build follows \`#core-loop\`.\n\n## AT-1 — Core loop can be completed\n\n[DESIGNER: State the observable behavior this acceptance test protects.]\n`,
      `# Content\n\n[DESIGNER: List the authored places, characters, objects, encounters, or other content the build needs.]\n`,
      `# Presentation\n\n[DESIGNER: Describe the visual, audio, motion, and interface direction. Include concrete anti-goals.]\n`,
      `# Build plan\n\n[DESIGNER: Replace this with the build order and checkpoints.] Start with \`#core-loop\`, then run \`AT-1\`.\n\n## AT-1 — Core loop can be completed\n\n\`\`\`test\n{\n  "type": "scenario",\n  "given": "[DESIGNER: replace with the starting state]",\n  "when": "[DESIGNER: replace with the player action]",\n  "then": "[DESIGNER: replace with the observable result]"\n}\n\`\`\`\n\nDESIGNER PLACEHOLDER: Explain in plain language how the builder should run and judge this test.\n`
    ],
    tuning: {
      tunables: { "play.session_minutes": 10 },
      constants: {}
    }
  });
}
