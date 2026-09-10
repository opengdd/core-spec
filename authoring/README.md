# OpenGDD authoring component

Source: <https://github.com/opengdd/core-spec/tree/main/authoring>. Licensed
under the [MIT licence](LICENSE). Tool v0.5 is versioned independently of the
OpenGDD format and supports packages that declare OpenGDD 0.8. Problems and
suggestions go to [GitHub Discussions](https://github.com/opengdd/core-spec/discussions);
the published tool's "Report a problem" link opens one with the tool version
filled in. Pull requests are welcome; see [CONTRIBUTING](../CONTRIBUTING.md).

## Published and development hosts

There is one published authoring host. `/authoring-tool/` on the OpenGDD site
mounts `src/workbench/shell.mjs` across the window below the site's top bar.
The site supplies static schemas, listed packages,
contract deep links, and its own theme state to that shell. The published page
passes no reader URL, so the Prose header shows no reader link there;
`serve.mjs` keeps its `/read/` route.

The check scripts under `scripts/` and the development server live in the steward's repository, not in this published source tree; `workbench.html` loads only through that server.

`node authoring/scripts/serve.mjs` serves the same shell for local development.
Its `/file/`, `/api/authoring/package`, and `/read/` routes are the shell's
defaults, so `workbench.html` needs no host configuration. The bare component
embed remains a compatibility and test surface; it is not a second published
authoring tool.

`mountWorkbenchShell(target, options)` is the full-window host entry point.
Omitting its data options keeps the local development routes. `showTheme`
defaults to `true`; the site passes `false` because its top-bar theme toggle
owns the published page.

## Embed in another site

The generated minimal host page (`/authoring-tool/embed.html` on the site,
`docs/authoring-tool/embed.html` in the public repository) is executable
documentation. It lists its own **Harbour Lights** package through
`listPackages`, opens it through `loadPackage`, and uses the same generated
asset paths and import map as the published host.

Copy these files while preserving their relative layout under one public URL
such as `/authoring-tool/`:

- `authoring/authoring.css`;
- all of `authoring/src/`;
- all of `authoring/panels/` if using the bundled panels;
- `lang-tools/src/analysis.mjs` as `lib/lang/tools/src/analysis.mjs`;
- `conformance/package-syntax.mjs`, `file-map-host.mjs`, `migrate.mjs`, and
  `validate-core.mjs` under `lib/opengdd/conformance/`.

Serve the seven schemas named under Mount options from URLs your `schemas`
loader controls. Load both stylesheets, in this order:

```html
<link rel="stylesheet" href="/authoring-tool/authoring.css">
<link rel="stylesheet" href="/authoring-tool/src/workbench/workbench.css">
```

The required import map is generated into `/authoring-tool/embed.html` by the
site build; copy that map rather than maintaining a second set of paths. Its six names resolve
the analysis, syntax, file-map, migration, validation, and authoring-version
modules in the built layout. Then import `mountWorkbenchShell` and the panels,
and mount into an element with a bounded width and height.

The shell accepts `panels`, `preparedConventionsUrl`, `schemas`, `packages`,
`listPackages`, `loadPackage`, `defaultPackageId`, `readerUrl`,
`initialContract`, `contractsCatalogueUrl`, `links`, and `showTheme`. `examples` remains
an alias for `packages` for one release and logs a deprecation warning. Unknown
options also warn. `packages` is a static list; `listPackages()` is its dynamic
equivalent and takes precedence. Supply `loadPackage(id)` with either. The
shell consumes `packages`, `preparedConventionsUrl`, `links`, and `showTheme` itself and
forwards the component-facing subset: `panels`, `schemas`, `listPackages`,
`loadPackage`, `defaultPackageId`, `readerUrl`, `initialContract`, and
`contractsCatalogueUrl`.

Set `readerUrl: null` when the host has no reading route. Set
`contractsCatalogueUrl` to the page designers should use to find contract
definitions, or omit it to hide that link. `preparedConventionsUrl` is the
shell's optional link to host-maintained prepared mechanics. `links` is a
list of `{ href, label }` pairs shown in the status strip after the version;
the published tool uses it for the source and the Get started guide. With
`showTheme: false`, the shell reads light/dark classes from its ancestors and
does not write classes, data attributes, `color-scheme`, custom properties, or
any other state on `document.documentElement`.

Load `authoring.css`, provide the six import-map names shown in `workbench.html`, then mount the single JavaScript entry:

```js
import { mountAuthoringTool } from "/authoring-tool/src/tool.mjs";

const tool = mountAuthoringTool(document.querySelector("#author-root"), host);
// Later:
tool.destroy();
```

The root must be an `Element` belonging to the same window that imported the module: browser storage and archive reading use that window's APIs, so mounting into another frame's document is not supported.

Package analysis, conformance validation, and migration preview run in `src/worker.mjs`, a module worker the tool starts beside `tool.mjs`, so that none stands in front of a keystroke. Serve `src/` whole, and — since a worker gets no import map — keep the six import-map names resolvable from the page, which is where the worker's four module URLs come from. The `opengdd-migrate` name keeps the exact CLI migration library available to both the worker and its on-page fallback. A host whose `Content-Security-Policy` names `worker-src` or `child-src` must include `'self'`. Where a worker cannot start, everything runs on the page's own thread instead: same results, slower on large packages.

`destroy()` cancels validation, analysis, and save timers; removes every instance listener; clears the root; and leaves other mounted instances untouched. `openPackage(package)` replaces that instance's working package.

A package has `id`, `title`, an optional `Set` named `folders`, and its files in either form: a `Map` named `files` whose values are strings or binary `Uint8Array`s (the internal shape), or an array of `{path, text}` / `{path, base64}` entries (the wire shape a `loadPackage` host may return).

## Mount options

All options are optional. Checking remains unavailable until `schemas` supplies the six required files named below. There are six required, one optional for migration: the loader also requests `clocks.schema.json` when the host offers it, and without that optional schema the tool directs the designer to `npx opengdd migrate` instead of offering an unchecked browser migration. A host may pass additional schema keys; the tool tolerates them. The validator checks `clocks.json` in code; only the migration preview reads `clocks.schema.json` before it offers any clock rewrite.

| Member | Contract |
|---|---|
| `regions` | Host-owned placement elements shaped as `{explorer, prose, status, outline?, context?, inspector?, validation?, undo?, proseHeader?, outlineHeader?}`. Regions decide placement only; policy is declared separately through `capabilities`. Header regions let a host compose live component metadata and actions into its own panel header. |
| `capabilities` | Named host policy flags shaped as `{protectedFiles?, workbenchLabels?, hostUndo?, delete?, coldStart?}`. When `regions` is supplied and this option is absent, all five default to `true` for compatibility with existing regional hosts. When an object is supplied, omitted flags default to `false`. Without either regions or explicit capabilities, all five are `false`, preserving the ordinary widget. Unknown members and non-boolean values are rejected. |
| `panels` | An array of revision-1 panel descriptor default exports, or an async function returning one. Descriptors register in order; a rejected descriptor is reported and skipped without preventing the remaining panels from mounting. Revision 0 is not accepted. |
| `outlineFolds` | Optional outline fold-state host shaped as `{collapsed(), setCollapsed(ids)}`. It stores mechanism and Tuning-branch fold ids. The workbench keeps one global set in its existing layout record; the ordinary widget omits the hook, so folds last only for the mount. `outlineCollections` with the same shape is still accepted for one release as a compatibility alias, but new hosts should use `outlineFolds`. |
| `contractsCatalogueUrl` | Link shown under Add a contract when the designer needs a definition. No default: while unset, the dialog shows no catalogue link. The published site passes `/contracts/`; the development workbench passes nothing. |
| `initialContract()` | Async function returning `{definitionText, packText?}` when the host arrived with a contract already chosen (a catalogue deep link), or a falsy value for none. After the initial package opens, the tool opens Add a contract with that source loaded; the designer still names the copy and confirms. `packText` carries the pack file's exact bytes as a `Uint8Array` so its hash can be checked. A source that is not a contract is reported and nothing opens. |
| `preparedStartingPoints` | Optional array of trusted host adapters for prepared mechanics. Adds a guided review entry and reconnects it from the contract inspector. Not a revision-1 extension service or contract-format field. The earlier `experimentalStartingPoints` name remains a compatibility fallback; the maintained name takes precedence. |
| `schemas` | Schema object/`Map`, or an async function returning one, keyed by the six required names: `manifest.schema.json`, `tuning.schema.json`, `personalization.schema.json`, `collection.schema.json`, `direction.schema.json`, and `opengdd-build.schema.json`. `clocks.schema.json` is optional for checking and required only for migration preview. Additional keys are accepted and unused. Failed required loads may be retried. |
| `defaultPackageId` | Optional id of the built-in package selected on mount. Defaults to the first item returned by `listPackages()`. |
| `listPackages()` | Returns built-in choices shaped as `{id, title, revision?}`. A stable content revision lets the tool flag local drafts based on an older example. These appear alongside browser drafts in the one package selector. |
| `loadPackage(id)` | Returns a built-in package for the selected id. Provide it with `listPackages`. |
| `readerUrl(packagePath, file)` | Returns the host's reader URL for an unchanged repository Markdown file. |
| `downloadPackage({name, bytes, type})` | Receives an exported ZIP. Omit it to use the browser's normal file download. |

### Prepared starting points

The prepared starting-point adapter carries `name`, `title`, `lead`,
`definitionText` (a complete prepared adoption), exact `packText` bytes and
`tuning` defaults. `settings` is an array, or a function of the draft adoption
and optional ordinary `contentRows`,
returning an array, of `{id, label, unit, parts, defaultKey?, defaultValue?, when?}`. `parts`
locates a tuning citation in that adoption; `id` stays stable when an editable
item changes position. Optional `reviewQuestions` limits the displayed question
ids; conditional liveness still determines which answers apply. Missing
conditional answers receive prepared defaults in the draft. Inactive answers
and bindings are omitted when saving, while ordinary tuning sources remain.
`defaultKey` can seed an ordinary source name when a conditional setting has
no binding in either the saved adoption or prepared source. It does not replace
an existing binding; the designer can still link or name a different value.

Optional `questionCopy` supplies game-specific wording keyed by question id:
`{asks?, rationale?, options?: {optionId: meaning}}`. Only nonblank strings
replace displayed wording. Original option identities, liveness, semantic
fields and saved definition bytes are unchanged; extra option keys are ignored.
Both the private reading page and guided review use the same projection.
This is trusted host presentation, never instructions from imported data.

An optional `list` projects one row list into editable cards. It supplies
`{key, title, lead, item, fields, makeRow(rows, name, files)}`. A field has
`{key, label, multiline?, content?}`. `content: true` edits ordinary chapter
prose supplied by `readContent(files, adoption, name)`, keyed by
`rowId-fieldKey`, while the row stores its citation. New identity allocation
must consider retained tuning sources and chapter sections as well as current
rows. Removing a row does not imply removing its ordinary content.

Optional `contentLists` presents several ordinary chapter lists without adding
fields to the contract definition. Each list has the same metadata and row
factory as `list`. `readRows(files, adoption, name)` returns an object of arrays
keyed by list name. The draft keeps those arrays in `contentRows`; a numeric
setting with parts `['contentRows', listKey, rowIndex, field]` binds a number
there instead of inside the adoption. `preparedSettingValue` resolves either
kind of path. Support writes the chapter content and may derive the existing
contract's allowed rows from it. Auxiliary editor rows never enter the saved
adoption by themselves.

A content-list field may provide `choices(draft)`, returning `{value, label}`
pairs for a native selector. Labels can follow another list's names while
values retain stable identities. A missing selected target stays visible until
the designer resolves it; the editor never selects a replacement implicitly.
The trusted adapter must validate destinations and complete content before
saving. Ordinary document validation does not infer those game rules.

Optional trusted host functions `summary(adoption, tuning, content, files, contentRows)` and
`support({files, adoption, previous, tuning, name, content, contentRows})` supply reading
text and reconcile game-local companion data. Support may return
`{append: [{file, text}], replace: [{file, before, text}]}` for ordinary chapter
changes. Replacements require the exact prior bytes and participate in the
same guarded transaction as the adoption and tuning. These functions are
local host code, never evaluated from an imported package.

The summary receives the same reviewed file snapshot so it can resolve
ordinary local-rule citations after a tuning rename. It must not mutate that
snapshot; the adoption and tuning arguments describe the staged result.

Optional `playablePreview({files, adoptionFile, package, revision, isCurrent})`
opens a saved adoption through trusted host code. `files` is a detached `Map`
of strings or copied `Uint8Array` contents; `package` contains `id` and `title`.
The hook receives no write service. `isCurrent()` observes the launching
editor's revision, pending prose buffer and unsaved prepared-form changes.
Check it again after asynchronous validation and before handing off the files.
The action appears beside an existing adoption and after save; new adoptions
and changed forms must be saved first. Rejections are displayed beside the
action. The host owns validation, destination, transport and cleanup. The local
squad, checkpoint, camera, poison and backpack previews use a bounded one-way snapshot
and a fresh model per launch. This hook is not a public extension API or a
contract-format field.

Optional `matches(adoption, files)` distinguishes supplied conventions that
share a family and version, such as jump and reload. Matching checks the family
and version first, then this trusted host predicate. Both the launcher and
contract inspector use it. The trial recognizes the cited ordinary setup
section; no new identity field is added to the format. Matching offers the
appropriate editor; the save guard still verifies the complete definition,
local rules and current file revision before writing.

The maintained adapters live under
`conventions/ui/`: stamina supplies a
prepared action list, placement an editable tower list with ordinary effect
sections, jump and reload shared assistance with conditional questions, and
backpack an editable item list. Each is limited to its supplied behavior. A changed definition or local
rules requires review. This is trusted host configuration, not a general
catalogue extension API. Opening the guide stages
changes locally; Save validates and commits contract, tuning, companion rules,
chapter additions and pack together. Cancel writes nothing. Source changes
retain old tuning values and remind the designer to review existing prose and
game-specific rules. The ordinary definition-oriented Add workflow is unchanged.

### Capabilities

Capabilities are host-facing statements of policy, not a workbench-mode switch.

| Member | Policy when `true` | Default with `regions` and no `capabilities` | Default otherwise |
|---|---|---|---|
| `protectedFiles` | Protects `manifest.json`, `tuning.json`, `01-overview.md`, `02-mechanics.md`, `03-content.md`, `04-presentation.md`, `05-build-plan.md`, `direction.json`, `personalization.json`, and `clocks.json` from rename, move, and drag. Delete remains disabled for the kernel and numbered chapter files; deleting one of the three optional mechanism files remains available after a confirmation that names what it switches off. | `true` | `false` |
| `workbenchLabels` | Uses the workbench explorer, validation, diagnostic, and status label set. | `true` | `false` |
| `hostUndo` | Shows the undo control in a supplied `undo` region, or in the standalone toolbar without regions, and routes mount-scoped undo/redo keys and editor history input through package history. | `true` | `false` |
| `delete` | Adds the explorer delete affordance and its Delete-key action. | `true` | `false` |
| `coldStart` | Starts regional package discovery from the newest browser draft and, when no draft exists, opens the example (`defaultPackageId` or the first built-in). The minimal-template and example choices appear only when the example cannot be listed or loaded; the package selector then shows a placeholder rather than an unopened package. | `true` | `false` |

### Regions

Supplying regions relocates component-owned surfaces into host-owned elements. Each supplied element must be distinct and may be owned by only one live authoring instance.

| Member | Requirement | Placement |
|---|---|---|
| `explorer` | Required when `regions` is present. | Package-file explorer. |
| `prose` | Required when `regions` is present. | Editor; also receives the cold-start surface when enabled. |
| `status` | Required when `regions` is present. | Package status. |
| `outline` | Optional. | Outline navigation. |
| `context` | Optional. | Companion-panel placement beneath the explorer when `inspector` is also supplied. When `inspector` is omitted, this remains the compatibility placement for the inspector. |
| `inspector` | Optional. | Receives the extension-API inspector surface. |
| `validation` | Optional. | Stable validation surface. When omitted, validation remains below the editor in `prose` for compatibility. |
| `undo` | Optional. | Undo history when `hostUndo` is enabled. |
| `proseHeader` | Optional. | Live file path, reader link, and editor mode for composition into the host's Prose header. When omitted, this information stays above the editor. |
| `outlineHeader` | Optional. | Outline create and filtering controls for composition into the host's Outline header. When omitted, the controls stay above the outline. |

### Workbench inspector

The workbench places the inspector in a resizable band under the prose and Validation in a fixed-height panel beneath the inspector. The inspector body defaults to two fifths of the height left after Validation, with a 14rem floor; the band's total height adds its measured header, while the editor keeps an 8rem floor. When those floors no longer fit, the same inspector Element moves into a full-column sheet. The widget host keeps its anchored inspector drawer.

Validation keeps the last completed findings visible while a new check runs. Its body is only replaced when the rendered findings actually change, so typing does not collapse the list, reset its scroll, or resize the editor. Findings form one compact list without error/warning subheadings; each row keeps its message and location on one line, with only the `ERROR` or `WARNING` keyword carrying the red or amber severity colour. JSON syntax errors come before other errors, carry a source line when it can be identified, and suspend findings that depend on reading that malformed document. Collapsing Validation reduces it to its summary row; it also uses that compact form automatically while the short-window Inspector sheet is active.

For an OpenGDD 0.6 package, the workbench shows a conditional Migration companion beneath Notes instead of inserting the flow into Validation. Its actions remain above the companion's scrolling preview, and the companion disappears again for a current package. Regional compatibility hosts without that companion placement retain the migration flow in Validation.

In the expanded band, keyboard focus reaches the horizontal resize handle, the collapse button, and then the panel's controls in document order; Escape from the inspector restores the editor's last caret and scroll position. The collapsed strip opens from the strip itself or **Open inspector**. In sheet mode, **Back to your text** comes first, followed by the inspector controls; that button and Escape both close the sheet and restore the editor's last caret and scroll position. The sheet auto-opens only for a matching selection from the outline sidebar or a panel. Opening a package, choosing a file in the explorer, and prose hover or caret selections all ask for the editor: they update the inspector and make **Open inspector** available without covering the editor. Band mode always renders the matching selection in place.

### Outline hierarchy

The outline is one tree organized by designer-facing mechanism: Collections, Contracts, Tuning, Time, Direction, Sections, Acceptance tests, and Personalization. Collections, Tuning, Sections, and Acceptance tests always render; Contracts also remains a standing door, while the other mechanisms appear when their package file or declarations are present. Mechanism rows are selectable, show the number of selectable entities they own, expose their primary creation action as a compact `+` on hover or focus, and use their chevron to fold without selecting. Tuning values sit under predictable first-segment folds, with rules under one `rules` fold. Records, contract values, colours, runtime values, rulesets, pillars, anti-references, and must-keep entries remain citable and selectable through their owning inspectors but do not become tree rows.

The tree uses one roving tab stop. Arrow keys move, expand, collapse, and reach parents or children; Home and End jump; typing a printable character finds the next visible name. Enter or Space selects a mechanism or entity without moving focus into the raw editor, while a second Enter enters its inspector and Escape returns to the originating row. Shift+Enter runs a mechanism's primary creation action. Rows contain no tabbable controls, and declaration-row accessible names contain the visible name, type, and problem count without file or line metadata. Reanalysis preserves outline scroll and focus and recomputes exactly one tab stop.

A mechanism-level problem that cannot be placed on a declaration is its own tree row before that mechanism's branches or entities. It carries the problem symbol and a visible location tag; its accessible name is `Error: <message>, <file>:<line>` (or `Warning: …`), and type-ahead matches its message. Enter opens the reported source line and announces the opened problem through the shared status region.

The header has one package selector. It merges host-provided built-ins with browser drafts; choosing an option opens it immediately. `defaultPackageId`, or the first listed package when it is absent, is the default. A listed package shows its title alone. Editing one creates a local working copy under the same id, and **Reset to the original files** removes that copy without touching the host source.

Markdown and JSON files wrap by default. Exceptionally large text files (over 200,000 characters) use the virtualized unwrapped view and label that mode explicitly so editing stays responsive.

Browser drafts use the shared IndexedDB database `opengdd-authoring`, keyed by package id. Multiple instances have separate live state, but two instances editing the same package id intentionally share that persistence record; hosts needing isolation must give the packages distinct ids.

### Panels

A panel rendered in a sidebar must not rely on the tool-level `data-action` or `data-finding` hooks for same-task activation: those hooks are reached one microtask after the sidebar handler yields.

The Inspector has no panel switcher. Panels without `placement` are exclusive:
the most specific matching inspector wins. When equally specific exclusive
panels match, the first registered stays visible, while the status line and
`console.warn` report `<loser-id> also matches <kind>; <winner-id> shows` once
for that tie. A selected contract value uses the in-context inspector and can
open its adoption worksheet from there.

A descriptor may instead declare `placement: "companion"`. Every matching
companion renders below the chosen exclusive inspector as a second section
headed by its descriptor `title`; it never replaces or competes with the
exclusive panel. See [PANELS.md](PANELS.md) for the current authoring guide.

| Panel | Surface | Purpose |
|---|---|---|
| `opengdd.collection` | Inspector | Shows a collection's fields and records, including validated field-description, cell-edit, rename, duplicate, remove, and spreadsheet-paste paths. |
| `opengdd.record-form` | Inspector | Edits described and free-form collection records through the form service, with record rename beside Duplicate. An empty record in a described collection still shows the described boxes so the designer can add its fields; the empty-record sentence is for free-form records. |
| `opengdd.in-context` | Inspector | Shows the selected declaration's kind and source location. |
| `example.notes` | Explorer companion | Keeps one list of named, foldable notes per package, with inline rename and confirmed deletion beneath the content-sized package-file explorer. |

The Notes companion reads no selection. Its notes belong to the package, not to a file, and live in its panel-owned `panels/example.notes/notes.json` store; every write goes through the shared edit service, so its data and undo history remain package-local. A version 1 store that grouped notes by file is read in file order and rewritten flat on the next change.

The reusable record table accepts a row adapter with this interface:

```js
{
  list(): [{ id, values }],
  read(id, key),
  write(id, key, value, label),
  add(rows?, label?),
  remove(id),
  move(id, direction), // optional
  field(id, key, shape),
  binding(id, key),
  previewAdd(rows)
}
```

`list()` returns display-order rows before the table applies view-only sort and find operations. Every cell write calls `write(id, key, value, label)`. `add()` with no argument opens the adapter's ordinary add flow; the folder adapter also accepts one `{ id, values }` row or an array of them so a validated batch can share one undo.

`move(id, direction)` is optional, with `direction` equal to `up` or `down`. When an adapter supplies it, the table shows **Move up** and **Move down** beside that row and keeps the operation in one undo. The inline contract-row adapter uses authored order and supplies `move`; the folder adapter remains name-sorted and does not.

The inline contract-row adapter reads its adoption from the package at the start of every adapter call. A table may synchronously refresh after `add`, `move`, or `remove`, and a later write must resolve the named row against that current authored order rather than an object parsed before the mutation.

An adapter that offers editable cells must also supply `field(id, key, shape)` and `binding(id, key)`. The folder adapter uses them to give the table a form-kit descriptor and its JSON location; the table then routes the kit's committed value through `write`. Without both, the cell is labelled read-only and does not pretend that opening the record is an edit. Spreadsheet paste additionally requires `previewAdd(rows)`. Without it, the paste preview says that the adapter does not take pasted rows and **Add them** stays disabled. These descriptor and preview members are part of the table contract for those capabilities, including the inline contract-row adapter.

The form kit's `reference` type is the current contract-citation picker. It renders a grouped select over tuning values, contract values, and chapter sections; `references.pick` is not used because no anchored general picker exists yet. A current non-candidate value remains visible with its validator error so opening the form never conceals authored data.

The extension context exposes these services. A panel declares the whole service or a named capability in `needs`. A `section` selection has `range` for its heading line and `extent` from that heading through the line before the next heading of the same or higher level. `selection.clear()` clears the current selection. `context.package.packageRevision` changes after every package commit and can invalidate revision-bound memoization.

| Service | Available capabilities |
|---|---|
| `selection` | `current`, `subscribe`, `select`, `clear` |
| `edits` | `begin` |
| `validation` | `current`, `subscribe`, `forFile`, `reveal`, `contribute`. Contributed `warning` or `info` advice renders as warnings labelled with the panel title and increments the displayed warning count. |
| `references` | `families`, `resolve`, `usages`, `planRename`, `applyRename`, `planUseContractValue`, `applyUseContractValue`. This cut enumerates the `collection`, `collection-record`, `collection-field`, and `contract` families across prose and JSON. The last two members are the contract family's second job: remove one tuning key and its range, when present, and rewrite every prose citation to a named contract value as one validated plan. A tuning rule that names the key refuses the plan before confirmation and names the rule that must be rewritten first. |
| `forms` | `create` |
| `grid` | Not implemented yet. |
| `assets` | Not implemented yet. |

A reference rename plan is void after any package commit, including a commit to an unrelated file; plan again before applying it.

The edit sandbox currently enforces only creation and move destinations:
third-party panel transactions may create files and folders, or move them, only
under `panels/<panel-id>/`. It does not prevent edits to existing design files,
and `remove()` is not root-restricted. All edits still pass through the shared
transaction layer, validation, and undo. This is the exact current boundary,
not a broader security claim.

The tool gives its own record, collection, and contract panels separate host-private `context.internal` objects. Those objects are not extension services and are undefined for every other panel, even one that declares the public `validation` service. The contract panel's private object contains `begin`, `stage`, `run`, `view`, `subscribe`, `consumeDuplicateCheck`, `takeUpdateNotice`, `showTuningValue`, and `setDuplicateWarnings`; these members connect its validated worksheet writes, one-shot update and duplicate notices, and outline warning projection to the host. They are deliberately absent from the revision-1 capability table because an extension cannot request them.

## Controller

The controller's `selection.current()` and `selection.subscribe(listener)` members expose the same selection objects, including `origin`, that panels receive; the subscription returns its cancellation function. `inspectorMatches(selection)` asks the mounted panel host whether any registered inspector panel matches that selection, using the host's own specificity rules.

| Member | Contract |
|---|---|
| `openPackage(package)` | Replaces the mounted instance's working package. |
| `selection` | Exposes `current()` and `subscribe(listener)` for host-level selection observation. |
| `inspectorMatches(selection)` | Returns whether a registered inspector panel matches the selection. |
| `editorState()` | Returns the visible editor's `{selection: {start, end, direction}, scroll: {top, left}}` snapshot, or `null` when no text editor is visible. |
| `restoreEditorState(snapshot)` | Focuses the visible editor, restores a snapshot from `editorState()`, synchronizes its visual surface, and returns whether restoration occurred. |
| `focusEditor()` | Focuses the visible text editor without scrolling the page and returns whether focus was available. |
| `outlineProblemsOnly()` | Returns whether the outline problems-only filter is enabled. |
| `outlineProblemsOnly(value)` | Enables or disables the outline problems-only filter and returns the resulting state. |
| `destroy()` | Stops work and removes only this instance's owned DOM and listeners. |
| `testHooks` | Test-only analysis-view and editor-revision observations used by the browser behavior harness; not a supported host API. |

## Local pages and checks

These pages and checks exist in the steward's repository, not in the public
copy; they are listed so a reader knows what the tool is tested against.

Run `node authoring/scripts/serve.mjs` from the repository root. The workbench is served at `/author/workbench.html` (and at `/` by the local server).

| Check | Dependency |
|---|---|
| `node authoring/scripts/check-creation.mjs` | Node.js standard library only. |
| `node authoring/scripts/check-contracts.mjs` | Node.js standard library only; checks contract addition, update, worksheet, rows, and undo against in-memory fixtures. |
| `node authoring/scripts/check-contract-parity.mjs` | Node.js standard library only; compares the tool's contract liveness with the validator across every forge adoption and a deterministic sample of mutations; `--full` runs every mutation (about 4½ minutes). |
| `node authoring/scripts/check-prepared-contracts.mjs` | Node.js standard library only; checks the local stamina adapter with new/WIP adoption, source reuse/creation, conditional round trips, companion rules and byte-exact undo. |
| `node authoring/scripts/check-contract-transfer.mjs` | Node.js standard library only; checks transfer of a complete contract package and its exact files. |
| `node authoring/scripts/check-edits.mjs` | Node.js standard library only. |
| `node authoring/scripts/check-forms.mjs` | Node.js standard library only; drives every form field through the real lossless JSON patch helpers. |
| `node authoring/scripts/check-migrate.mjs` | Node.js standard library only; compares collected browser migration outputs with a real CLI migration and checks byte-exact undo. |
| `node authoring/scripts/check-references.mjs` | Node.js standard library only; checks reference plans, atomic application, and byte-restoring undo. |
| `node authoring/scripts/check-inspectors.mjs` | Node.js standard library only; checks inspector models, field edits, finding routing, and byte-exact undo. |
| `node authoring/scripts/check-sample.mjs` | Node.js standard library only; checks three maintained sample packages. |
| `node authoring/scripts/check-workbench.mjs` | Node.js standard library only. |
| `node authoring/scripts/check-server.mjs` | Node.js standard library plus the assembled static-site fixture. |
| `node authoring/scripts/check-lifecycle.mjs` | Node.js plus the platform archive tools it exercises (`tar`/`unzip` and PowerShell on Windows). |
| `node authoring/scripts/check-panels.mjs` | Node.js standard library only; checks descriptor validation, revision exclusion, creator `requires`, and selection delivery. |
| `node authoring/scripts/check-table.mjs` | Node.js standard library only; checks the folder adapter, table view operations, paste, field inference, and schema rewrite operations against in-memory fixtures. |
| `node authoring/scripts/check-all.mjs` | Runs every Node check above once and inherits their dependencies. |
| `/author/browser-behavior-check.html` | A browser; self-asserting behavior and DOM-fixture harness. |
| `/author/browser-behavior-check-headless.html` | A browser runner that does not deliver animation frames. |
| `/author/embed-check.html` | A browser; checks the embedded authoring surface. |
| `py -3.12 authoring/scripts/perf-typing.py --assert` | Optional Playwright for Python plus its Chromium browser (`playwright install chromium`). |

Run the two self-reporting browser pages and the built `/authoring-tool/` page
with `node authoring/scripts/run-browser-checks.mjs`. The runner reads
Playwright from `OPENGDD_PLAYWRIGHT_DIR`, `--playwright <dir>`, or the default
scratch directory `<os.tmpdir()>/opengdd-harness`; it does not add a repository
dependency. In that scratch directory, install the pinned runner with `npm i
playwright@1.62.1`, then install its browser with `npx playwright install
chromium`. Use `--port <n>` to replace port 8123, or add page paths to replace
the three defaults. `--screenshots` saves the published page at 1440×900 and
1280×720 under the operating system's temporary directory;
`--screenshot-dir <dir>` chooses another scratch directory.

The Node and browser checks read repository fixtures into memory. They never write inside the repository; temporary migration copies are created under the operating system's temporary directory.

## Theme contract

Override properties on `.opengdd-authoring`. These are the complete light defaults; the bundled `prefers-color-scheme: dark` rule supplies the dark palette shown where it differs.

To force a palette, set `.opengdd-author-theme--light` or `.opengdd-author-theme--dark` on `.opengdd-authoring` or one of its ancestors. Omit both classes to keep the system behavior supplied by `prefers-color-scheme`.

| Property | Default | Dark default |
|---|---|---|
| `--opengdd-author-bg` | `#f3f1eb` | `#151815` |
| `--opengdd-author-surface` | `#fffefa` | `#1c201d` |
| `--opengdd-author-surface-raised` | `#ffffff` | `#202521` |
| `--opengdd-author-surface-muted` | `#e9e6dd` | `#292e2a` |
| `--opengdd-author-ink` | `#252a27` | `#edf0e9` |
| `--opengdd-author-muted` | `#666d68` | `#aeb5ae` |
| `--opengdd-author-line` | `#d4d0c5` | `#3a413b` |
| `--opengdd-author-line-strong` | `#9d9b91` | `#657067` |
| `--opengdd-author-accent` | `#176b57` | `#8fd1ba` |
| `--opengdd-author-accent-soft` | `#dceee7` | `#243c33` |
| `--opengdd-author-danger` | `#a03d32` | `#ff9184` |
| `--opengdd-author-warning` | `#8a5a08` | `#f5c168` |
| `--opengdd-author-selection` | `#b8ddcf` | `#315c4d` |
| `--opengdd-author-shadow` | `rgb(26 34 30 / 18%)` | `rgb(0 0 0 / 42%)` |
| `--opengdd-author-kind-value` | `#08769a` | `#63c8e8` |
| `--opengdd-author-kind-section` | `#23714a` | `#82dba7` |
| `--opengdd-author-kind-acceptance-test` | `#9a5c0a` | `#f5c168` |
| `--opengdd-author-kind-mood` | `#a23b6f` | `#f298c4` |
| `--opengdd-author-kind-question` | `#a23b6f` | `#f298c4` |
| `--opengdd-author-kind-name` | `#a23b6f` | `#f298c4` |
| `--opengdd-author-kind-collection` | `#6b5d1f` | `#d9c66a` |
| `--opengdd-author-kind-collection-record` | `#9a442a` | `#f39a79` |
| `--opengdd-author-kind-contract` | `#6a4c93` | `#c7a7f2` |
| `--opengdd-author-kind-rule` | `#486a9c` | `#92b4e6` |
| `--opengdd-author-kind-runtime` | `#315d9b` | `#8bb8ff` |
| `--opengdd-author-kind-clock` | `#7a4b9e` | `#cf9cf3` |
| `--opengdd-author-kind-ruleset` | `#7d3d55` | `#ed9bb9` |
| `--opengdd-author-kind-palette` | `#00736b` | `#62d1c7` |
| `--opengdd-author-kind-color` | `#a0520d` | `#ffb066` |
| `--opengdd-author-kind-pillars` | `#725b1b` | `#e4cb70` |
| `--opengdd-author-kind-anti` | `#725b1b` | `#e4cb70` |
| `--opengdd-author-kind-must_keep` | `#725b1b` | `#e4cb70` |
| `--opengdd-author-kind-colors` | `#2e6d68` | `#7ed0c7` |
| `--opengdd-author-kind-contrast` | `#2e6d68` | `#7ed0c7` |
| `--opengdd-author-kind-timing` | `#2e6d68` | `#7ed0c7` |
| `--opengdd-author-kind-file` | `#666d68` | `#aeb5ae` |
| `--opengdd-author-kind-unknown` | `#d1281c` | `#ff6154` |
| `--opengdd-author-kind-ambiguous` | `#8150b4` | `#d19aff` |
| `--opengdd-author-workspace-height` | `min(52rem, calc(100vh - 8.2rem))` | same |

Semantic classes never change meaning: `.opengdd-author-kind--value`, `.opengdd-author-kind--section`, `.opengdd-author-kind--acceptance-test`, `.opengdd-author-kind--mood`, `.opengdd-author-kind--question`, `.opengdd-author-kind--name`, `.opengdd-author-kind--collection`, `.opengdd-author-kind--collection-record`, `.opengdd-author-kind--contract`, `.opengdd-author-kind--rule`, `.opengdd-author-kind--runtime`, `.opengdd-author-kind--clock`, `.opengdd-author-kind--ruleset`, `.opengdd-author-kind--palette`, `.opengdd-author-kind--color`, `.opengdd-author-kind--pillars`, `.opengdd-author-kind--anti`, `.opengdd-author-kind--must_keep`, `.opengdd-author-kind--colors`, `.opengdd-author-kind--contrast`, `.opengdd-author-kind--timing`, `.opengdd-author-kind--file`, `.opengdd-author-kind--unknown`, and `.opengdd-author-kind--ambiguous`. The `mood`, `question`, and `name` tokens are declared separately even though their bundled light and dark values match. `contract` and `contract-value` share the contract class. The selection-only `identifier` alias uses the `name` class, and `folder` uses `file`. A host theme must keep `unknown` visually distinct from every known kind; its wavy underline is part of that fixed signal, not optional decoration.
