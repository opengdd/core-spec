import { SELECTION_KINDS } from "../../src/kinds.mjs";
import { contractFindingOwner, contractOwners, isContractTodoFinding } from "../../src/contracts.mjs";
import { CONTRACT_COPY } from "../../src/copy/contract-copy.mjs";
import { packageFiles, parseJson, plainObject } from "../../src/json-path.mjs";

export default {
  api: 1,
  id: "opengdd.in-context",
  title: "In context",
  surfaces: ["inspector"],
  inspects: {
    kinds: SELECTION_KINDS
  },
  needs: ["selection", "validation"],
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
      const contract = /^contracts\.([a-z0-9]+(?:-[a-z0-9]+)*)(?:\.([a-z0-9]+(?:-[a-z0-9]+)*))?$/u.exec(selection.name ?? "");
      if (contract && ["contract", "contract-value"].includes(selection.kind)) {
        const file = `contracts/${contract[1]}.json`;
        const adoption = parseJson(context.package.read(file));
        if (plainObject(adoption)) {
          if (selection.kind === "contract-value" && contract[2]) {
            const declaration = adoption.declares?.values?.[contract[2]];
            body.append(Object.hasOwn(plainObject(adoption.values) ? adoption.values : {}, contract[2])
              ? Object.assign(context.document.createElement("p"), { textContent: CONTRACT_COPY.contextValue(adoption.values[contract[2]]) })
              : Object.assign(context.document.createElement("p"), { textContent: CONTRACT_COPY.contextValue("—") }));
            if (declaration?.description) body.append(Object.assign(context.document.createElement("p"), {
              textContent: CONTRACT_COPY.contextDescription(declaration.description)
            }));
            if (Array.isArray(declaration?.range) && declaration.range.length === 2) {
              body.append(Object.assign(context.document.createElement("p"), {
                textContent: CONTRACT_COPY.contextRange(declaration.range[0], declaration.range[1])
              }));
            }
          } else {
            body.append(Object.assign(context.document.createElement("p"), {
              textContent: CONTRACT_COPY.contextSummary(adoption.summary ?? "")
            }));
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
            body.append(Object.assign(context.document.createElement("p"), {
              textContent: CONTRACT_COPY.contextTodo(questions, values, inputs)
            }));
          }
          const open = context.document.createElement("button");
          open.type = "button";
          open.textContent = CONTRACT_COPY.openWorksheet;
          open.addEventListener("click", () => context.services.selection.select({
            kind: "contract", name: `contracts.${contract[1]}`, file
          }));
          body.append(open);
          return;
        }
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
