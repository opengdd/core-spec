import mechanismPanel from "./opengdd.mechanism/panel.mjs";
import contractPanel from "./opengdd.contract/panel.mjs";
import collectionPanel from "./opengdd.collection/panel.mjs";
import recordFormPanel from "./opengdd.record-form/panel.mjs";
import palettePanel from "./opengdd.palette/panel.mjs";
import moodPanel from "./opengdd.mood/panel.mjs";
import directionPromisePanel from "./opengdd.direction-promise/panel.mjs";
import tuningValuePanel from "./opengdd.tuning-value/panel.mjs";
import tuningRulePanel from "./opengdd.tuning-rule/panel.mjs";
import clockPanel from "./opengdd.clock/panel.mjs";
import acceptanceTestPanel from "./opengdd.acceptance-test/panel.mjs";
import sectionPanel from "./opengdd.section/panel.mjs";
import questionPanel from "./opengdd.question/panel.mjs";
import inContextPanel from "./opengdd.in-context/panel.mjs";
import notesPanel from "./example.notes/notes.mjs";

export const panels = Object.freeze([
  mechanismPanel,
  contractPanel,
  collectionPanel,
  recordFormPanel,
  palettePanel,
  moodPanel,
  directionPromisePanel,
  tuningValuePanel,
  tuningRulePanel,
  clockPanel,
  acceptanceTestPanel,
  sectionPanel,
  questionPanel,
  inContextPanel,
  notesPanel
]);

export default panels;
