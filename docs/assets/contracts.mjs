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

// Evaluates a condition to "active", "inactive", or "unresolved". Answer
// (flag) conditions read the explored selections; the widened forms
// (value-form, row-count, row-has) read the adoption facts a filled-form
// page embeds, and stay "unresolved" on a bare entry page without them.
function flagCondition(when, selections, facts) {
  if (!when || typeof when !== "object") return "active";
  if (Array.isArray(when.any)) {
    const states = when.any.map((branch) => flagCondition(branch, selections, facts));
    if (states.includes("active")) return "active";
    return states.every((state) => state === "inactive") ? "inactive" : "unresolved";
  }
  if (Array.isArray(when.all)) {
    const states = when.all.map((branch) => flagCondition(branch, selections, facts));
    if (states.includes("inactive")) return "inactive";
    return states.every((state) => state === "active") ? "active" : "unresolved";
  }
  if (when["value-form"]) {
    if (!facts) return "unresolved";
    for (const [name, forms] of Object.entries(when["value-form"])) {
      const form = facts.valueForms?.[name];
      if (!form || !forms.includes(form)) return "inactive";
    }
    return "active";
  }
  if (when["row-count"]) {
    if (!facts) return "unresolved";
    for (const [name, cardinality] of Object.entries(when["row-count"])) {
      const count = facts.rowCounts?.[name] ?? 0;
      const holds = cardinality === "empty" ? count === 0
        : cardinality === "non-empty" ? count > 0
        : count >= 2;
      if (!holds) return "inactive";
    }
    return "active";
  }
  if (when["row-has"]) {
    if (!facts) return "unresolved";
    for (const [rowSet, fields] of Object.entries(when["row-has"])) {
      const rows = Array.isArray(facts.rows?.[rowSet]) ? facts.rows[rowSet] : [];
      const found = rows.some((row) => Object.entries(fields ?? {})
        .every(([field, allowed]) => allowed.includes(row?.[field])));
      if (!found) return "inactive";
    }
    return "active";
  }
  const flags = when.flag ?? {};
  let unresolved = false;
  for (const [flag, allowed] of Object.entries(flags)) {
    if (!selections.has(flag)) unresolved = true;
    else if (!allowed.includes(selections.get(flag))) return "inactive";
  }
  return unresolved ? "unresolved" : "active";
}

function setupExploration(root) {
  const selections = new Map();
  const facts = parseData(root.dataset.contractFacts ?? "", null);
  const questions = [...root.querySelectorAll("[data-contract-question]")];
  const dependents = [...root.querySelectorAll("[data-contract-dependent]")];
  const tests = [...root.querySelectorAll("[data-contract-test]")];

  for (const status of root.querySelectorAll("[data-test-status]")) status.dataset.defaultText = status.textContent;

  const update = () => {
    for (const question of questions) {
      const state = flagCondition(parseData(question.dataset.when, null), selections, facts);
      question.classList.toggle("is-not-applicable", state === "inactive");
      question.classList.toggle("is-unresolved", state === "unresolved");
    }
    for (const item of dependents) {
      const state = flagCondition(parseData(item.dataset.when, null), selections, facts);
      item.classList.toggle("is-not-applicable", state === "inactive");
      item.classList.toggle("is-unresolved", state === "unresolved");
    }
    for (const test of tests) {
      const state = flagCondition(parseData(test.dataset.when, null), selections, facts);
      const dependencies = parseData(test.dataset.dependencies, []);
      const affected = dependencies.some((flag) => selections.has(flag));
      test.classList.toggle("is-not-applicable", state === "inactive");
      test.classList.toggle("is-unresolved", state === "unresolved");
      test.classList.toggle("is-affected", affected);
      const status = test.querySelector("[data-test-status]");
      if (state === "inactive") status.textContent = "Does not apply to these answers.";
      else if (state === "active" && Object.keys(parseData(test.dataset.when, {})?.flag ?? {}).length) status.textContent = "Applies to these answers.";
      else if (state === "unresolved") status.textContent = status.dataset.defaultText;
      else status.textContent = affected ? "Always applies. Your answer changes what it checks." : status.dataset.defaultText;
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
      if (!response.ok) throw new Error("The file could not be loaded.");
      await navigator.clipboard.writeText(await response.text());
      if (status) status.textContent = `${button.dataset.copyKind === "adoption" ? "Adoption" : "Contract"} copied.`;
    } catch {
      if (status) status.textContent = "Copy failed. Use the download link instead.";
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

// A sidebar link to a folded section, or a URL that arrives with its hash,
// opens the fold and any fold around the target before the jump.
function setupAnchors() {
  const reveal = (hash) => {
    if (!hash || hash.length < 2) return;
    let target;
    try { target = document.getElementById(decodeURIComponent(hash.slice(1))); } catch { return; }
    if (!target) return;
    for (let node = target; node; node = node.parentElement) {
      if (node.tagName === "DETAILS") node.open = true;
    }
  };
  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (link) reveal(link.getAttribute("href"));
  });
  addEventListener("hashchange", () => reveal(location.hash));
  reveal(location.hash);
}

function setupBuilderWording(root) {
  const toggle = root.querySelector("[data-builder-wording]");
  if (!toggle) return;
  const sync = () => root.classList.toggle("is-showing-builder-wording", toggle.checked);
  toggle.addEventListener("change", sync);
  sync();
}

setupSearch();
setupNav();
setupAnchors();
const contractRoot = document.querySelector("[data-contract-root]");
if (contractRoot) {
  setupExploration(contractRoot);
  setupPreset(contractRoot);
  setupCopy(contractRoot);
  setupBuilderWording(contractRoot);
}
