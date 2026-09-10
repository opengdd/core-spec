import { INSPECTOR_COPY } from "../../src/copy/inspector-copy.mjs";
import { createEntityInspector, structuredEditBlocked } from "../../src/inspector-kit.mjs";
import {
  acceptanceTestEntity, acceptanceTestFields, acceptanceTestSections, renameAcceptanceTest,
  routeAcceptanceTestFinding
} from "../../src/test-fields.mjs";

const createAcceptanceTest = (context, request = {}) => context.internal.create("Acceptance test", request.anchor);

const descriptor = {
  api: 1,
  id: "opengdd.acceptance-test",
  title: INSPECTOR_COPY.acceptanceTestTitle,
  surfaces: ["inspector"],
  inspects: { kinds: ["acceptance-test"] },
  needs: ["selection", "edits", "validation", "forms", "references"],
  empty: { title: INSPECTOR_COPY.acceptanceTestEmpty },
  creates: [{
    kind: "acceptance-test", label: INSPECTOR_COPY.newAcceptanceTest,
    help: INSPECTOR_COPY.newAcceptanceTestHelp, needs: ["edits"], run: createAcceptanceTest
  }],
  create(context) {
    return createEntityInspector(context, {
      id: "acceptance-test",
      compact: "reflow",
      match(selection, files) {
        return selection?.file ? acceptanceTestEntity(selection, files, context.package.revision(selection.file)) : null;
      },
      blocked(_shapeContext, entity) { return entity.blockError ?? structuredEditBlocked(entity.block.text); },
      fields: acceptanceTestFields,
      sections: acceptanceTestSections,
      findings: { route: routeAcceptanceTestFinding },
      renameAction: renameAcceptanceTest,
      remove(entity) {
        const citations = context.internal.entry?.()?.citations ?? [];
        return {
          range: entity.removeRange, label: entity.id,
          expectedFindings: [{ code: "PROSE_CITATION_DANGLING", address: entity.id }],
          question: () => INSPECTOR_COPY.removeAcceptanceTestQuestion(entity.id, citations)
        };
      }
    });
  }
};

export default descriptor;
