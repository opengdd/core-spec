document.documentElement.classList.add("contracts-js");

const parseData = (value, fallback) => {
  try { return JSON.parse(value); } catch { return fallback; }
};

function setupSearch() {
  const root = document.querySelector("[data-contract-index]");
  if (!root) return;
  const input = root.querySelector("[data-contract-search]");
  const count = root.querySelector("[data-contract-search-count]");
  const cards = [...root.querySelectorAll("[data-contract-entry]")];

  const update = () => {
    const terms = input.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const card of cards) {
      const matches = terms.every((term) => card.dataset.search.includes(term));
      card.classList.toggle("is-hidden-by-search", !matches);
      card.hidden = !matches;
      if (matches) visible += 1;
    }
    for (const shelf of root.querySelectorAll("[data-contract-shelf]")) {
      const members = [...shelf.querySelectorAll("[data-contract-entry]")];
      shelf.classList.toggle("is-empty-by-search", members.length > 0 && members.every((item) => item.hidden));
    }
    count.textContent = `${visible} ${visible === 1 ? "contract" : "contracts"}`;
  };

  input.addEventListener("input", update);
}

function flagCondition(when, selections) {
  const flags = when?.flag ?? {};
  let unresolved = false;
  for (const [flag, allowed] of Object.entries(flags)) {
    if (!selections.has(flag)) unresolved = true;
    else if (!allowed.includes(selections.get(flag))) return "inactive";
  }
  return unresolved ? "unresolved" : "active";
}

function setupExploration(root) {
  const selections = new Map();
  const questions = [...root.querySelectorAll("[data-contract-question]")];
  const dependents = [...root.querySelectorAll("[data-contract-dependent]")];
  const tests = [...root.querySelectorAll("[data-contract-test]")];

  for (const status of root.querySelectorAll("[data-test-status]")) status.dataset.defaultText = status.textContent;

  const update = () => {
    for (const question of questions) {
      const state = flagCondition(parseData(question.dataset.when, null), selections);
      question.classList.toggle("is-not-applicable", state === "inactive");
      question.classList.toggle("is-unresolved", state === "unresolved");
    }
    for (const item of dependents) {
      const state = flagCondition(parseData(item.dataset.when, null), selections);
      item.classList.toggle("is-not-applicable", state === "inactive");
      item.classList.toggle("is-unresolved", state === "unresolved");
    }
    for (const test of tests) {
      const state = flagCondition(parseData(test.dataset.when, null), selections);
      const dependencies = parseData(test.dataset.dependencies, []);
      const affected = dependencies.some((flag) => selections.has(flag));
      test.classList.toggle("is-not-applicable", state === "inactive");
      test.classList.toggle("is-unresolved", state === "unresolved");
      test.classList.toggle("is-affected", affected);
      const status = test.querySelector("[data-test-status]");
      if (state === "inactive") status.textContent = "Does not apply to the choices currently being explored.";
      else if (state === "active" && Object.keys(parseData(test.dataset.when, {})?.flag ?? {}).length) status.textContent = "Applies to the choices currently being explored.";
      else if (state === "unresolved") status.textContent = status.dataset.defaultText;
      else status.textContent = affected ? "Always applies; the explored choice affects this test." : status.dataset.defaultText;
    }
  };

  for (const question of questions) {
    const flag = question.dataset.flag;
    for (const input of question.querySelectorAll("[data-contract-choice]")) {
      input.addEventListener("change", () => {
        selections.set(flag, input.value);
        update();
      });
    }
  }

  root.querySelector("[data-reset-choices]")?.addEventListener("click", () => {
    selections.clear();
    for (const input of root.querySelectorAll("[data-contract-choice]")) input.checked = false;
    update();
  });
  update();
}

function setupPreset(root) {
  const preset = parseData(root.dataset.contractPreset, null);
  if (!preset || typeof preset !== "object" || Array.isArray(preset)) return;

  const apply = () => {
    for (const question of root.querySelectorAll("[data-contract-question]")) {
      const flag = question.dataset.flag;
      if (!Object.hasOwn(preset, flag)) continue;
      const input = [...question.querySelectorAll("[data-contract-choice]")]
        .find((candidate) => candidate.value === String(preset[flag]));
      if (!input) continue;
      input.checked = true;
      input.dispatchEvent(new Event("change"));
    }
  };

  apply();
  root.querySelector("[data-reset-choices]")?.addEventListener("click", apply);
}

function setupCopy(root) {
  const buttons = [...root.querySelectorAll("[data-copy-core]")];
  if (!buttons.length) return;
  for (const button of buttons) button.addEventListener("click", async () => {
    const status = button.closest(".contract-actions")?.querySelector("[data-copy-status]");
    try {
      const response = await fetch(button.dataset.coreUrl);
      if (!response.ok) throw new Error("Definition could not be loaded.");
      await navigator.clipboard.writeText(await response.text());
      if (status) status.textContent = "Definition copied.";
    } catch {
      if (status) status.textContent = "Copy failed — use Download.";
    }
  });
}

function setupNav() {
  // The nav disclosure ships closed. Wide screens reveal it in CSS through
  // ::details-content; browsers without that pseudo-element get it opened here.
  const disclosure = document.querySelector(".contract-nav-disclosure");
  if (!disclosure || typeof matchMedia !== "function") return;
  const wide = matchMedia("(min-width: 901px)");
  const sync = () => { disclosure.open = wide.matches; };
  sync();
  wide.addEventListener("change", sync);
}

setupSearch();
setupNav();
const contractRoot = document.querySelector("[data-contract-root]");
if (contractRoot) {
  setupExploration(contractRoot);
  setupPreset(contractRoot);
  setupCopy(contractRoot);
}
