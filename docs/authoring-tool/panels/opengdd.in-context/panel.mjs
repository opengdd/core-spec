export default {
  api: 1,
  id: "opengdd.in-context",
  title: "In context",
  surfaces: ["inspector"],
  inspects: {
    kinds: ["identifier", "tunable", "constant", "section", "acceptance-test", "descriptor", "question", "collection-record", "rule", "palette", "file", "folder"]
  },
  needs: ["selection"],
  compact: {
    strategy: "reflow",
    note: "The selected name and location reflow within the inspector."
  },
  empty: { title: "Choose something in the outline" },
  create(context) {
    const body = context.document.createElement("div");
    context.element.append(body);
    const render = () => {
      const selection = context.services.selection.current();
      context.surface.empty(!selection);
      if (!selection) return;
      body.replaceChildren();
      if (selection.name) {
        const heading = context.document.createElement("h2");
        const code = context.document.createElement("code");
        code.textContent = selection.name;
        heading.append(code);
        body.append(heading);
      }
      const classification = context.document.createElement("p");
      classification.className = "opengdd-author-classification";
      classification.textContent = selection.kind;
      body.append(classification);
      if (selection.file) {
        const location = context.document.createElement("p");
        location.className = "opengdd-author-muted";
        location.textContent = selection.file;
        body.append(location);
      }
    };
    context.services.selection.subscribe(render);
    render();
  }
};
