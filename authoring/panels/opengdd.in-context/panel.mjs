import { SELECTION_KINDS, kindDefinition } from "../../src/kinds.mjs";
import { contractFindingOwner, contractOwners, isContractTodoFinding } from "../../src/contracts.mjs";
import { CONTRACT_COPY } from "../../src/copy/contract-copy.mjs";
import { WIDGET_COPY } from "../../src/copy/widget-copy.mjs";
import { packageFiles, parseJson, plainObject } from "../../src/json-path.mjs";
import { INSPECTOR_COPY } from "../../src/copy/inspector-copy.mjs";
import { locationRows, referenceGroup } from "../../src/inspector-groups.mjs";

const button = (document, label, run) => {
  const control = document.createElement("button");
  control.type = "button";
  control.textContent = label;
  control.addEventListener("click", () => Promise.resolve(run(control)));
  return control;
};

export default {
  api: 1,
  id: "opengdd.in-context",
  title: "In context",
  surfaces: ["inspector"],
  inspects: { kinds: SELECTION_KINDS },
  needs: ["selection", "validation"],
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

      const contract = /^contracts\.([a-z0-9]+(?:-[a-z0-9]+)*)(?:\.([a-z0-9]+(?:-[a-z0-9]+)*))?$/u.exec(selection.name ?? "");
      if (contract && ["contract", "contract-value"].includes(selection.kind)) {
        const file = `contracts/${contract[1]}.json`;
        const adoption = parseJson(context.package.read(file));
        if (plainObject(adoption)) {
          if (selection.kind === "contract-value" && contract[2]) {
            const declaration = adoption.declares?.values?.[contract[2]];
            body.append(Object.assign(context.document.createElement("p"), { textContent: CONTRACT_COPY.contextValue(
              Object.hasOwn(plainObject(adoption.values) ? adoption.values : {}, contract[2]) ? adoption.values[contract[2]] : "—"
            ) }));
            if (declaration?.description) body.append(Object.assign(context.document.createElement("p"), { textContent: CONTRACT_COPY.contextDescription(declaration.description) }));
            if (Array.isArray(declaration?.range) && declaration.range.length === 2) body.append(Object.assign(context.document.createElement("p"), {
              textContent: CONTRACT_COPY.contextRange(declaration.range[0], declaration.range[1])
            }));
          } else {
            body.append(Object.assign(context.document.createElement("p"), { textContent: CONTRACT_COPY.contextSummary(adoption.summary ?? "") }));
            const pack = `contracts/${adoption.contract}-${adoption.version}.pack.json`;
            body.append(Object.assign(context.document.createElement("p"), {
              textContent: CONTRACT_COPY.contextMode(context.package.read(pack) === undefined ? CONTRACT_COPY.promised : CONTRACT_COPY.checked)
            }));
            const allFindings = context.services.validation.current()?.findings ?? [];
            const contracts = contractOwners(packageFiles(context));
            const findings = allFindings.filter(finding => contractFindingOwner(finding, contracts, allFindings)?.file === file);
            const questions = findings.filter(finding => finding.code === "CONTRACT_ANSWER_MISSING").length;
            const values = findings.filter(finding => finding.code === "CONTRACT_VALUE_MISSING").length;
            const inputs = findings.filter(finding => isContractTodoFinding(finding)
              && !["CONTRACT_ANSWER_MISSING", "CONTRACT_VALUE_MISSING"].includes(finding.code)).length;
            body.append(Object.assign(context.document.createElement("p"), { textContent: CONTRACT_COPY.contextTodo(questions, values, inputs) }));
          }
          body.append(button(context.document, CONTRACT_COPY.openWorksheet, () => context.services.selection.select({
            kind: "contract", name: `contracts.${contract[1]}`, file
          })));
          return;
        }
      }

      const entry = context.internal.entry();
      const classification = context.document.createElement("p");
      classification.className = "opengdd-author-classification";
      classification.textContent = kindDefinition(selection.kind).labels.singular;
      body.append(classification);
      if (selection.file) {
        const location = context.document.createElement("p");
        location.className = "opengdd-author-muted";
        location.textContent = selection.file;
        body.append(location);
      }
      if (entry?.citations?.length) {
        body.append(referenceGroup(context, { label: INSPECTOR_COPY.citations,
          help: INSPECTOR_COPY.citationsHelp,
          rows: [locationRows(context, entry.citations, { reveal: citation => context.internal.revealLocation(citation) })] }));
      }
      if (entry) body.append(button(context.document, WIDGET_COPY.showInFile(entry.file), () => context.internal.openLocation(entry)));
    };
    const cancelSelection = context.services.selection.subscribe(render);
    const cancelPackage = context.package.subscribe(render);
    const cancelValidation = context.services.validation.subscribe(render);
    render();
    return { destroy() { cancelSelection(); cancelPackage(); cancelValidation(); body.remove(); } };
  }
};
