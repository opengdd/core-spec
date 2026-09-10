import { INSPECTOR_COPY } from "../../src/copy/inspector-copy.mjs";
import { createEntityInspector } from "../../src/inspector-kit.mjs";
import {
  renameSection, routeSectionFinding, sectionEntity, sectionFields, sectionSections
} from "../../src/section-fields.mjs";

const descriptor = {
  api: 1,
  id: "opengdd.section",
  title: INSPECTOR_COPY.sectionTitle,
  surfaces: ["inspector"],
  inspects: { kinds: ["section"] },
  needs: ["selection", "edits", "validation", "forms", "references"],
  empty: { title: INSPECTOR_COPY.sectionEmpty },
  create(context) {
    return createEntityInspector(context, {
      id: "section",
      compact: "reflow",
      match(selection, files) {
        return selection?.file ? sectionEntity(selection, files, context.package.revision(selection.file)) : null;
      },
      fields: sectionFields,
      sections: sectionSections,
      findings: { route: routeSectionFinding },
      renameAction: renameSection,
      headerHelp: INSPECTOR_COPY.sectionRemoveHelp
    });
  }
};

export default descriptor;
