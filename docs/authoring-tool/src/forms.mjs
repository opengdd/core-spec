import { renderBackticks } from "./dom.mjs";
import { plainObject, pointerSegment } from "./json-path.mjs";

const FIELD_TYPES = new Set([
  "text", "longtext", "number", "integer", "boolean", "enum", "choice", "list", "link", "lines", "reference"
]);

let nextFormId = 0;

const pointerParts = pointer => {
  if (typeof pointer !== "string" || (pointer && !pointer.startsWith("/"))) {
    throw new Error("A form binding pointer must be empty or begin with /.");
  }
  return pointer ? pointer.slice(1).split("/").map(part => {
    if (/~(?:[^01]|$)/.test(part)) throw new Error(`Form binding ${JSON.stringify(pointer)} has an invalid ~ escape.`);
    return part.replaceAll("~1", "/").replaceAll("~0", "~");
  }) : [];
};
const pointerFrom = parts => parts.length ? `/${parts.map(pointerSegment).join("/")}` : "";
const childPointer = (pointer, ...parts) => `${pointer}${parts.map(part => `/${pointerSegment(part)}`).join("")}`;

function readBinding(packageService, binding) {
  const text = packageService.read(binding.file);
  if (typeof text !== "string") throw new Error(`${binding.file} is not a text file.`);
  let document;
  try { document = JSON.parse(text); }
  catch { throw new Error(`${binding.file} is not valid JSON yet.`); }
  let value = document;
  let exists = true;
  for (const part of pointerParts(binding.pointer)) {
    if (Array.isArray(value)) {
      const index = /^(?:0|[1-9]\d*)$/.test(part) ? Number(part) : -1;
      exists = index >= 0 && index < value.length;
      value = exists ? value[index] : undefined;
    } else if (plainObject(value)) {
      exists = Object.hasOwn(value, part);
      value = exists ? value[part] : undefined;
    } else {
      exists = false;
      value = undefined;
    }
    if (!exists) break;
  }
  return { document, exists, value };
}

function helpText(help) {
  return typeof help === "string" ? help : help?.text;
}

function defaultLineValue(fields) {
  const row = {};
  for (const field of fields) {
    if (field.seed === false) continue;
    if (field.type === "link") row[field.key] = field.options?.many ? [] : null;
    else if (field.type === "lines") row[field.key] = [];
    else if (field.required) {
      if (field.type === "number" || field.type === "integer") row[field.key] = 0;
      else if (field.type === "boolean") row[field.key] = false;
      else if (field.type === "enum") row[field.key] = field.options?.[0] ?? "";
      else if (field.type === "choice") row[field.key] = field.options?.[0]?.value ?? "";
      else if (field.type === "list") row[field.key] = [];
      else row[field.key] = "";
    }
  }
  return row;
}

export function createForms({ package: packageService, edits, validatePackage, copy = {} } = {}) {
  if (!packageService || typeof packageService.read !== "function") throw new TypeError("createForms requires the panel package service.");
  if (!edits || typeof edits.begin !== "function") throw new TypeError("createForms requires the edit service.");
  if (typeof validatePackage !== "function") throw new TypeError("createForms requires staged package validation.");

  return Object.freeze({
    create(element, { fields, onChange, labels = {} } = {}) {
      if (!element?.ownerDocument || typeof element.replaceChildren !== "function") {
        throw new TypeError("forms.create requires an Element.");
      }
      if (!Array.isArray(fields)) throw new TypeError("forms.create requires a fields array.");
      for (const field of fields) {
        if (!field || typeof field.key !== "string" || !field.key || typeof field.label !== "string" || !field.label) {
          throw new Error("Every form field needs a key and visible label.");
        }
        if (!FIELD_TYPES.has(field.type)) throw new Error(`Form field ${field.key} has unsupported type ${String(field.type)}.`);
        if (!field.binding || typeof field.binding.file !== "string" || typeof field.binding.pointer !== "string") {
          throw new Error(`Form field ${field.key} needs a JSON binding.`);
        }
        pointerParts(field.binding.pointer);
        if ((field.help === undefined || field.help === null || helpText(field.help) === "") && field.helpOptional !== true) {
          throw new Error(`Form field ${field.key} needs help.`);
        }
        if (field.type === "enum" && !Array.isArray(field.options)) throw new Error(`Form field ${field.key} needs enum options.`);
        if (field.type === "choice" && (!Array.isArray(field.options) || field.options.some(option =>
          !plainObject(option) || typeof option.value !== "string" || typeof option.label !== "string"))) {
          throw new Error(`Form field ${field.key} needs choice options { value, label, tag? }.`);
        }
        if (field.type === "link" && (!plainObject(field.options) || typeof field.options.to !== "string" || !Array.isArray(field.options.ids))) {
          throw new Error(`Form field ${field.key} needs link options { to, many, ids, onCreate }.`);
        }
        if (field.type === "lines" && (!plainObject(field.options) || !Array.isArray(field.options.fields))) {
          throw new Error(`Form field ${field.key} needs lines options { fields }.`);
        }
        if (field.type === "reference" && (!plainObject(field.options)
          || field.options.allowFree !== false || !Array.isArray(field.options.candidates)
          || field.options.candidates.some(candidate => !plainObject(candidate)
            || typeof candidate.value !== "string" || typeof candidate.label !== "string"
            || typeof candidate.group !== "string"))) {
          throw new Error(`Form field ${field.key} needs reference options { candidates: [{ value, label, group }], allowFree: false }.`);
        }
      }

      const document = element.ownerDocument;
      const formId = `opengdd-form-${++nextFormId}`;
      const timers = new Set();
      const validationTimers = new Map();
      const renderers = [];
      let destroyed = false;
      let burst = 0;

      const labelFor = (field, action = "change") => field.labels?.[action] ?? labels[action];

      async function write(field, value, { action = "change", coalesce = true, remove = false, patch } = {}) {
        if (destroyed) return;
        if (typeof field.write === "function") {
          const staged = await field.write(value, { action, coalesce, remove, patch, label: labelFor(field, action) });
          await onChange?.({ field, file: field.binding.file, pointer: field.binding.pointer, value, staged });
          return;
        }
        const current = readBinding(packageService, field.binding);
        if (remove && !current.exists) return;
        const tx = edits.begin(labelFor(field, action), {
          coalesce: coalesce ? `${formId}/${field.binding.file}${field.binding.pointer}/${burst}` : undefined
        });
        const json = tx.json(field.binding.file);
        if (typeof patch === "function") patch(json, current);
        else if (remove) json.remove(field.binding.pointer);
        else if (current.exists) json.set(field.binding.pointer, value);
        else {
          const parts = pointerParts(field.binding.pointer);
          if (!parts.length) throw new Error("A form cannot replace a whole JSON document.");
          const key = parts.pop();
          json.insert(pointerFrom(parts), key, value);
        }
        const staged = await field.stageChange?.({ transaction: tx, current, value, remove });
        if (field.validateTransaction === true) {
          try { await validatePackage(tx); }
          catch (error) { tx.abort(); throw error; }
        }
        await tx.commit();
        await onChange?.({ field, file: field.binding.file, pointer: field.binding.pointer, value, staged });
      }

      function fieldChrome(parent, field, { cell = false, suffix = "", group = false } = {}) {
        const box = document.createElement(cell ? "div" : "section");
        box.className = cell ? "opengdd-author-form-cell" : "opengdd-author-form-field";
        box.dataset.formField = field.key;
        const id = `${formId}-${pointerSegment(field.key)}${suffix}`;
        let label;
        if (!cell) {
          label = document.createElement(group ? "p" : "label");
          if (group) label.id = `${id}-label`;
          else label.htmlFor = id;
          label.textContent = field.label;
          if (field.required) {
            const required = document.createElement("span");
            required.className = "opengdd-author-form-required";
            required.textContent = ` (${field.requiredLabel ?? copy.required})`;
            label.append(required);
          }
          box.append(label);
        }
        const help = document.createElement("p");
        help.className = "opengdd-author-form-help";
        help.id = `${id}-help`;
        help.textContent = helpText(field.help) ?? "";
        help.hidden = !help.textContent;
        if (cell && !help.hidden) help.classList.add("opengdd-author-visually-hidden");
        if (plainObject(field.help) && field.help.more) {
          const more = document.createElement("a");
          more.href = field.help.more;
          more.textContent = copy.more;
          help.append(" ", more);
        }
        const note = document.createElement("p");
        note.className = "opengdd-author-form-note";
        const noteText = typeof field.note === "string" ? field.note : "";
        renderBackticks(note, noteText);
        note.hidden = !noteText;
        const error = document.createElement("p");
        error.className = "opengdd-author-form-error";
        error.id = `${id}-error`;
        error.setAttribute("aria-live", "polite");
        error.hidden = true;
        const describedBy = [help.hidden ? "" : help.id, error.id].filter(Boolean).join(" ");
        const attach = control => {
          control.id = id;
          if (group) {
            control.setAttribute("role", "group");
            if (label) control.setAttribute("aria-labelledby", label.id);
            else control.setAttribute("aria-label", field.label);
          } else if (cell) control.setAttribute("aria-label", field.label);
          control.setAttribute("aria-describedby", describedBy);
          if (field.monospace) control.classList.add("opengdd-author-form-monospace");
          if (field.disabled) control.disabled = true;
          box.append(control, help, note, error);
          if (field.action) {
            const action = document.createElement("button");
            action.type = "button";
            action.textContent = field.action.label;
            if (field.action.ariaLabel) action.setAttribute("aria-label", field.action.ariaLabel);
            action.addEventListener("click", () => Promise.resolve(field.action.run(action))
              .catch(failure => setError(failure.message)));
            box.append(action);
          }
          parent.append(box);
          return control;
        };
        const setError = message => {
          error.textContent = message ?? "";
          error.hidden = !message;
          box.classList.toggle("opengdd-author-form-field--error", Boolean(message));
        };
        return { box, attach, setError, help, note, id, describedBy };
      }

      function validateLater(field, value, setError, immediate = false) {
        const run = () => {
          if (destroyed) return;
          let message = "";
          const empty = value === undefined || value === null || value === "" || Array.isArray(value) && value.length === 0;
          if (field.required && empty) message = field.requiredError ?? copy.requiredError;
          if (!message && typeof field.validate === "function") message = field.validate(value) ?? "";
          setError(message);
        };
        const pending = validationTimers.get(setError);
        if (pending) {
          clearTimeout(pending);
          timers.delete(pending);
          validationTimers.delete(setError);
        }
        if (immediate) { run(); return; }
        // A pause, rather than every key event, owns the delayed check.
        const timer = setTimeout(() => {
          timers.delete(timer);
          validationTimers.delete(setError);
          run();
        }, 400);
        timers.add(timer);
        validationTimers.set(setError, timer);
      }

      function scalarRenderer(parent, field, options = {}) {
        const chrome = fieldChrome(parent, field, options);
        const control = document.createElement(field.type === "longtext" || field.type === "list" ? "textarea" : "input");
        if (control.tagName?.toLowerCase() === "input") control.type = field.type === "number" || field.type === "integer" ? "number" : "text";
        if (field.type === "integer") control.step = "1";
        chrome.attach(control);
        let shownValue;
        const format = value => field.format ? field.format(value) : field.type === "list"
          ? Array.isArray(value) ? value.join("\n") : ""
          : value ?? "";
        const parse = source => {
          if (field.parse) return field.parse(source);
          if (field.type === "list") return source === "" ? [] : source.split(/\r?\n/);
          if (field.type === "number" || field.type === "integer") {
            if (source === "") return undefined;
            const number = Number(source);
            if (!Number.isFinite(number)) throw new Error("Enter a finite number.");
            if (field.type === "integer" && !Number.isInteger(number)) throw new Error("Enter a whole number without decimals.");
            return number;
          }
          return source;
        };
        const refresh = () => {
          const current = readBinding(packageService, field.binding);
          shownValue = current.value;
          if (document.activeElement !== control) control.value = format(current.value);
          validateLater(field, current.value, chrome.setError, true);
          if (typeof field.status === "function") {
            chrome.note.textContent = field.status(current.value) ?? "";
            chrome.note.hidden = !chrome.note.textContent;
          }
        };
        const change = async (immediateValidation = false) => {
          let value;
          try { value = parse(control.value); }
          catch (error) {
            validateLater({ ...field, validate: () => error.message }, control.value, chrome.setError, immediateValidation);
            return;
          }
          shownValue = value;
          validateLater(field, value, chrome.setError, immediateValidation);
          if (!field.required && field.clearRemoves === true
            && (value === "" || Array.isArray(value) && value.length === 0)) {
            const current = readBinding(packageService, field.binding);
            if (current.exists) await write(field, undefined, { action: "clear", remove: true });
            return;
          }
          if (value === undefined) {
            const current = readBinding(packageService, field.binding);
            if (!field.required && field.clearRemoves === true && current.exists) {
              await write(field, undefined, { action: "clear", remove: true });
            }
            return;
          }
          await write(field, value);
        };
        control.addEventListener("input", () => field.commitOnBlur
          ? validateLater(field, control.value, chrome.setError)
          : change().catch(error => chrome.setError(error.message)));
        control.addEventListener("blur", () => {
          burst += 1;
          if (field.commitOnBlur) return change(true).catch(error => chrome.setError(error.message));
          validateLater(field, shownValue, chrome.setError, true);
        });
        refresh();
        return { refresh };
      }

      function booleanRenderer(parent, field, options = {}) {
        const chrome = fieldChrome(parent, field, options);
        const control = document.createElement("input");
        control.type = "checkbox";
        chrome.attach(control);
        const refresh = () => { control.checked = readBinding(packageService, field.binding).value === true; chrome.setError(""); };
        control.addEventListener("change", () => write(field, Boolean(control.checked)).catch(error => chrome.setError(error.message)));
        control.addEventListener("blur", () => { burst += 1; });
        refresh();
        return { refresh };
      }

      function enumRenderer(parent, field, options = {}) {
        const chrome = fieldChrome(parent, field, { ...options, group: true });
        const holder = document.createElement("div");
        holder.className = "opengdd-author-form-enum";
        chrome.attach(holder);
        let current;
        const commit = value => {
          if (value === null && field.required) { chrome.setError(field.requiredError ?? copy.requiredError); return; }
          const remove = value === null;
          return write(field, value, { action: remove ? "clear" : "change", remove })
            .then(refresh).catch(error => chrome.setError(error.message));
        };
        const refresh = () => {
          current = readBinding(packageService, field.binding).value;
          holder.replaceChildren();
          if (field.options.length > 6) {
            const select = document.createElement("select");
            select.setAttribute("aria-label", field.label);
            select.setAttribute("aria-describedby", chrome.describedBy);
            select.disabled = field.disabled === true;
            const empty = document.createElement("option");
            empty.value = "";
            empty.textContent = "";
            select.append(empty);
            for (const value of field.options) {
              const option = document.createElement("option");
              option.value = value;
              option.textContent = value;
              select.append(option);
            }
            select.value = typeof current === "string" ? current : "";
            select.addEventListener("change", () => commit(select.value || null));
            holder.append(select);
          } else {
            for (const value of field.options) {
              const button = document.createElement("button");
              button.type = "button";
              button.textContent = value;
              button.setAttribute("aria-pressed", String(current === value));
              button.setAttribute("aria-describedby", chrome.describedBy);
              button.disabled = field.disabled === true;
              if (current === value) button.classList.add("opengdd-author-form-enum--chosen");
              button.addEventListener("click", () => commit(current === value ? null : value));
              holder.append(button);
            }
          }
          validateLater(field, current, chrome.setError, true);
        };
        refresh();
        return { refresh };
      }

      // Contracts make the full meaning the choice. This renderer retains the
      // enum write path while allowing tall sentences and an optional visible
      // guidance tag; it never falls back to a select or truncates a label.
      function choiceRenderer(parent, field, options = {}) {
        const chrome = fieldChrome(parent, field, { ...options, group: true });
        const holder = document.createElement("div");
        holder.className = "opengdd-author-form-choice";
        chrome.attach(holder);
        let current;
        const commit = value => {
          const remove = value === null;
          return write(field, value, { action: remove ? "clear" : "change", remove })
            .then(refresh).catch(error => chrome.setError(error.message));
        };
        const refresh = () => {
          current = readBinding(packageService, field.binding).value;
          holder.replaceChildren();
          for (const option of field.options) {
            const button = document.createElement("button");
            button.type = "button";
            const chosen = field.showSelection !== false && current === option.value;
            button.setAttribute("aria-pressed", String(chosen));
            button.setAttribute("aria-describedby", chrome.describedBy);
            button.disabled = field.disabled === true;
            button.dataset.choice = option.value;
            if (chosen) {
              button.classList.add("opengdd-author-form-choice--chosen");
              const check = document.createElement("span");
              check.setAttribute("aria-hidden", "true");
              check.textContent = "✓ ";
              button.append(check);
            }
            const sentence = document.createElement("span");
            sentence.textContent = option.label;
            button.append(sentence);
            if (option.tag) {
              const tag = document.createElement("small");
              tag.textContent = option.tag;
              tag.dataset.choiceTag = "";
              button.append(" ", tag);
            }
            button.addEventListener("click", () => commit(current === option.value ? null : option.value));
            holder.append(button);
          }
          validateLater(field, current, chrome.setError, true);
        };
        refresh();
        return { refresh };
      }

      function linkOptions(select, field, currentValue, availableIds = field.options.ids) {
        const { to, onCreate } = field.options;
        const ids = availableIds;
        const values = [...ids];
        if (typeof currentValue === "string" && currentValue && !values.includes(currentValue)) values.unshift(currentValue);
        if (!field.required && field.options.many !== true) {
          const empty = document.createElement("option");
          empty.value = "";
          empty.textContent = field.copy?.linkNone ?? "none";
          select.append(empty);
        } else if (field.options.many === true) {
          const empty = document.createElement("option");
          empty.value = "";
          empty.textContent = field.copy?.add ?? "Add";
          select.append(empty);
        }
        for (const id of values) {
          const option = document.createElement("option");
          option.value = id;
          option.textContent = id;
          select.append(option);
        }
        if (typeof onCreate === "function") {
          const create = document.createElement("option");
          create.value = "__opengdd_create__";
          create.textContent = field.copy?.linkCreate?.(to) ?? `Add a record to ${to}…`;
          select.append(create);
        }
      }

      function stageValue(json, binding, state, value) {
        if (state.exists) json.set(binding.pointer, value);
        else {
          const parts = pointerParts(binding.pointer);
          const key = parts.pop();
          json.insert(pointerFrom(parts), key, value);
        }
      }

      function stageMirror(jsonFor, mirror, id, action) {
        const file = typeof mirror.file === "function" ? mirror.file(id) : mirror.file;
        const pointer = typeof mirror.pointer === "function" ? mirror.pointer(id) : mirror.pointer;
        if (typeof file !== "string" || typeof pointer !== "string") throw new Error("A mirrored link needs a far file and pointer.");
        if (packageService.read(file) === undefined) {
          if (action === "remove") return;
          throw new Error(`The mirror record ${file} does not exist.`);
        }
        const state = readBinding(packageService, { file, pointer });
        const json = jsonFor(file);
        if (action === "add") {
          if (mirror.many) {
            if (Array.isArray(state.value)) {
              if (!state.value.includes(mirror.ownId)) json.insert(pointer, "-", mirror.ownId);
            } else stageValue(json, { pointer }, state, [mirror.ownId]);
          } else if (state.value !== mirror.ownId) stageValue(json, { pointer }, state, mirror.ownId);
          return;
        }
        if (mirror.many) {
          if (!Array.isArray(state.value)) return;
          const indices = state.value.flatMap((value, index) => value === mirror.ownId ? [index] : []).reverse();
          for (const index of indices) json.remove(childPointer(pointer, index));
        } else if (state.exists && state.value === mirror.ownId) json.set(pointer, null);
      }

      async function writeLink(field, value) {
        if (typeof field.write === "function") {
          try {
            const staged = await field.write(value, { action: "change", coalesce: false, remove: value === null, label: labelFor(field) });
            await onChange?.({ field, file: field.binding.file, pointer: field.binding.pointer, value, staged });
            return;
          } catch (error) {
            throw new Error(field.copy?.linkRefused?.(error.message) ?? error.message);
          }
        }
        const current = readBinding(packageService, field.binding);
        const currentIds = field.options.many && Array.isArray(current.value)
          ? current.value.filter(id => typeof id === "string")
          : typeof current.value === "string" && current.value ? [current.value] : [];
        const nextIds = field.options.many && Array.isArray(value)
          ? value.filter(id => typeof id === "string")
          : typeof value === "string" && value ? [value] : [];
        const tx = edits.begin(labelFor(field), { coalesce: undefined });
        const json = tx.json(field.binding.file);
        if (field.options.many) {
          const appended = Array.isArray(current.value) && value.length === current.value.length + 1
            && current.value.every((item, index) => item === value[index]);
          let removedAt = -1;
          if (Array.isArray(current.value) && value.length === current.value.length - 1) {
            removedAt = value.findIndex((item, index) => item !== current.value[index]);
            if (removedAt < 0) removedAt = value.length;
          }
          if (appended) json.insert(field.binding.pointer, "-", value.at(-1));
          else if (removedAt >= 0) json.remove(childPointer(field.binding.pointer, removedAt));
          else if (Array.isArray(current.value) && value.length === 0) {
            for (let index = current.value.length - 1; index >= 0; index -= 1) json.remove(childPointer(field.binding.pointer, index));
          } else stageValue(json, field.binding, current, value);
        } else stageValue(json, field.binding, current, value);

        if (field.options.mirror) {
          const jsonByFile = new Map([[field.binding.file, json]]);
          const jsonFor = file => {
            if (!jsonByFile.has(file)) jsonByFile.set(file, tx.json(file));
            return jsonByFile.get(file);
          };
          const before = new Set(currentIds);
          const after = new Set(nextIds);
          for (const id of before) if (!after.has(id)) stageMirror(jsonFor, field.options.mirror, id, "remove");
          for (const id of after) if (!before.has(id)) stageMirror(jsonFor, field.options.mirror, id, "add");
        }
        const staged = await field.stageChange?.({ transaction: tx, current, value, remove: value === null });
        try { await validatePackage(tx); }
        catch (error) {
          tx.abort();
          throw new Error(field.copy?.linkRefused?.(error.message) ?? error.message);
        }
        await tx.commit();
        await onChange?.({ field, file: field.binding.file, pointer: field.binding.pointer, value, staged });
      }

      function linkRenderer(parent, field, options = {}) {
        const chrome = fieldChrome(parent, field, options);
        const holder = document.createElement("div");
        holder.className = "opengdd-author-form-link";
        chrome.attach(holder);
        holder.id = "";
        const knownIds = [...field.options.ids];
        const dangling = value => typeof value === "string" && value && !knownIds.includes(value)
          ? (field.copy?.linkDangling ?? copy.linkDangling)(value, field.options.to)
          : "";
        const refresh = () => {
          const state = readBinding(packageService, field.binding);
          const value = state.value;
          holder.replaceChildren();
          if (field.options.many === true) {
            const values = Array.isArray(value) ? value : [];
            const errors = [];
            for (const [index, id] of values.entries()) {
              const row = document.createElement("div");
              row.className = "opengdd-author-form-link-row";
              const code = document.createElement("code");
              code.textContent = typeof id === "string" ? id : JSON.stringify(id);
              const remove = document.createElement("button");
              remove.type = "button";
              remove.textContent = field.copy?.remove ?? "Remove";
              remove.setAttribute("aria-label", field.copy?.removeLink?.(id) ?? `${field.copy?.remove ?? "Remove"} ${id}`);
              remove.disabled = field.disabled === true;
              remove.addEventListener("click", () => writeLink(field, values.filter((_, at) => at !== index))
                .then(refresh).catch(error => chrome.setError(error.message)));
              row.append(code, remove);
              holder.append(row);
              const message = dangling(id);
              if (message) errors.push(message);
            }
            const select = document.createElement("select");
            select.id = chrome.id;
            select.setAttribute("aria-describedby", chrome.describedBy);
            select.disabled = field.disabled === true;
            linkOptions(select, field, undefined, knownIds.filter(id => !values.includes(id)));
            select.value = "";
            select.addEventListener("change", async () => {
              let id = select.value;
              if (id === "__opengdd_create__") id = await field.options.onCreate?.(select);
              if (typeof id === "string" && id) {
                if (!knownIds.includes(id)) knownIds.push(id);
                try { await writeLink(field, [...values, id]); }
                catch (error) { chrome.setError(error.message); return; }
              }
              refresh();
            });
            holder.append(select);
            chrome.setError(errors.join(" "));
          } else {
            const select = document.createElement("select");
            select.id = chrome.id;
            select.setAttribute("aria-label", field.label);
            select.setAttribute("aria-describedby", chrome.describedBy);
            select.disabled = field.disabled === true;
            linkOptions(select, field, value, knownIds);
            select.value = typeof value === "string" ? value : "";
            select.addEventListener("change", async () => {
              let id = select.value;
              if (id === "__opengdd_create__") id = await field.options.onCreate?.(select);
              if (typeof id === "string" && id) {
                if (!knownIds.includes(id)) knownIds.push(id);
                try { await writeLink(field, id); }
                catch (error) { chrome.setError(error.message); return; }
              }
              else if (!field.required && state.exists) {
                try { await writeLink(field, null); }
                catch (error) { chrome.setError(error.message); return; }
              }
              refresh();
            });
            holder.append(select);
            chrome.setError(dangling(value));
          }
        };
        refresh();
        return { refresh };
      }

      function referenceRenderer(parent, field, options = {}) {
        const chrome = fieldChrome(parent, field, options);
        const select = document.createElement("select");
        chrome.attach(select);
        const known = new Set(field.options.candidates.map(candidate => candidate.value));
        const refresh = () => {
          const state = readBinding(packageService, field.binding);
          const current = typeof state.value === "string" ? state.value : "";
          select.replaceChildren();
          if (!field.required || !current) {
            const empty = document.createElement("option");
            empty.value = "";
            empty.textContent = "";
            if (field.required) {
              empty.disabled = true;
              empty.selected = true;
            }
            select.append(empty);
          }
          if (current && !known.has(current)) {
            const unknown = document.createElement("option");
            unknown.value = current;
            unknown.textContent = current;
            unknown.dataset.nonCandidate = "";
            select.append(unknown);
          }
          const groups = new Map();
          for (const candidate of field.options.candidates) {
            let group = groups.get(candidate.group);
            if (!group) {
              group = document.createElement("optgroup");
              group.label = candidate.group;
              groups.set(candidate.group, group);
              select.append(group);
            }
            const option = document.createElement("option");
            option.value = candidate.value;
            option.textContent = candidate.label;
            group.append(option);
          }
          select.value = current;
          validateLater(field, state.value, chrome.setError, true);
          select.setAttribute("aria-invalid", String(Boolean(chrome.box.classList.contains("opengdd-author-form-field--error"))));
        };
        select.addEventListener("change", async () => {
          const value = select.value;
          if (!value && field.required) {
            validateLater(field, undefined, chrome.setError, true);
            return;
          }
          try {
            await write(field, value || undefined, {
              action: value ? "change" : "clear", coalesce: false, remove: !value
            });
            refresh();
          } catch (error) { chrome.setError(error.message); }
        });
        refresh();
        return { refresh };
      }

      function linesRenderer(parent, field, options = {}) {
        const chrome = fieldChrome(parent, field, options);
        const holder = document.createElement("div");
        holder.className = "opengdd-author-form-lines";
        chrome.attach(holder);
        holder.id = "";
        const refresh = (force = false) => {
          if (!force && holder.contains?.(document.activeElement)) return;
          const current = readBinding(packageService, field.binding).value;
          const rows = Array.isArray(current) ? current : [];
          holder.replaceChildren();
          const table = document.createElement("table");
          const head = document.createElement("thead");
          const headingRow = document.createElement("tr");
          for (const nested of field.options.fields) {
            const heading = document.createElement("th");
            heading.scope = "col";
            heading.textContent = nested.label;
            headingRow.append(heading);
          }
          const actionHeading = document.createElement("th");
          actionHeading.scope = "col";
          actionHeading.textContent = "";
          headingRow.append(actionHeading);
          head.append(headingRow);
          const body = document.createElement("tbody");
          for (const [index] of rows.entries()) {
            const row = document.createElement("tr");
            for (const nested of field.options.fields) {
              const cell = document.createElement("td");
              if (nested.type === "lines") {
                const sentence = document.createElement("p");
                sentence.className = "opengdd-author-form-note";
                sentence.textContent = field.copy?.nestedTooDeep ?? "This field nests deeper than the form can show. Open it as text.";
                cell.append(sentence);
              } else {
                const nestedField = {
                  ...nested,
                  binding: { file: field.binding.file, pointer: childPointer(field.binding.pointer, index, nested.key) },
                  disabled: field.disabled === true || nested.disabled === true,
                  copy: nested.copy ?? field.copy
                };
                renderField(cell, nestedField, { cell: true, suffix: `-${index}`, track: false });
              }
              row.append(cell);
            }
            const action = document.createElement("td");
            const remove = document.createElement("button");
            remove.type = "button";
            remove.textContent = field.copy?.remove ?? "Remove";
            remove.disabled = field.disabled === true;
            remove.addEventListener("click", () => write(field, undefined, {
              action: "removeLine", coalesce: false,
              patch: json => json.remove(childPointer(field.binding.pointer, index))
            })
              .then(() => refresh(true)).catch(error => chrome.setError(error.message)));
            action.append(remove);
            row.append(action);
            body.append(row);
          }
          table.append(head, body);
          const add = document.createElement("button");
          add.type = "button";
          add.id = chrome.id;
          add.textContent = field.copy?.addLine ?? copy.addLine;
          add.setAttribute("aria-describedby", chrome.describedBy);
          add.disabled = field.disabled === true;
          add.addEventListener("click", () => {
            const value = defaultLineValue(field.options.fields);
            return write(field, value, {
              action: "addLine", coalesce: false,
              // A record that does not carry the list yet gets the key with
              // its first line; appending to a missing array is a pointer error.
              patch: (json, current) => Array.isArray(current.value)
                ? json.insert(field.binding.pointer, "-", value)
                : stageValue(json, field.binding, current, [value])
            }).then(() => refresh(true)).catch(error => chrome.setError(error.message));
          });
          holder.append(table, add);
          validateLater(field, current, chrome.setError, true);
        };
        refresh();
        return { refresh };
      }

      function renderField(parent, field, options = {}) {
        let renderer;
        if (["text", "longtext", "number", "integer", "list"].includes(field.type)) renderer = scalarRenderer(parent, field, options);
        else if (field.type === "boolean") renderer = booleanRenderer(parent, field, options);
        else if (field.type === "enum") renderer = enumRenderer(parent, field, options);
        else if (field.type === "choice") renderer = choiceRenderer(parent, field, options);
        else if (field.type === "link") renderer = linkRenderer(parent, field, options);
        else if (field.type === "reference") renderer = referenceRenderer(parent, field, options);
        else renderer = linesRenderer(parent, field, options);
        if (options.track !== false) renderers.push(renderer);
        return renderer;
      }

      const root = document.createElement("div");
      root.className = "opengdd-author-form";
      for (const field of fields) renderField(root, field);
      element.replaceChildren(root);

      return Object.freeze({
        destroy() {
          if (destroyed) return;
          destroyed = true;
          for (const timer of timers) clearTimeout(timer);
          timers.clear();
          validationTimers.clear();
          element.replaceChildren();
        },
        refresh() {
          if (destroyed) return;
          for (const renderer of renderers) renderer.refresh();
        }
      });
    }
  });
}
