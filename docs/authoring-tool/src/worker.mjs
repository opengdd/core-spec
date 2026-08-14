// Package analysis and conformance validation run here, off the thread that
// paints keystrokes. The tool ships as static files with no build step, and a
// worker gets no import map, so the page resolves the three module names and
// posts the resolved URLs; everything this worker uses is imported from those.

let analyzePackage;
let validatePackage;
let createFileMapHost;
let schemas = null;
const files = new Map();

async function loadModules(urls) {
  const [analysis, validation, host] = await Promise.all([
    import(urls.analysis),
    import(urls.validation),
    import(urls.fileMapHost)
  ]);
  analyzePackage = analysis.analyzePackage;
  validatePackage = validation.validatePackage;
  createFileMapHost = host.createFileMapHost;
}

// Only what the page reads goes back: `documents` is the whole package over
// again, the name index's helpers do not survive a structured clone, and
// nothing in the page looks at `files` or `problems`.
function analysisFor(revision) {
  const result = analyzePackage(files);
  return {
    type: "analysis",
    revision,
    analysis: {
      definitionsByName: result.definitionsByName,
      nameIndex: result.nameIndex,
      anchors: result.anchors,
      manifest: result.manifest
    }
  };
}

async function handle(message) {
  if (message.type === "modules") return loadModules(message.urls);
  if (message.type === "files") {
    for (const path of message.removed) files.delete(path);
    for (const [path, value] of message.set) files.set(path, value);
    return;
  }
  if (message.type === "schemas") {
    schemas = message.schemas;
    return;
  }
  if (message.type === "analyze") return postMessage(analysisFor(message.revision));
  if (message.type === "validate") {
    try {
      const run = validatePackage(createFileMapHost(files, { schemas, bytes: false }), "/package");
      postMessage({ type: "validation", revision: message.revision, run });
    } catch (error) {
      // A validator crash is the page's to report, not this worker's to die of.
      postMessage({ type: "validation", revision: message.revision, message: error.message });
    }
  }
}

// Strictly in order: a file update must never overtake the job it belongs to,
// and the module load must finish before the first job runs.
let queue = Promise.resolve();
addEventListener("message", event => {
  queue = queue
    .then(() => handle(event.data))
    .catch(error => postMessage({ type: "failed", message: error.message }));
});
