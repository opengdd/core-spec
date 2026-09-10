# Write a panel

This is the current guide for revision 1 of the OpenGDD workbench extension
API.

## The shortest path

1. Export one plain descriptor as the default export of an `.mjs` file.
2. Set `api: 1`, a namespaced `id`, a designer-facing `title`, `surfaces`,
   `inspects`, `empty`, and `create(context)`. Add `needs`, `creates`, `styles`,
   or `placement: "companion"` only when required. There is no `compact` field.
3. Test the descriptor directly:

   ```js
   import panel from "./panel.mjs";
   import { validatePanelDescriptor } from "/authoring-tool/src/panel-host.mjs";

   validatePanelDescriptor(panel);
   ```

4. Import it in the host and include it in the `panels` array:

   ```js
   import bundled from "/authoring-tool/panels/index.mjs";
   import glossary from "/extensions/glossary/panel.mjs";

   mountWorkbenchShell(root, { panels: [...bundled, glossary], /* data options */ });
   ```

5. Ship the module and any stylesheet at stable same-origin URLs. A stylesheet
   is declared as `styles: new URL("./panel.css", import.meta.url)`; it needs no
   import-map entry or registration side effect.

A panel without `placement` competes for the one exclusive Inspector. Exact
ties keep the first descriptor and are reported once. Use
`placement: "companion"` for additive UI: every match appears below the chosen
Inspector under the panel's own title.

## Worked example: a glossary companion

This complete panel lists the backticked names in a selected section, reports
missing entries as titled validation warnings, and adds an entry through the
shared undoable edit service. A section's `range` is its heading line;
`extent` covers the whole section through the line before the next heading of
the same or higher level.

```js
const STORE = "panels/thirdparty.glossary/glossary.json";

const endOf = text => {
  const lines = text.split("\n");
  return { line: lines.length - 1, character: lines.at(-1).length };
};

const readStore = context => {
  const text = context.package.read(STORE);
  if (typeof text !== "string") return { text: null, terms: [] };
  const value = JSON.parse(text);
  return { text, terms: Array.isArray(value.terms) ? value.terms : [] };
};

const sectionText = (text, extent) => text.split("\n")
  .slice(extent.start.line, extent.end.line + 1).join("\n");

export default {
  api: 1,
  id: "thirdparty.glossary",
  title: "Glossary",
  placement: "companion",
  surfaces: ["inspector"],
  inspects: { kinds: ["section"] },
  needs: ["selection", "edits", "validation"],
  empty: { title: "Choose a section to see its cited names." },

  create(context) {
    const root = context.document.createElement("section");
    context.element.append(root);

    const render = () => {
      const selected = context.services.selection.current();
      const source = selected?.kind === "section"
        ? context.package.read(selected.file) : null;
      if (typeof source !== "string" || !selected.extent) {
        context.surface.empty(true);
        context.services.validation.contribute([]);
        return;
      }
      context.surface.empty(false);
      const cited = [...new Set([...sectionText(source, selected.extent)
        .matchAll(/`([^`]+)`/g)].map(match => match[1]))].sort();
      const stored = readStore(context);
      const known = new Set(stored.terms);
      const missing = cited.filter(term => !known.has(term));
      context.services.validation.contribute(missing.map(term => ({
        severity: "info", file: selected.file,
        line: selected.range.start.line + 1,
        message: `Add \`${term}\` to the glossary.`
      })));

      root.replaceChildren();
      for (const term of cited) {
        const row = context.document.createElement("p");
        row.append(context.document.createTextNode(term));
        if (!known.has(term)) {
          const add = context.document.createElement("button");
          add.type = "button";
          add.textContent = "Add";
          add.addEventListener("click", async () => {
            const current = readStore(context);
            const next = `${JSON.stringify({
              terms: [...new Set([...current.terms, term])].sort()
            }, null, 2)}\n`;
            const tx = context.services.edits.begin(`Add “${term}” to the glossary`);
            if (current.text === null) tx.file(STORE).create(next);
            else tx.text(STORE).replace({
              start: { line: 0, character: 0 }, end: endOf(current.text),
              revision: context.package.revision(STORE)
            }, next);
            await tx.commit();
          }, { signal: context.signal });
          row.append(" ", add);
        }
        root.append(row);
      }
    };

    context.services.selection.subscribe(render);
    context.package.subscribe(render);
    render();
  }
};
```

The code block is 86 lines. It keeps its created data under the reserved panel
root. The host enforces that root for file/folder creation and moves only;
`tx.text`, `tx.json`, and `tx.file(path).remove()` can affect any package file.
That is an API rule for cooperative code, not a security boundary.

## Services and failure behavior

The services are `selection`, `edits`, `validation`, `references` and
`forms`; `grid` and `assets` are named in the contract but not implemented
yet, so a panel that needs them is refused. Declare a whole service or a
named member in `needs`. The implemented members are listed in `README.md`. In
particular, `selection.clear()` is available,
`context.package.packageRevision` changes on each package commit, and
`references.pick` is not revision-1 vocabulary.

`validation.contribute()` accepts `warning` and `info` advice. The host shows
both as warnings labelled with the panel title and includes them in displayed
warning counts; advice does not become a conformance error.

Descriptor rejection appears as a persistent **Panel not loaded** message. It
survives automatic package opening and clears when the designer selects
something or chooses a package. Exceptions from lifecycle callbacks are
contained to the panel surface; a failed Inspector panel is created afresh the
next time it is chosen. Use `context.signal` for DOM listeners and
return `{ destroy() {} }` when the panel owns resources the host cannot abort.
