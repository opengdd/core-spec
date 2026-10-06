# OpenGDD v0.9 working draft

OpenGDD is an open format for game design documents. The **designer** writes
one game's design as a **package**. A package contains prose and structured
data. Prose is ordinary text in sentences. The structured data makes it
possible to check selected design statements.

A **builder** turns the package into a running game. The builder can be a
person, a studio, an AI agent, or a combination. Three authority levels state
which decisions stay fixed, which belong to the builder, and which are made
separately for each build.

The package can also contain optional attribution and commerce terms. The
core format does not require a particular transaction model. This document
states the rules of the format. The
[OpenGDD Handbook](https://opengdd.org/handbook/) teaches the format.

**Optional mechanisms.**

| Mechanism | Section | What it is |
| --- | --- | --- |
| Collections | §1b | A collection is a folder of game content records, such as the enemies, the cards or the levels of a game. |
| Rulesets | §2c | A ruleset is one complete set of active rules, and play can change from one ruleset to another. |
| Runtime values and clocks | §4b | A runtime value is something that changes during play and that the package names, so that prose, tests and clocks can refer to it. A clock is a named source that advances values, such as elapsed seconds or a turn count. |
| Personalization | §5 | Personalization lets one package produce different builds. For each build, the builder is asked the package's questions, before or while building the game. |
| Acceptance tests | §6 | An acceptance test is a numbered heading followed by a short block. The block states what a finished build has to prove. |
| Art direction | §9 | Art direction records the intended look and mood of the game, and measured promises about colors, contrast and the duration of events. |
| Contracts | §10 | A contract is a reusable description of one game mechanism, not a business agreement. It asks questions about the mechanism, and each question has a closed set of answer options. |

**How to read this document.** MUST means required. MUST NOT means
forbidden. SHOULD means recommended. MAY means allowed. Throughout this
document, these four words are used in their RFC 2119 sense.

A **normative** statement decides whether something conforms. A passage
marked non-normative explains and decides nothing. §12 contains three shared
tables that several sections cite. A **validator** is a program that checks a
package or a build record against the rules that a program can decide (§2d).
The diagnostics table of each section lists the codes that the validator
reports for that section.

*[Get started](https://opengdd.org/get-started/) shows how to run the
published validator on a package.*

Status: v0.9, released 2026-10-06. License: specification text
CC-BY-4.0; schemas and validator code MIT.

This document defines OpenGDD v0.9. Every normative rule and every unnumbered
statement about the current version applies to v0.9. The exception is a
passage that describes a migration or an earlier form (Appendix A).

A rule from an earlier version applies only if this document states it.

## 1. Package layout

A package is one folder that holds the complete design of one game. The
files and folders of the package sit at the package root.

**Files and folders.** This table lists every file and folder that the format
defines at the package root.

| File or folder | Required | What it holds | Defined in |
| --- | --- | --- | --- |
| `manifest.json` | Yes | The identity of the package, and the platform and the genre of the game. | §3 |
| `tuning.json` | Yes | The numbers: values, ranges and rules. | §4 |
| `clocks.json` | No | Time modes and clocks. | §4b |
| `direction.json` | No | Art direction. The mechanism applies when the file is present. | §9 |
| `personalization.json` | No | Questions. The mechanism applies when the file is present. | §5 |
| `01-overview.md` | Yes | A short description of the game, its main design priorities and the player experience. The chapter opens with the fantasy block. | §1a |
| `02-mechanics.md` | Yes | The complete rules. | |
| `03-content.md` | No | Story, characters, dialogue, and levels or level generation. | |
| `04-presentation.md` | No | Art direction, audio direction, UI and feel. | |
| `05-build-plan.md` | Yes | Build stages, optional checkpoints and optional acceptance tests. | §6 |
| `assets/` | No | Reference images, moodboards and sketches. | |
| `contracts/` | No | Adopted contracts. The name is reserved. | §10 |
| `collections/` | No | Structured content collections. The name is reserved. | §1b |

The five files marked Yes are enough for a complete package (rule 1).
`tuning.json` is required even when the package stores no number in it. Its
`values` object is then empty (§4).

This document has no separate section for `02-mechanics.md`, `03-content.md`
or `04-presentation.md`. Each of these chapters is ordinary Markdown prose:
the format requires no headings and no fixed order inside it. Every chapter
can contain the structures that this document defines for chapters, such as
authority tags (§2).

*[Get started](https://opengdd.org/get-started/) shows how to write a first
package. The Handbook chapter
[What a package contains](https://opengdd.org/handbook/what-a-package-contains/)
explains the files of a package.*

**Rules.**

1. **Five files are enough.** The five required files alone are a complete,
   conforming package. They are three chapters in ordinary prose and two
   small JSON files. A package with only these five files is finished.
2. Every other mechanism is optional. A mechanism applies when the package
   declares it or uses it.
3. For each of the optional root files `clocks.json`, `direction.json` and
   `personalization.json`, the mechanism of the file applies when the file is
   present. The manifest names neither `direction.json` nor
   `personalization.json` (§3).
4. `contracts/` is reserved for contracts (§10). `collections/` is reserved
   for collections (§1b). A package that has its own folder with one of these
   names has to rename that folder.
5. Only `contracts/` has a reserved-name check of its own,
   `CONTRACT_FOLDER_RESERVED` (§10). A `collections/` folder that holds
   anything other than collections fails under the rules of §1b.
6. **Chapters are declared by presence.** A chapter is a Markdown file at the
   package root whose name has the form `NN-name.md`. Such a file is a
   chapter because it exists, and the manifest does not list chapters. Tools
   read all chapters in filename order.
   - Numbers `01` to `05` keep the names and roles in the table above. A file
     with a number from `01` to `05` and any other name is an error.
   - Number `00` is reserved and invalid.
   - Numbers `06` and up belong to the designer's own chapters.
7. A Markdown file at the package root without a number is not a chapter. No
   tool reads it as a chapter, and nothing in it declares anything. The
   validator reads it only for the safety scan (§2d).
8. The designer settles every rule that a player could notice and that
   changes how the game plays. §2a states this test. For each such
   rule, the designer writes the rule out, or leaves the decision to someone
   else on purpose with one of the authority levels of §2.
9. §4 states which numbers belong in `tuning.json` and where every other
   number is kept.
10. Normative prose MUST cite the tuning key and not repeat the value that
    the key holds. In a package, normative prose is prose that states a
    requirement for the game or for a build. A tuning key is the name of a shared number
    in `tuning.json` (§4). Write the key alone between two backticks, for
    example `` `hazard.interval_seconds` ``, and never write the number
    stored under it. The citation is bare: it has no prefix. Text between two
    backticks is inline code. §12.2 lists every reference form and states how
    to distinguish a citation from other inline code that contains dots.
11. A package-relative path names a file or a folder, starting from the
    package root. An example is the image path `assets/mood/envelope.jpg`
    (§9.9). In a path, a `..` segment means the folder one level up.
    Normalization replaces each `..` segment by the folder that it means.
    After normalization, every package-relative path MUST stay inside the
    package. A path that passes through a filesystem link to a file or folder
    outside the package is also outside. `assets/../../elsewhere.png` leaves
    the package and is invalid.

**Diagnostics.** The Kind column gives the kind of each finding, and §2d
defines the four kinds. An error means that the package or the build record
does not conform. A warning, a hint or a safety notice has no effect on
conformance. A hint is an optional suggestion for review. A safety notice
points out material that a person should inspect before giving the package to
an agent that can use tools.

Four codes of other sections also cover rule 11. The `INJECTION_` codes are
safety notices (§2d), defined in `conformance/INJECTION-LINT.md`.

*This table is for reading validator reports. The Handbook chapter
[What validation proves](https://opengdd.org/handbook/how-checking-works/)
explains the safety scan.*

| Code | Kind | Reported when |
| --- | --- | --- |
| `PACKAGE_DIRECTORY` | error | The package folder does not exist or is not a folder. |
| `PACKAGE_REQUIRED_FILE` | error | A required file is missing or is not a file. |
| `CHAPTER_NAME_RESERVED` | error | A chapter breaks rule 6. |
| `MEDIA_PATH_MISSING` | error | An image path in `direction.json` breaks rule 11. |
| `CONTRACT_CITATION_DANGLING` | error | The file part of a contract citation breaks rule 11. |
| `BUILD_SPEC_TUNING_MISSING` | error | The source package's `tuning.json` breaks rule 11, in build-record validation. |
| `BUILD_SPEC_PLAN_MISSING` | error | The source package's `05-build-plan.md` breaks rule 11, in build-record validation. |
| `INJECTION_PROMPT_CONTROL` | safety | Text holds a prompt-control phrase. `conformance/INJECTION-LINT.md` defines the exact trigger. |
| `INJECTION_EXTERNAL_ACTION` | safety | Text holds a request shaped like "run this command" or "fetch this URL". `conformance/INJECTION-LINT.md` defines the exact trigger. |
| `INJECTION_READER_DIRECTIVE` | safety | Text holds an explicit second-person duty, or one of a small set of imperative openings in a context that is not the game. `conformance/INJECTION-LINT.md` defines the exact trigger. |
| `INJECTION_OBFUSCATED_BLOCK` | safety | Text holds a long run that looks like hex or base64. `conformance/INJECTION-LINT.md` defines the exact trigger and its exceptions. |
| `INJECTION_SUSPICIOUS_LINK` | safety | A link in prose outside fences shows signs of an action, an executable, a local network, credentials or an active scheme. `conformance/INJECTION-LINT.md` defines the exact trigger. |
| `INJECTION_SCAN_SKIPPED` | safety | A text-like file is larger than 2 MiB or cannot be read, so the scan skipped it. `conformance/INJECTION-LINT.md` defines the exact trigger. |

### Definitions used by the rules

JSON is a text format for data. A JSON object is a set of named parts, and
each part has a value. An array is an ordered list of values. The manifest
example in §3 is one complete JSON object. The shape of an object says which
fields the object can have and what each field holds. A schema describes a
shape, so that a validator can check data against it.

| Term | Meaning |
| --- | --- |
| Closed shape | A shape that allows no field beyond the fields that this document names. |
| Closed value set | A value set that accepts no value beyond the values that it lists. |
| Stable name | A name that does not change between revisions of the thing that carries it, because other things refer to it. |
| Field | A named part of a JSON object, with a meaning of its own, such as `title` in `manifest.json` (§3). |
| Key | The name that identifies one entry in a map, such as `dash.duration_seconds` in `values` (§4). A map is a JSON object whose entries are identified by keys. A key is not a field. |
| Kebab-case | One or more groups of lowercase ASCII letters and digits, joined by single hyphens. A kebab-case name matches `^[a-z0-9]+(-[a-z0-9]+)*$`. |

A kebab-case name has no capital letter, no underscore, no dot, no leading or
trailing hyphen and no doubled hyphen. A rule that allows dots between
kebab-case parts says so. The rule for the palette key is one example (§9.1).

A JSON example in this document shows a fragment of its file, not a complete
document. The text around an example says when the example is complete.

The format requires fence lines, which start with three backticks, in two
cases only: around the fantasy block (§1a) and around a test block (§6). The
fence lines around all other examples belong to the Markdown source of this
document, not to the examples.

### Identifiers

An identifier is a name that the designer defines: in a JSON file, as the
name of a file or a folder, or in a chapter. Examples are a tuning key in
`tuning.json` (§4) and a ruleset id in a chapter tag (§2c).

| Identifier kind | Grammar | Where it is used |
| --- | --- | --- |
| Kebab-case name | Kebab-case (table above) | Every name that a rule calls kebab-case, such as a collection id (§1b) or the package `id` (§3). |
| Chapter file name | `NN-name.md`: two digits, a hyphen, a name and `.md` | Chapters (rule 6 above). |

The table covers these two kinds only. Other kinds of name have a grammar of
their own, which their section states: for example tuning keys (§4), question
ids (§5) and the field names of a collection (§12.1).

**Rules.**

1. Defining an identifier creates it. There is no declaration step and no
   registry. A key such as `infection.damage` or `tick.day` becomes an
   identifier when it is written in `tuning.json`.
2. Each identifier belongs to a scope. The same spelling in two scopes can
   name two different identifiers.
3. The name of a collection field is one identifier, wherever it is defined:
   in the record schema, or in chapter prose about the collection. When a
   thousand records give that field a value, they hold a thousand values,
   not a thousand identifiers.
4. The forms that cite an identifier in prose and in JSON are listed in
   §12.2.

## 1a. The fantasy block (required)

The fantasy block is a short statement of what the player gets to be and
feel. It is a fenced block with the tag `fantasy` at the start of
`01-overview.md`. The block is written between two fence lines: three
backticks followed by `fantasy`, and three backticks. Every package has one.

**Example.**

```fantasy
You are the getaway driver, and the plan has already failed.
Neon rain on the windshield, a stolen V8 under your hands.
Feel: fast, smooth, breathless.
NOT: repetitive, tactical, punishing.
```

**Parts.**

| Part | Written on | Required | Content |
| --- | --- | --- | --- |
| Player fantasy | Every line that does not open with `Feel:`, `NOT:` or `Anti-references:` | At least one line | What the player gets to be. At most 280 characters in total (rule 10). |
| Feel entries | One line that opens with `Feel:` | Yes | Three to five words or short phrases that describe how the game feels, such as fast, smooth, breathless. |
| Anti-references | One line that opens with `NOT:` or `Anti-references:` | Yes | What the game is not, such as repetitive, tactical, punishing. |

**Rules.**

1. `01-overview.md` MUST open with a fenced block whose tag is `fantasy`. The
   block is read from `01-overview.md` and from no other file.
2. The block MUST be the first content in the file. One `#` title line MAY
   come before the block. Blank lines and HTML comments before the block are
   not content. Anything else before the block is an error.
3. The block is read line by line. Blank lines are ignored. Leading and
   trailing whitespace on a line is ignored.
4. The labels are `Feel:`, `NOT:` and `Anti-references:`, each with an ASCII
   colon. Label matching ignores letter case. The labels are syntax, like
   JSON field names, so they are the same in a package in any language. A
   line that opens with `Feel：` and a full-width colon has no label.
5. The block MUST NOT hold more than one `Feel:` line. The block MUST NOT hold
   more than one anti-reference line, whichever of the two spellings each line
   uses.
6. The feel entries are separated by `,`, `、`, `，`, `،` or `・`. The
   `Feel:` line MUST hold three to five entries. An empty entry does not
   count.
7. The anti-reference line MUST NOT be empty after its label.
8. A sentence-ending mark at the end of the `Feel:` line or of the
   anti-reference line is punctuation. The mark is not part of the last
   entry on the line. A sentence-ending mark is any character with the
   Unicode property `Sentence_Terminal`, such as `.`, `!`, `?` or `。`.
   Closing brackets and closing quotation marks after the mark are removed
   with it.
9. There MUST be at least one player-fantasy line. The first line says what
   the player gets to be. Within the length limit, the designer chooses the
   form: for example one long sentence, three longer lines or six short ones.
   Punctuation in player-fantasy lines is not checked.
10. The player-fantasy lines together MUST NOT exceed 280 characters. This
    limit is the only size limit on the block.

    *For exact character counting.* To measure, trim the leading and trailing
    whitespace of each player-fantasy line, count its Unicode scalar values,
    and add the counts. For example, a letter, a digit, a kana or a kanji is
    one Unicode scalar value, and a combining mark is one more. Newlines are
    not counted.
11. The block does not state mechanics. Rules belong in the chapters.
12. A Delegated passage leaves a decision to the builder. Delegated passages,
    tagged `> DELEGATED:` (§2), can appear in any chapter.
    **The fantasy block constrains every Delegated passage.** The passage does
    not need to say so. For every delegated decision in the package, in any
    chapter, the builder chooses an option that fits the fantasy block. The
    same holds for every choice that the package leaves to the builder
    without a tag, when a player could notice the result (§2a).

*The Handbook chapter
[The player fantasy](https://opengdd.org/handbook/player-fantasy/) shows how
the builder uses the fantasy block for a decision that the rules leave open.*

**References in player-fantasy lines.** A player-fantasy line MUST NOT
contain a reference. A player-fantasy line is ordinary text: it cites no
tuning key and no runtime value, and it contains no chapter anchor. A `#`
directly before a word can count as a chapter anchor, as in `#neon`.

*For validator makers. This part ends at "Diagnostics".* The table lists
every form that is a reference in a player-fantasy line. §12.2 defines the
dotted forms.

| Form | Read where |
| --- | --- |
| A typed-colon reference that begins with `tuning:`, `state:`, `collections:`, `descriptor:` or `palette:` | Anywhere on the line |
| A `runtime.` address | Inside inline code |
| A bare tuning citation: an inline-code token that the classification rule of §12.2 reads as a citation | Inside inline code |
| A chapter anchor written `<file>.md#<anchor>` | Anywhere on the line |
| A chapter anchor written as a bare `#<anchor>` | Anywhere on the line |

A chapter anchor is a reference to the anchor of a Markdown heading. §10.10
states how a heading's anchor is derived. The bare form `#<anchor>` is
recognized by its characters alone. It is a `#` at the start of the line or
after whitespace, followed directly by an anchor id. For the bare form only,
the anchor id has a wider grammar than kebab-case (§1):

- lowercase or caseless letters, their combining marks, and numbers, from
  any script;
- joined by single hyphens;
- with at least one letter.

A `#` in any other position, or followed by digits only, is ordinary text.
So "the #1 spot" holds no anchor.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `FANTASY_BLOCK` | error | `01-overview.md` has no fenced `fantasy` block. |
| `FANTASY_POSITION` | error | Content other than one `#` title line and HTML comments comes before the block (rule 2). |
| `FANTASY_SENTENCE` | error | The block has no player-fantasy line. |
| `FANTASY_LENGTH` | error | The player-fantasy lines together have more than 280 characters (rule 10). |
| `FANTASY_FEEL` | error | The `Feel:` line is missing, or it holds fewer than three or more than five entries. |
| `FANTASY_ANTI_REFERENCES` | error | The anti-reference line is missing, or it is empty after its label. |
| `FANTASY_LABEL_DUPLICATE` | error | The block has a second `Feel:` line, or a second anti-reference line under either spelling. |
| `FANTASY_REFERENCE` | error | A player-fantasy line holds a reference form from the table above. |

## 1b. Structured content collections

A collection is a folder of game content records, such as the enemies, the
cards or the levels of a game. Collections are kept in the reserved folder
`collections/` at the package root. Collections are optional.

*The Handbook chapter
[Collections](https://opengdd.org/handbook/collections/) shows what a
collection is for, with a complete record, a schema file and rules that read
the numbers of records.*

**Example.**

```text
my-game/
  collections/
    enemies/
      gloom-moth.json
      cinder-wisp.json
    levels/
      _collection.json
      first-slide.json
```

**Folders and files.**

| Name | Where | What it is |
| --- | --- | --- |
| `<collection>/` | Directly in `collections/` | One collection. The folder name is the collection id. |
| `_collection.json` | In a collection folder | The schema file of the collection. It is optional. |
| `<record>.json` | In a collection folder | One record. The file name without `.json` is the record id. |

No other file or folder is allowed in `collections/` or in a collection
folder. A collection id and a record id MUST be kebab-case (§1).

**Records.** A record file holds one JSON object of the game's own fields.
The record id is the record's address. A display name is ordinary record
data. The address stays stable whatever name the game displays. Record ids
are unique in a collection, because two files in one folder cannot have the
same name.

**The schema file.** In `_collection.json`, the designer describes the
records of the collection. The file is one JSON object. The published schema
`collection.schema.json` (§3a) validates the file.

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `record` | A record schema in the collection form (§12.1). Each `of` inside it holds a record schema too. | No | The record schema. When it is present, every record in the collection is checked against it. |

No other field is allowed in the schema file. A key that starts with `_` is
allowed, because it is an annotation and not a field (rule 4).

**The record schema.** A record schema maps each field name to a field
shape. A field shape is an object that describes the field with members such
as `type` and `required`. The record schema follows the collection form of the
record-field grammar (§12.1): field names, members, types and combination
rules. The designer chooses the field names, and the format defines no field
name.

The `when` member of a field shape holds the `row` condition only (§12.3).
In a collection, the `row` condition reads the record, or the list entry for
a field inside `of`. It does not read a row of a grid (§7a). An allowed value
of the condition can be a number.

**Citations.** Chapter prose cites a collection, a record or a field with the
three `collections.` address forms (§12.2). The address is written between
two backticks. For example, `` `collections.enemies` `` cites a collection.
The address `` `collections.enemies.gloom-moth` `` cites one record. The
address `` `collections.enemies.gloom-moth.speed` `` cites one field of that
record.

**Rules.**

1. A collection folder declares the collection by its presence. Nothing is
   registered in the manifest.
2. When the schema file has a `record` schema, every record in the collection
   MUST satisfy the schema. Each of these is an error:
   - a field that the schema does not declare
   - a missing required field
   - a field that is present while its `when` condition does not hold
   - a value of the wrong type
   - a value outside the field's `options`
   - a value that breaks the field's `pattern`
   - a repeated value in a field with `unique: true`
3. Without a `record` schema, the records of a collection are free-form
   designer data.
4. A key that starts with `_` is an annotation, in the schema file, in the
   record schema and in records. The format gives no meaning to an
   annotation, and no check reads it. The rule against undeclared fields
   does not apply to annotations.
5. An open field is a field with `open: true`. The number in an open field is
   an open number: the package has not decided it, and each build supplies it
   (§4). In an open field, the values in the records mean this:
   - a number is a guess
   - `null` means that there is no guess
   - a missing field means that the field does not apply to that record

   A pin is a rule in `tuning.json` that decides one record's value in an
   open field. The pin names the field by its address,
   `collections.<collection>.<record>.<field>`. §4 defines pins and gives an
   example.
6. All grid fields of one record MUST agree in dimensions, measured in
   Unicode scalar values. The format fixes that unit. §7a gives the rules for
   matching dimensions.
7. The meaning of a field, such as what `speed` measures or what `#` marks,
   is written in the field's `description`.
8. Game rules, such as "bosses spawn once per run", are written in chapters,
   like every rule.
9. Collections are Fixed package data (§2), with two exceptions: open fields
   (rule 5) and content that a Delegated passage covers (rule 10). Apart
   from these, they are statements of the package, and the designer decides
   them like every other Fixed statement.
   In an open field that applies to a record, the builder supplies the number
   for each build (rule 5).
10. A collection has no authority mechanism of its own, and no authority tag
    marks a collection. A designer who leaves some part of a collection's
    content to the builder says so in an ordinary `> DELEGATED:` blockquote,
    checked like all delegation (§2). The passage cites the collection or
    the records that it covers. It can leave to the builder, for example,
    which records appear in the game, whether one record appears, or how a
    record is changed. A record that such a passage covers is a suggestion
    inside the limits that the passage states. A record that no such passage
    covers is Fixed.
11. A field address MUST name a field that is present in the record or
    declared by the record schema. When a token has more segments than a field
    address, only the segments up to the field are checked.
12. A citation that names a collection, a record or a field that does not
    exist is dangling. A dangling citation is an error.
13. A collection that nothing in the package refers to produces a warning.
    Nothing refers to a collection when all three of these are true:
    - no chapter prose cites the collection
    - no rule in `tuning.json` names one of its record fields (§4)
    - no `link` field names the collection in `to`

    The warning asks for a review. It does not require a change.

**Diagnostics.** The findings for links are in "Links between records". In
the codes below, `LABEL` means the schema file.

*This table is for validator makers.*

| Code | Kind | Reported when |
| --- | --- | --- |
| `COLLECTION_STRAY_FILE` | error | A file is directly in `collections/`, or a file in a collection folder is neither the schema file nor a `.json` record. |
| `COLLECTION_SUBDIRECTORY` | error | A folder is inside a collection folder. |
| `COLLECTION_ID_GRAMMAR` | error | A collection id or a record id is not kebab-case. |
| `COLLECTION_LABEL_JSON` | error | The schema file does not parse as JSON. |
| `COLLECTION_LABEL_SCHEMA` | error | The schema file breaks `collection.schema.json`. |
| `SCHEMA_JSON` | error | The validator cannot read `collection.schema.json` itself as JSON. |
| `COLLECTION_SCHEMA_SHAPE` | error | The record schema breaks the collection form of §12.1, or its `when` holds anything other than a `row` condition. |
| `COLLECTION_RECORD_JSON` | error | A record file does not parse as JSON. |
| `COLLECTION_RECORD_SHAPE` | error | A record file is not one JSON object. |
| `COLLECTION_RECORD_SCHEMA` | error | A record breaks the record schema in one of the ways that rule 2 lists, or a required link field holds no link ("Links between records", rule 2). |
| `PROSE_CITATION_DANGLING` | error | A `collections.` citation in chapter prose names no collection, no record of the collection, or no field of the record (rules 11 and 12). |
| `PROSE_REFERENCE_DANGLING` | error | An inline-code token in chapter prose starts with the word `collections` and holds a colon, as in `collections:enemies:count`. The token holds no `<` or `>`. The character after `collections`, if there is one, is not an ASCII letter, an ASCII digit or `_`. Appendix A says what to write instead. |
| `COLLECTION_TAG_RETIRED` | error | A chapter contains a `> COLLECTION:` blockquote. |
| `COLLECTION_UNCITED` | warning | Nothing in the package refers to the collection (rule 13). |

**Not in this version.** Folders inside a collection folder.

### Links between records

A field of type `link` holds the ids of records in the collection that its
`to` member names. `loops: false` and `mirrored_by` turn on two optional
checks.

**Example.**

```json
{
  "record": {
    "prerequisite_ids": {
      "type": "link",
      "to": "technologies",
      "many": true,
      "loops": false
    },
    "unlock_recipe_ids": {
      "type": "link",
      "to": "recipes",
      "many": true,
      "mirrored_by": "unlocked_by_tech_id"
    },
    "inputs": {
      "type": "list",
      "of": {
        "item_id": { "type": "link", "to": "items", "required": true },
        "qty": { "type": "integer", "required": true }
      }
    }
  }
}
```

**Link values.**

| Value in the record | Without `many: true` | With `many: true` |
| --- | --- | --- |
| The field is absent, or holds `null` or `[]` | Zero links | Zero links |
| A string id | One link | Not allowed |
| A non-empty array of string ids | Not allowed | One link for each id |

A link field MUST hold a value that this table allows. Any other value has
the wrong type.

**Rules.**

1. The `to` collection is in the same package. It MAY be the collection that
   declares the field.
2. When `required: true`, or a `when` condition that holds, makes a link
   field required, the field MUST hold at least one link.
3. Each linked id MUST name a record in the `to` collection. The validator
   checks this on every package validation. Nothing is registered in the
   manifest, and no acceptance test turns this check on.
4. When a link field has `loops: false` and links into its own collection, the
   links that the field holds MUST contain no cycle. On a link to a different
   collection, `loops` has no effect. When `loops` is omitted or `true`,
   cycles are allowed.
5. `mirrored_by` names the mirror field. The mirror field is a link field on
   the target collection that links back to the collection that declares the
   field. The links MUST agree in both directions, link by link:
   - when record A links to record B, the mirror field of B MUST link to A
   - when the mirror field of B links to A, the field of A that carries
     `mirrored_by` MUST link to B

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `COLLECTION_LINK_TYPE` | error | A link field holds a value that has the wrong type. |
| `COLLECTION_LINK_DUPLICATE` | warning | An array of ids repeats an id. |
| `COLLECTION_LINK_TARGET` | error | `to` names a collection that does not exist. The finding identifies the declaring field. |
| `COLLECTION_LINK_DANGLING` | error | A linked id names no record in the `to` collection. The finding identifies the declaring field, the source record and the id. |
| `COLLECTION_LINK_LOOP` | error | The links of a field with `loops: false` contain a cycle. The finding gives one complete cycle as an ordered list of record ids. |
| `COLLECTION_MIRROR_FIELD` | error | The mirror field is missing, or it is not a link field that links back to the collection that declares the field. |
| `COLLECTION_MIRROR_ONE_WAY` | error | A link has no matching link in the other direction. The finding gives both record ids. |

## 2. The three authority levels

Every design statement in the package carries one of three authority levels.
Design statements include the rules of the game, story text, dialogue, and
content and presentation text. Fixed is the default and needs no tag. Chapters
mark the other two levels with a blockquote tag.

**Example.**

```markdown
> DELEGATED: Choose the landing animation and sound.

A landing never hides the next hazard.
```

**The levels.**

| Level | Tag | Who decides | What the builder does |
| --- | --- | --- | --- |
| **Fixed** | None. Text outside every authority tag is Fixed. | The designer | Builds exactly as written. |
| **Delegated** | `> DELEGATED:` | The builder | Decides. The package states intent and constraints. The implementation can vary. |
| **Personalization** | `> PERSONALIZATION: <id>` | The answer to question `<id>` in `personalization.json` (§5) | Resolves the passage by that answer. |

Validation does not check whether a finished build follows Fixed text. The
experimental certification protocol judges that (§2d).

All three levels are instructions to the builder, written in prose. The
builder reads them and follows them. The format itself resolves an
instruction in one case only: a personalization answer that changes a number
(§5).

**Tag lines.** A tag line is a blockquote line whose text, after its `>`
markers and the spaces between them, begins with `DELEGATED:`,
`PERSONALIZATION:` or `RULESET:`. The tag word is written in capital letters.
Spaces before the first `>` are allowed. A line inside a fenced code block is
never a tag line. Tag text inside a fence is example text.

`RULESET:` is the ruleset tag, not an authority tag. It says which ruleset its
blockquote belongs to (§2c).

**Text on the tag line.**

| Tag | Text after the tag word on the tag line |
| --- | --- |
| `DELEGATED:` | Part of the delegated passage, not a label. The text can be empty. The passage then starts on the next `>` line. |
| `PERSONALIZATION:` | The id of a question declared in `personalization.json` (§5). The id MUST name a declared question. The id ends at the first space. Text after the id is part of the personalized passage. |
| `RULESET:` | The ruleset id (§2c). |

**Rules.** These rules decide which lines a tag covers. They are the same for
`> DELEGATED:`, `> PERSONALIZATION:` and `> RULESET:`.

1. The quote depth of a line is the number of its `>` markers. Spaces before
   the first `>` do not count. A line with no `>` at its start has quote
   depth 0.
2. A tag covers its blockquote. The blockquote is the tag line and the lines
   directly after it that have at least the tag line's quote depth.
3. A bare `>` line continues the blockquote, so one tag can cover several
   paragraphs.
4. The first line with a smaller quote depth ends the blockquote. Text after
   that line is outside the tag. A blank line and a line with no `>` at its
   start have quote depth 0 (rule 1), so each of them ends the blockquote.
5. A tag in a nested quote (`> >`) inside another tag's blockquote covers its
   own nested quote. When authority tags are nested, the innermost tag decides
   the authority of each line.
6. Two authority tags (`DELEGATED:` or `PERSONALIZATION:`) at the same quote
   depth in one blockquote are an error. Two ruleset tags are also an error
   in that position (§2c).
7. Ruleset tags are separate from authority tags (§2c).

**Diagnostics.** §2c lists the findings for ruleset tags.

| Code | Kind | Reported when |
| --- | --- | --- |
| `AUTHORITY_TAG_OVERLAP` | error | One blockquote holds two authority tags at the same quote depth (rule 6). |
| `PERSONALIZATION_TAG_DANGLING` | error | A `> PERSONALIZATION:` tag names no question declared in `personalization.json`, or names no id. |

## 2a. The responsibility boundary

One test decides which statements must be Fixed and which MAY be Delegated.
The test is **whether a difference between two builds changes play in a way a
player can observe**.

**The three cases.**

| Difference between two builds | Owner | What the package does |
| --- | --- | --- |
| A player could notice it, and it changes how the game plays. | The designer. The difference is part of the design. | The package MUST settle it, by its value or by its target. To settle it by its value, the package states the exact value. To settle it by its target, the package states what must be achieved, in a rule, a test or a sentence. An open number (§4) is settled by its target. |
| A player could notice it, and it does not change how the game plays. Examples: the lighting of a room, the speed of a win animation that does not change the moment at which play continues. | The designer, who MAY delegate it. | An untagged statement about it is Fixed (§2). What the package does not state about it is the builder's choice. |
| No player could notice it. | The builder. How the game is made is the builder's craft. | Nothing. |

*The Handbook chapter [Tuning](https://opengdd.org/handbook/tuning/) shows
how to write the target of an open number.*

**Changes how the game plays.** A difference changes how the game plays when
it changes at least one of these:

- what the player can do
- what the player knows at the moment of a decision
- the state of the game, or the result of an action
- when something happens, or how much time the player has to act
- whether the player succeeds or fails

A Delegated passage (§2) settles a difference of the first case when the
passage states the target and the limits of the decision. The builder then
chooses inside those limits. A Delegated passage that states no target does
not settle such a difference.

When a package does not settle a difference of the first case, the package
does not conform (§1). The format does not define what a builder does with
such a package.

A difference in the picture, the sound, the camera or the feedback changes
how the game plays only when it changes one of these. An example is a sound
that tells the player where an enemy is. A human reader decides whether a
difference changes one of these (§2d).

Art direction (§9) can constrain an area of the second case without settling
it exactly. Art direction states targets and leaves the method to the builder.

The rendering technique is an area of the second case, as long as the
technique changes none of the five things listed above. The manifest's
`platform` (§3) names the state space: the set of game states the design is
responsible for. The state space is what the game must keep track of. It is
not what the game looks like. Unless the package states otherwise, how the
builder draws the state space is the builder's choice. A `web-2d` world can
use flat sprites or perspective 3D graphics, provided every Fixed and
constrained claim still holds.

**Decisions of the format.** Three decisions belong to neither the designer
nor the builder, but to the format itself. They are the algorithm of the
pseudo-random number generator (PRNG), the seed address and the tie-break
rule. The tie-break rule requires a stated tie-break for every rule of the
game that needs one. The designer writes each tie-break.

**PRNG algorithm.** *For builders and tool makers. This part ends at "Seed
address".* The algorithm applies to every seed address that a package
declares. It does not apply to a package that declares no seed addresses.
Seeds are strings.

1. Take the exact UTF-8 bytes of the canonical text of the seed address (see
   "Seed address").
2. Hash the bytes with 32-bit FNV-1a. The hash starts at 2166136261. For each
   byte in order, XOR the byte into the hash, then multiply the hash by
   16777619, modulo 2^32.
3. The hash is the first 32-bit state of Mulberry32.
4. Each draw computes one 32-bit output from the state, with the step below.
   All arithmetic is on unsigned 32-bit integers modulo 2^32. `>>` is an
   unsigned right shift.
5. A draw's random fraction is `output / 2^32`, from 0 up to but not
   including 1.

```text
state  = state + 0x6D2B79F5
t      = state
t      = (t XOR (t >> 15)) * (t OR 1)
t      = t XOR (t + (t XOR (t >> 7)) * (t OR 61))
output = t XOR (t >> 14)
```

Test vector: the address `run-7:floor:3:stream:layout` hashes to 4017432963.
Its first three outputs are 4042996725, 800292634 and 1191066004.

**Seed address.** A seed address has this canonical text grammar.

```text
address = seed *( ":" unit ":" index ) [ ":stream:" stream ]
unit    = lowercase-kebab-name
index   = "0" | [ "-" ] nonzero-digit *digit
stream  = lowercase-kebab-name
```

**Parts of an address.**

| Part | Holds |
| --- | --- |
| `seed` | The run's seed string, written into the address text exactly as it is. A seed MUST NOT contain `:`. |
| `unit` | A lowercase kebab-case name. |
| `index` | An integer. It MUST NOT have a `+` sign, leading zeroes, or the spelling `-0`. |
| `stream` | A lowercase kebab-case name. |

**Address forms that the format names.**

| Form | Example | Rule |
| --- | --- | --- |
| Several `unit:index` components | `{seed}:chunk-x:-4:chunk-y:7:stream:terrain` | An address can carry more than one component. |
| Nested ordinal units | `{seed}:arena:2:wave:4:spawn:7:stream:choreography` | Ordinal units can nest. |
| Floor | `{seed}:floor:{n}` | `n` is non-negative. |
| Root stream | `{seed}:stream:layout` | A root stream has no `unit:index` component before it. It is allowed only when the package declares it. |

An address holds only the parts of the grammar above. It holds no free-form
path segment.

**Rules for seed addresses.** A package can declare seed addresses. These
rules apply to a package that does.

1. The package MUST declare four things about its addresses:
   - every unit and named-stream template
   - each index's meaning and origin
   - whether a unit accepts signed coordinates or only non-negative ordinals
   - the order in which draws are consumed inside a sequential stream
2. The four declarations of rule 1 are prose obligations (§2d). The package
   meets them in its own chapters. The format defines no machine-readable
   field for them.
3. People who read the chapters decide whether a package has named every unit
   and fixed every draw order.
4. The same address and Fixed consuming procedure MUST produce the same result
   in every build. The consuming procedure is the procedure that uses the
   draws of an address to produce a result, such as a generated level or the
   choice of one item from a weighted list.
5. With a Delegated consuming procedure, replay is deterministic only within
   one build, under the Fixed rules of that build.
6. So a package MUST NOT require the same artifact hash from every build
   while it delegates the procedure that creates the artifact.

*The Handbook chapter
[Seeds and repeatable randomness](https://opengdd.org/handbook/seeds/) shows
a chapter passage that declares a seed address.*

**Tie-break rule.** Some rules force a choice, for example:

- which target
- which order
- what happens when two conditions trigger at the same time
- which of two equal distances is chosen

A rule needs a tie-break when two or more results are equally valid under the
rule and a player could notice which result is chosen. The tie-break is the
rule that decides the choice. Every such rule MUST have a stated tie-break.
The package states the tie-break in the rule itself, or once in a Fixed
statement that covers the rule. An example of a statement that covers many
rules is "When two candidates are equal, the candidate that was created first
is chosen."

When review mode is requested, a validator MAY point out passages where a
tie-break seems to be missing. It finds them with heuristics that depend on
the language of the prose. Such a hint can appear for a passage whose
tie-break is stated in another place. A hint does not decide conformance
(§2d).

**Diagnostics.** The published validator reads `02-mechanics.md` in review
mode and reports these hints. It looks for English words and phrases. When
the prose is in another language, it can fail to find a missing tie-break.

*This table is for reading validator reports.*

| Code | Kind | Reported when |
| --- | --- | --- |
| `TIE_BREAK_CHOICE` | hint | A Fixed paragraph describes a choice, and the validator finds no stated tie-break in the paragraph. |
| `TIE_BREAK_SHARED_CEILING` | hint | A Fixed paragraph describes a limit that several things share, such as an upper limit on a total. The validator finds in the paragraph no rule that says how the limit is divided among them, and no other rule that decides the result, such as a tie-break or a stated order. |

## 2b. Package lifecycle

Three stages describe how far a package has been proven. The stages are
stated in terms of certified builds. They apply only as far as the
experimental certification protocol applies (§2d).

| Stage | The package is in this stage when |
| --- | --- |
| **Draft** | No build has ever been certified from it. |
| **Proven** | At least one certified build exists. |
| **Hardened** | At least two independent builders have certified builds. |

A complete package (§1) can be in the stage Draft. The stage says only that
no build has been certified from the package.

**Ambiguity reports.** An ambiguity report is a convention for recording an
ambiguity in a package. The report says three things:

- what the builder found
- what the package left open
- which package revision the report is about

The format does not standardize the report's shape. When an acceptance test
does not pass, the build record lists the test in
`evidence.acceptance.not_passed` (§7). When the cause is an ambiguity, the
entry's `reason` MAY say where the package was ambiguous, or where to find the
ambiguity report.

## 2c. Rulesets

A ruleset is one complete set of active rules, and play can change from one
ruleset to another. A chapter declares a ruleset with a `> RULESET: <id>` tag.
Rulesets are optional.

A ruleset is not a time mode (§4b). A ruleset is about which rules are
active, and a time mode is about how time passes.

**Example.**

```markdown
> RULESET: act-two
>
> Guards patrol in pairs.
>
> > DELEGATED: Choose the music for act two.

The player has three lives.
```

**The tag line.** A ruleset tag line has the form `> RULESET: <id>` or
`> RULESET: <id> (initial)`.

| Part | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `<id>` | A kebab-case ruleset id, other than `all` | Yes | The ruleset that the blockquote belongs to. |
| `(initial)` | The text `(initial)`, after the id | No | The mark of the initial ruleset (rule 5). Example: `> RULESET: act-one (initial)`. |

No other text is allowed on a ruleset tag line.

**Rules.**

1. A ruleset tag covers its blockquote, by the same rule as every tag (§2).
2. A ruleset tag in a nested quote applies to that nested quote. The innermost
   ruleset tag decides the ruleset of each line.
3. Text outside every ruleset applies in all rulesets.
4. A tag that repeats a ruleset id continues the same ruleset. It does not
   declare a second ruleset.
5. In a package with at least one ruleset tag, exactly one tag MUST add
   `(initial)` after the id.
6. Two ruleset tags at the same quote depth in one blockquote are an error.
7. A ruleset tag does not change authority. An authority tag does not change
   the ruleset.
8. The tags' scopes show which statements are shared and which belong to a
   ruleset. No check produces a list of these statements.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `RULESET_TAG_SHAPE` | error | A ruleset tag line does not have the form in the tag-line table, or its id is `all`. |
| `RULESET_INITIAL` | error | The package has ruleset tags, and no tag carries `(initial)`, or more than one does (rule 5). |
| `RULESET_TAG_OVERLAP` | error | One blockquote holds two ruleset tags at the same quote depth (rule 6). |

**Not in this version.**

- A tag cannot state which rulesets exclude each other or which rulesets play
  can reach. An example is "these two rulesets are never active at the same
  time."

## 2d. Conformance layers and certification status

This section defines the three layers of checks on a design. Package
conformance and build-record conformance are normative. Build certification
is an experimental protocol, and this version defines no normative outcome
for it.

*For designers.* A package can have no validator errors and still not
conform. Some rules are prose obligations, and a human reader decides those.
Validation does not check whether a finished build implements its package.
The experimental certification protocol judges that, and it decides no
conformance outcome.

*[Get started](https://opengdd.org/get-started/) shows how to run the
published validator on a package. The Handbook chapter
[What validation proves](https://opengdd.org/handbook/how-checking-works/)
explains the three layers, the kinds of finding and the safety scan. The
Handbook chapter
[Before you send it to the builder](https://opengdd.org/handbook/before-handoff/)
lists what a person checks by reading the package.*

**The layers.**

| Layer | Question | Who or what decides it | Decided from | Status |
| --- | --- | --- | --- | --- |
| Package conformance | Is the design correct as written? | Validation, and a human reader for prose obligations | The package bytes alone (the exact contents of the package files) | Normative |
| Build-record conformance | Is the builder's report coherent, and did every package test pass? | Validation of the record's shape, its arithmetic and its consistency with the source package | The record and package bytes alone (the exact contents of their files) | Normative |
| Build certification | Is the report true in the finished game? | The runner profile and the audit profile of [the experimental certification protocol](conformance/CERTIFICATION.md) | Running the build and reviewing its evidence | Experimental |

A runner is a person or a program that executes acceptance tests (§6) on a
finished build.

Conformance has only two subjects: the package and the build record. This
document also calls a validator or a runtime outcome conforming. That means
only that the validator or the outcome follows the rules that this document
states for it. Neither is a third subject of conformance.

**Findings.** There are two severities, and only two: error and warning. Hints
and safety notices are not severities.

| Kind | Meaning | Effect | List in the published report |
| --- | --- | --- | --- |
| error | The package or the build record does not conform. | Decides the result | `findings` |
| warning | Something worth looking at | Decides nothing | `findings` |
| hint | An optional suggestion for review that depends on the language of the prose | Decides nothing | `hints` |
| safety notice | Material that a person should inspect before giving the package to an agent that can use tools | Decides nothing | `safety` |

"Hard failure", "validation failure" and "validation error" all mean an error.
A hint or a safety notice is never counted as a warning and never changes the
result or the command-line exit code.

*The rest of this section is for builders and for makers of validators,
runners and audit tools.*

1. A validator produces hints only in review mode. The command-line
   validator enters review mode with `--review`.
2. The command-line validator runs the safety scan by default when it
   validates a package.
3. Build-record validation produces neither hints nor safety notices.
4. The published validator's report always carries the three lists, and its
   `summary` counts each list. `findings` holds the errors and the warnings,
   `hints` holds the hints, and `safety` holds the safety notices. Another
   validator MAY use another report form.
5. In the report, each safety notice carries the field `severity` with the
   value `warning`. This value does not make the notice a warning. The notice
   is in the `safety` list, so it is a safety notice, and it is not counted
   as a warning.
6. `conformance/INJECTION-LINT.md` defines the safety scan:
   - its six codes and the fields of a notice
   - the `INJECTION_SCAN_SKIPPED` notice for a file it could not read
   - the limit that some signals read only English phrases, which the
     published validator states with its safety notices

**Package conformance (normative).** A package conforms when both of these
are true:

- it satisfies every package-level MUST in this document
- these machine files validate against their published v0.9 schemas:
  `manifest.json`, `tuning.json`, and, when present, `personalization.json`,
  `direction.json`, `clocks.json` and each collection's `_collection.json`
  (§1b)

A package-level MUST is decided from the package bytes alone: the exact
contents of the package files. A machine or a human reader decides it,
without running anything and without any state outside the package. A MUST
about build behavior, cross-build stability or test execution belongs to
build-record conformance or to the experimental certification protocol.

**The two kinds of package-level rule.**

| Kind | Examples | Decided by | A violation |
| --- | --- | --- | --- |
| Machine-decidable rule | Schema validity, completeness, shape grammar, cross-file consistency | Validation | A validator error is a conformance failure. |
| Prose obligation | The tie-break rule (§2a). Normative prose cites a tuning key and does not repeat its value (§1). | A human reader, with judgment where needed | A violation is a conformance failure too. A validator MAY point out a likely violation as an optional hint. |

A hint does not decide conformance. The absence of hints does not replace the
human review. The published validator implements the machine-decidable part of
package conformance. A command-line result with zero errors shows only that
the checks of the validator passed. It does not show full package conformance.
Package conformance is defined by the rules of this document, not by the
coverage of any one tool.

**Build-record conformance (normative).** `opengdd-build.json` is the
builder's report. Validation does not audit whether the report is true. A
valid record checked against its source package has the outcome *Conforming*,
*Incomplete* or *Not verified*. An invalid record does not conform.

A record can be validated without its source package. If it then has no errors
of its own, it gets the outcome *Not checked*, because the package-consistency
checks could not run. The outcome *Not checked* is not a passing result.

§7 defines each outcome and its exit code. In an incomplete record, the
`not_passed` entries and any ambiguity reports (§2b) say what is still
unresolved.

**Build certification (experimental).** Certification would be the audited
claim that one particular build faithfully implements its package. The
experimental certification protocol at `conformance/CERTIFICATION.md` holds
two documents, and both are experimental:

- the runner profile: how a named runner executes §6 tests and produces
  observations
- the audit profile: capture recipes, review of §7 evidence and runtime
  values, accounting for every Fixed statement, and the judged entries of
  `pillars`, `mood`, `anti` and `must_keep` in `direction.json` (§9.10)

The audit is the review that the audit profile describes. Where this document
describes certification, it describes the intended shape of the protocol. No
statement grants or withholds a normative certification
outcome. The protocol can record audit findings and experimental results, but
they are not core conformance outcomes. The experimental status changes no
file's shape. `opengdd-build.json` keeps its required fields, including
`evidence`, and packages keep their §6 structural obligations.

**Validation and audit.**

| Claim | What validation decides | What only the audit can confirm |
| --- | --- | --- |
| A conforming record | Every package test is reported as passed. So the record also asserts that every measured promise (§9.6) those tests cover held. | Whether that is true |
| `evidence` | Its shape and its counts only. No build-record check executes a test or reproduces a hash. | That the tests ran as reported and the hashes reproduce |
| A contract definition digest | Nothing. It is not a package rule. | Recomputing it (§10.11) |
| Fixed statements that no test restates | Nothing | Whether the build keeps them (§6) |

A contract's folder rules, adoption-file shape, definition identity, pack
pairing and generated-test shape are machine-decidable package-level rules,
decided from package
bytes (§10). Package validation recomputes the pack digest from the pack
file's bytes (§10.8).

**Not in this version.**

- a normative certification outcome
- an execution grammar for `test` blocks beyond the package-level field set
  of §6
- a panel protocol for the judged entries of art direction

## 3. manifest.json

The manifest holds the package's identity and its target. It is the
required file `manifest.json` at the package root. It is validated against
[manifest.schema.json](https://opengdd.org/schema/core/v0.9/manifest.schema.json).

**Example.** A complete manifest without `commerce`:

```json
{
  "opengdd": "0.9",
  "id": "getaway-driver",
  "version": "1.0.0",
  "title": "Getaway Driver",
  "designer": { "name": "OpenGDD Examples" },
  "target": {
    "platform": "web-2d",
    "genre": "arcade driving",
    "session_minutes": 5,
    "audience": "anyone; one hand on the keyboard"
  }
}
```

**The manifest.** The manifest is one JSON object.

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `opengdd` | The string `"0.9"` | Yes | The format version that this document defines. |
| `id` | A kebab-case string (§1) | Yes | The package id. |
| `version` | A version string (below) | Yes | The version of this package. |
| `title` | A non-empty string | Yes | The name of the game. |
| `designer` | An object (below) | Yes | The designer of the game. |
| `target` | An object (below) | Yes | The game's target. |
| `commerce` | An object (below) | No | Commerce metadata. |

No other field is allowed in the manifest or in any object inside it.

**Version strings.** `version` and `commerce.derived_from.version` use one
grammar, `MAJOR.MINOR.PATCH`:

- exactly three non-negative decimal integers, separated by dots
- each integer is `0` or begins with a digit from `1` to `9`
- no prerelease suffix and no build suffix

**`designer`.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `name` | A non-empty string | Yes | The designer's name. |
| `handle` | A string | No | The designer's registry handle. |
| `contact` | A string | No | Contact details. |

**`target`.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `platform` | `web-2d` or `web-3d` | Yes | The delivery target and the state space (§2a) the designer is responsible for (rule 4). |
| `genre` | A non-empty string | Yes | The genre family. |
| `session_minutes` | A number, `0` or more | No | The session length in minutes. |
| `audience` | A string | No | The audience. |

`web-2d` and `web-3d` are the only values of `platform` in this version.
Target families beyond web delivery are excluded (§11).

**`commerce`.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `license` | `opengdd-share-v0` | Yes | `opengdd-share-v0` records proposed building and deployment terms under the declared split. |
| `split` | An object (below) | Yes | The designer's share and the builder's share, in percent. |
| `derived_from` | An object (below) | No | **Reserved.** The package this package was derived from. It has no effect in this version. |

**`split`.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `designer` | A number from `0` to `100` | Yes | The designer's percentage. |
| `builder` | A number from `0` to `100` | Yes | The builder's percentage. |

**`derived_from`.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `id` | A kebab-case string | Yes | The id of the package this package was derived from. |
| `version` | A version string (above) | Yes | The version of that package. |

**Rules.**

1. Only a release changes the value of `opengdd`, together with the schema
   URLs (§3a). Drafting work between releases does not change it.
2. Core conformance does not require a package id to be unique across all
   packages. A catalog or registry MAY require uniqueness within its own
   declared domain.
3. The manifest declares identity, target and optional commerce metadata,
   and nothing else. Other parts of the package declare themselves:
   - chapters and optional files by their presence (§1)
   - adopted contracts (§10.1) and collections (§1b) by their folder
     contents
   - rulesets by prose tags (§2c)
4. A game whose world is a plane declares `web-2d`, however a build draws
   the world. `web-3d` is for a game whose state itself needs three
   dimensions.
5. The rendering technique is never part of `platform`. Under §2a's boundary,
   the rendering technique is the builder's choice unless the package states
   otherwise. The build record does not record it (§7).
6. `commerce` is OPTIONAL core metadata. Package conformance is the same
   when the package bytes are offered, listed, built by a third party or kept
   internal. None of these uses makes `commerce` required.
7. A publication profile or a commerce profile MAY impose requirements
   within its own declared scope. Those requirements are outside core
   conformance.
8. The presence or absence of `commerce` MUST NOT change how the gameplay is
   expressed, or any authority level. This is a prose obligation (§2d).
9. Under the experimental certification protocol (§2d), `commerce` does not
   change a build's certification status.
10. The percentages `split.designer` and `split.builder` MUST sum to 100.
11. The core format validates the shape of `commerce`, not whether it grants
    legal permission or whether a distribution satisfied its terms.
12. The rules for `commerce` belong to the commerce profile. They change the
    meaning of no core file.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `MANIFEST_JSON` | error | `manifest.json` does not parse as JSON. |
| `MANIFEST_SCHEMA` | error | The manifest breaks `manifest.schema.json`. |
| `COMMERCE_SPLIT` | error | `split.designer` and `split.builder` are finite numbers, and their sum differs from 100 by more than 1e-9. |
| `SCHEMA_JSON` | error | The validator's own copy of `manifest.schema.json` does not parse as JSON. |

**Not in this version.**

- An effect of `derived_from`.
- Fork licensing and royalties. They are outside the core format.
- A way to certify modifications beyond the declared personalization bounds
  under the experimental certification protocol.

## 3a. Canonical schema URLs

Every published schema is identified and served at a canonical URL. The URL
has this form:

```text
https://opengdd.org/schema/<layer>/v<minor>/<file>.schema.json
```

**Example.**

```text
https://opengdd.org/schema/core/v0.9/manifest.schema.json
```

**The schemas.** The `core` layer publishes seven schemas.

| Schema | Validates | Section | URL |
| --- | --- | --- | --- |
| `manifest.schema.json` | `manifest.json` | §3 | `https://opengdd.org/schema/core/v0.9/manifest.schema.json` |
| `tuning.schema.json` | `tuning.json` | §4 | `https://opengdd.org/schema/core/v0.9/tuning.schema.json` |
| `clocks.schema.json` | `clocks.json` | §4b | `https://opengdd.org/schema/core/v0.9/clocks.schema.json` |
| `personalization.schema.json` | `personalization.json` | §5 | `https://opengdd.org/schema/core/v0.9/personalization.schema.json` |
| `collection.schema.json` | The schema file of a collection, `_collection.json` | §1b | `https://opengdd.org/schema/core/v0.9/collection.schema.json` |
| `direction.schema.json` | `direction.json` | §9 | `https://opengdd.org/schema/core/v0.9/direction.schema.json` |
| `opengdd-build.schema.json` | The build record, `opengdd-build.json` | §7 | `https://opengdd.org/schema/core/v0.9/opengdd-build.schema.json` |

No schema is published for a contract adoption file. §10 states the shape of
the adoption file, and a validator implements it.

**Rules.** Rules 1 to 3 apply to the schema publisher, not to packages. They
are outside package conformance.

1. **The schema layer comes before the version.**
   - Each schema layer has its own independent version.
   - `core` is the only schema layer in this version.
   - The URL layout MUST NOT imply that different schema layers share one
     version.
2. **The version segment uses the format version.**
   - The segment is `v` followed by the manifest's `opengdd` value. A schema
     under `/core/v0.9/` validates manifests that declare `"opengdd": "0.9"`.
   - A schema URL contains the major and minor version numbers. It leaves out
     the patch number.
   - Patch-level corrections are published as errata at the same URL.
   - An erratum MUST NOT change whether any file is accepted or rejected.
   - An erratum MUST be published with a dated change record.
   - A correction that changes whether a file is accepted needs a new schema
     version and a new URL.
3. **Published URLs are permanent.**
   - A newer version at a new URL MAY supersede a schema.
   - The existing URL of a schema MUST NOT be repurposed or removed.
   - The content served at a published URL does not change, except for
     errata (rule 2).
   - Each released version of the specification text is published at
     `/spec/v<N>/`. That URL MUST NOT be repurposed or removed.
4. **There is no floating alias.** A floating alias is an address whose
   target version changes over time.
   - Documents MUST reference an explicit version. This is a prose
     obligation (§2d).
   - The format defines no `/latest/` URL.

## 4. tuning.json

`tuning.json` holds the package's shared numbers, the ranges in which some of
them can move, and the rules that keep them consistent. It is a required file
at the package root. It is validated against
[tuning.schema.json](https://opengdd.org/schema/core/v0.9/tuning.schema.json).

**Example.**

```json
{
  "values": {
    "dash.duration_seconds": 0.15,
    "dash.cooldown_seconds": 0.6,
    "tile.size_units": 16
  },
  "open": {
    "dash.speed_tiles_per_second": 12,
    "dash.recovery_seconds": null
  },
  "ranges": {
    "dash.speed_tiles_per_second": [8, 20],
    "dash.duration_seconds": [0.1, 0.3],
    "dash.cooldown_seconds": [0.3, 1.5]
  },
  "rules": {
    "no-dash-while-dashing": "dash.cooldown_seconds >= dash.duration_seconds",
    "dash-covers-a-tile": "dash.speed_tiles_per_second * dash.duration_seconds >= 1"
  }
}
```

**The file.** `tuning.json` is one JSON object.

| Field | Holds | Required | Defined in |
| --- | --- | --- | --- |
| `values` | A flat map from tuning keys to finite JSON numbers | Yes | "Values" |
| `open` | A flat map from tuning keys to a finite JSON number or `null` | No | "Open numbers" |
| `ranges` | A flat map from tuning keys to `[minimum, maximum]` pairs | No | "Ranges" |
| `rules` | A map from rule names to rule lines | No | "Rules" |

No other field is allowed at the top level. `clocks.json` declares time modes,
clocks and runtime values (§4b). `tuning.json` has no field for them.

**Number kinds.** The three number kinds are separate from the three
authority levels of §2.

| Kind | Stored as | What it says |
| --- | --- | --- |
| decided | A key in `values` without a range | "It is 3. Build it that way." The number is fixed as written. |
| ranged | A key in `values` with an entry in `ranges` | "The builder can choose any value inside this range." A builder, a later rebalance or a personalization answer (§5) MAY change the number within its range. A rebalance is a change of the number that the designer makes in a later revision of the package. For one build, a personalization answer that sets the number decides it. When no answer sets the number, the builder chooses it. |
| open | A key in `open` | "My guess is 3. Find what works." The package has not decided the number. Each build supplies it, inside its range when it has one. An open number that changes how the game plays needs a target: a statement of what the number must achieve (§2a). |

No field of `tuning.json` declares a number as ranged. A range on a `values`
key makes the number ranged. The word `tunable` describes a ranged number, and
it is never a declaration or a category in `tuning.json`.

**Where numbers are kept.**

1. Every number that the package cites as shared gameplay data is stored
   under a key in `values` or `open`.
2. A number that belongs to one piece of content is kept on that content's
   collection record (§1b). This includes a measurement of the content. It
   also includes a fact that a program derives from the content, such as the
   smallest number of moves that a puzzle solver finds (§7a).
3. A value declared by an adopted contract is stored in that adoption. It is
   part of the resolved tuning snapshot (§5), under the reserved `contracts.`
   namespace (§10.4, §10.9).

**Other numbers that are not kept in `tuning.json`.**

| Number | Where it is kept |
| --- | --- |
| A number that only says how many of something there are, and that nothing else in the package needs to refer to | It MAY stay in Fixed prose. An example is a mechanics chapter that says a run lasts three rounds. When a rule line, a range, a personalization answer, a contract, a collection field or a test needs that count, the count is stored under a key. The rules above decide where the key is kept. A number that only sets up a test stays with the test. |
| Test inputs and seeds | With the acceptance test (§6). |
| Sample counts | In the runner profile. |
| Schedules, expected observations and tolerances | With the test or its replay. |
| Inputs that a contract pack declares for a test | In the adoption's `verification` map. They are included in the generated test (§10.7). |
| A number in an example or in an identifier | It decides no number that a build uses, wherever it is written. |

**Tuning keys.** A tuning key is a key of `values`, `open` or `ranges`.

1. It has two or more segments, joined by single dots.
2. Each segment holds only `a` to `z`, `A` to `Z`, `0` to `9`, `_` and `-`. A
   segment MUST NOT begin or end with `-`. This is the tuning-key segment
   grammar.
3. The first segment MUST NOT be a reserved first segment. The reserved first
   segments are `pillars`, `mood`, `anti`, `must_keep`, `colors`, `contrast`,
   `timing`, `values`, `ranges`, `rules`, `runtime`, `clocks`, `manifest`,
   `build`, `contracts`, `palette` and `collections` (§12.2). A segment in
   any position MUST NOT be a reserved extension. The reserved extensions are
   `json` and `md`.
4. At least one segment MUST contain a character that is not a digit.

`hazard.interval_seconds`, `lane.count` and `level.2` are tuning keys. A
single word is not a tuning key, and neither is `1.2`.

**The reserved list is versioned.** *For validator makers.*

1. A later revision of this format MAY add a segment to the list when a new
   mechanism needs it.
2. A validator rejects every key that starts with a reserved first segment,
   not only a newly reserved one.
3. The finding names the reserved segment and the format revision recorded for
   it.

   | Reserved first segments | Recorded revision |
   | --- | --- |
   | `palette`, `collections` | 0.6 |
   | `values`, `ranges`, `rules`, `runtime`, `colors`, `contrast`, `timing` | 0.7 |
   | Every other reserved first segment | The current format version |

4. The finding MAY suggest another key. The published validator suggests the
   same key with `feel` instead of the reserved first segment. For
   `palette.ink_seconds`, it suggests `feel.ink_seconds`.

**Arithmetic.** *For designers who write rules in `tuning.json`, and for
validator makers.* The rules in `rules` (see "Rules") compute with this
numeric model.

1. Numbers are 64-bit binary floating-point numbers (IEEE 754 binary64).
2. Each operation rounds its result to the nearest such number, with ties to
   even.
3. Operators of equal precedence apply from left to right. `8 / 2 / 2` is
   `2`.
4. Comparisons are exact. `0.1 + 0.2 == 0.3` is false.
5. Division by zero is an evaluation error, and so is any result that is not
   finite. A rule with an evaluation error cannot be computed.

*The Handbook chapter [Tuning](https://opengdd.org/handbook/tuning/) explains
why `0.1 + 0.2 == 0.3` is false.*

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `TUNING_JSON` | error | `tuning.json` cannot be read or does not parse as JSON. |
| `TUNING_SCHEMA` | error | `tuning.json` breaks `tuning.schema.json`. |
| `TUNING_SHAPE` | error | The top level is not an object, or it holds a field other than `values`, `open`, `ranges` and `rules`. Or `values` is missing or is not an object. Or `open`, `ranges` or `rules` is present and is not an object. |
| `TUNING_KEY` | error | A key of `values`, `open` or `ranges` breaks tuning-key rule 1, 2 or 4. |
| `TUNING_KEY_RESERVED` | error | A key of `values`, `open` or `ranges` breaks tuning-key rule 3. The finding names the segment and its recorded revision. |
| `SCHEMA_JSON` | error | The validator's own copy of `tuning.schema.json` does not parse as JSON. |

### Values (`values`)

`values` is required. It holds the shared numbers that the package decides.

**Shape.** `values` is one flat map. Each key is a tuning key. Each entry is a
finite JSON number. A string, a Boolean, an object, an array, `null` or a
number that is not finite is an error.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `TUNING_NUMBER` | error | A `values` entry is not a finite JSON number, or an `open` entry is neither a finite JSON number nor `null`. |

### Open numbers (`open`)

`open` holds the numbers that the package has not decided. `open` is
optional.

**Shape.** `open` is one flat map. Each key is a tuning key. Each entry is one
of these:

- a finite JSON number, which is the designer's guess
- `null`, which means that there is no guess

**Rules.** A key MUST NOT appear in both `values` and `open`.

**Diagnostics.** A wrong entry type is reported as `TUNING_NUMBER` (see
"Values").

| Code | Kind | Reported when |
| --- | --- | --- |
| `TUNING_OPEN_OVERLAP` | error | A key appears in both `values` and `open`. |

### Ranges (`ranges`)

`ranges` sets the inclusive bounds within which a number can move. `ranges`
is optional.

**Shape.** `ranges` is one flat map. Each key is a tuning key. Each entry is
an inclusive `[minimum, maximum]` pair of two finite JSON numbers.

**Rules.**

1. The minimum MUST NOT be greater than the maximum.
2. Every key of `ranges` MUST exist in `values` or `open`.
3. A `values` number MUST be inside its own range.
4. An open number's guess, when it has one, MUST be inside its own range.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `TUNING_RANGE` | error | An entry is not a pair of two finite numbers, or its minimum is greater than its maximum. |
| `TUNING_RANGE_KEY` | error | A key of `ranges` exists in neither `values` nor `open`. |
| `TUNING_RANGE_VALUE` | error | A `values` number or an open guess is outside its inclusive range. |

### Rules (`rules`)

A rule is a relation between numbers that has to stay true for every tuning
of those numbers. `rules` is optional.

**Shape.** `rules` is one map. Each key is a stable kebab-case rule name. Each
entry is one rule line: a non-empty string on one line. Prose cites a rule as
`rules.<name>` (§12.2).

**The rule line.** A rule line is one comparison between two sides. Each side
is arithmetic over numbers and addresses. A rule line is not a rule of the
game. Game rules are written in chapters. This table lists every form that a
rule line can hold.

| Form | Written as | Meaning |
| --- | --- | --- |
| Comparison | `<side> <op> <side>`, where `<op>` is one of `==`, `!=`, `<`, `<=`, `>`, `>=` | The rule holds when the comparison is true. A rule line holds exactly one comparison. |
| Number | A literal number, such as `1` or `0.15` | That number. |
| Tuning key | A key of `values` or `open` | The number stored under the key. |
| Record field | `collections.<collection>.<record>.<field>` | The number in that field of that record (rule 2). |
| Sum and difference | `a + b`, `a - b` | Addition and subtraction. |
| Product and quotient | `a * b`, `a / b` | Multiplication and division. They apply before `+` and `-`. |
| Negation | `-a` | The negative of `a`. |
| Parentheses | `( a )` | Grouping. Use parentheses for any order other than the precedence above. |
| `min` | `min(a, b, …)`, with one or more arguments | The smallest argument. |
| `max` | `max(a, b, …)`, with one or more arguments | The largest argument. |
| `floor` | `floor(x)`, with exactly one argument | `x` rounded down. |

**Rules.**

1. A rule reads keys from `values` and `open`.
2. A rule also reads a top-level record field that holds a number, by the
   field's full address. The field qualifies in these cases:
   - in a collection with a record schema, a field of type `number` or
     `integer`
   - in a collection without a record schema, any top-level field whose
     value is a finite number
3. A record-field address MUST name a field that is present in that record.
   The field MUST be numeric.
4. A hyphen inside a dotted name belongs to the name. To subtract, put a
   space before the minus.

**Pins.** A pin decides one record's value in an open field (§1b). For
example, `collections.enemies.swarmer.hull == 1` pins the open field `hull`
of the record `swarmer`. The pin does not change the record: the field in
the record still holds a guess or `null`. A pin is a rule with all of these
properties:

- its comparison is `==`
- one side is one open record address alone, with or without parentheses
- every address on the other side is in the base (below), and that side can
  also hold literal numbers

An equality without this shape is an ordinary rule.

*The Handbook chapter [Collections](https://opengdd.org/handbook/collections/)
shows a rule that reads a record field, and a pin.*

A rule that is false over numbers that the package decides produces an
error. A rule that is false over guesses produces a warning. *The parts
"Environments" and "Evaluation" are for readers who need the exact
evaluation of rules.*

**Environments.** Package validation checks the rules over two sets of
numbers: the authored numbers, and the package defaults (see "Package
defaults"). The authored numbers are the numbers as they are written in the
package. Each set is an environment. A pin computes the number of its open
record field from the other side of its comparison. The base of an
environment holds the numbers that a pin can use as input:

- its `values` numbers
- the numbers in record fields that are not open
- in the package defaults only, the open tuning numbers that a default answer
  sets

Guesses are not in the base. A number that a pin produces is not in the base.

**Evaluation.**

1. Pins are evaluated separately in each environment.
2. Every pin is computed from the same base. The base does not change while
   the pins are computed, so a number that one pin produces is never an
   input to another pin. The order of the rules does not matter.
3. The numbers that the pins produce are then added to the environment.
   Every rule is checked with them.
4. Two pins for the same record field MUST give the same number.
5. A pin for an `integer` field MUST give a whole number.
6. In each environment, a rule is evaluated when every number it names is
   decided by the package in that environment. A decided number is a number
   in the base or a pinned record number. Over decided numbers:
   - a false comparison is an error
   - a rule that cannot be computed is an error
7. Guesses are checked too, and a guess produces warnings only. The validator
   also evaluates a rule with the available guesses, in `open` and on
   collection records, instead of the numbers that the package has not
   decided. Over guesses:
   - a false comparison is a warning
   - a rule that cannot be computed because of a guess, for example a guessed
     divisor of `0`, is a warning
   - a guess never makes package validation fail
8. A rule can name a number that has neither a decided value in the checked
   environment nor a guess. The rule is then not evaluated in that
   environment. The build decides that number (§7).
9. At build-record validation, a pin is an ordinary rule. Every rule MUST
   hold over the recorded numbers (§7). A rule that is false or cannot be
   computed over a build snapshot is a build-record error.
10. The finding for a false rule identifies the rule, its rule line and the
    numbers it used. The published validator writes three lines: the rule
    name with "does not hold", the rule line, and the numbers with the
    computed comparison.
11. The finding for anything wrong with a rule line or its name identifies
    the problem. Examples are an unreadable rule line, an unknown key or
    function, and division by zero over numbers that the package decides.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `TUNING_RULE_INVALID` | error | A rule line or its name has one of these faults. The name is not kebab-case. The entry is not a string. The line cannot be read. The line names an unknown key or an unknown function. The line names a field that breaks rule 3. A pin for an `integer` field gives a fraction (evaluation rule 5). The rule cannot be computed over decided numbers (evaluation rule 6). |
| `TUNING_RULE_FAILED` | error | A rule is false over the numbers that the package decides in one environment (evaluation rule 6). |
| `TUNING_PIN_CONFLICT` | error | Two pins for the same record field give different numbers in one environment. |
| `TUNING_RULE_GUESS_FAILED` | warning | A rule is false when guesses are used instead of undecided numbers (evaluation rule 7). |
| `TUNING_RULE_GUESS_UNCOMPUTABLE` | warning | A rule cannot be computed because of a guess (evaluation rule 7). |
| `BUILD_TUNING_RULE` | error | At build-record validation, a rule is false over the build snapshot, or it cannot be computed over it. Or the rule names a key that has no recorded number, is not a decided record number, and is not in the key set of §7, check 4. A missing key of that set has its own finding in §7, and the rule is then not evaluated. |

### Package defaults

The package defaults are the numbers that result from applying the `default`
of every personalization question through the ordered answer procedure of §5.

**Rules.**

1. A default can set a ranged `values` key or an `open` key.
2. An open key that a default sets counts as decided when the rules are
   evaluated over the package defaults.
3. With no `personalization.json`, the authored `values` stay unchanged. Each
   open entry keeps its guess, or stays without one.
4. When the package defaults equal the authored numbers, the two environments
   of the rule check are the same environment.

**Not in this version.**

- A conformance check that compares two revisions of a package.

### Reading a citation in prose (normative)

The reference forms and the classification of each dotted token in chapter
prose are in §12.2. Every dotted token is classified, even when the designer
did not mean a citation. For example, the file name `` `hero.png` `` in
inline code is classified as a tuning citation. It is an error unless a key
has that name (rule 5 below). Without the backticks, the file name is
ordinary text. This subsection states what happens to a token after
classification.

**Resolution.**

1. A mechanism path is resolved against the file that owns its first
   segment, as §12.2 gives it.
2. A `values.<key>`, `ranges.<key>` or `rules.<name>` token MUST resolve
   against the map of that name in `tuning.json`.
3. A token equal to `runtime`, or one that starts with `runtime.`, MUST have
   the runtime-address shape of §4b.1. Otherwise validation reports
   `PROSE_CITATION_DANGLING`.
4. A tuning citation MUST resolve to a key of `values` or `open`. An open
   number is cited by its bare key, like a `values` key.
5. A token that resolves to nothing is a dangling citation. A dangling
   citation is an error. For example, `clocks.json` is a mechanism path. It
   names no clock (§4b), so it dangles.
6. When `tuning.json` is missing or cannot be read, that file's own finding
   is reported. Tuning citations are then not resolved.
7. A `#` is not a reference when it is not preceded by line start or
   whitespace. A `#` is also not a reference when it is not followed by a
   kebab-case id with at least one letter, as in "the #1 spot".

**Values in prose.**

1. Normative prose cites a shared number by its key. It does not repeat the
   value (§1). This is a prose obligation (§2d).
2. The same obligation applies to a contract value. Prose cites
   `contracts.<adoption>.<value>`, not the number (§10.9).
3. A human reader decides whether a sentence states such a requirement and
   repeats one of these values.
4. In review mode, a validator MAY point out prose numbers that equal decided
   `values`. The published validator reports them as hints. It never
   compares prose numbers with the guesses in `open`.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `PROSE_CITATION_DANGLING` | error | A tuning citation names no key of `values` or `open`. Or a `values.`, `ranges.` or `rules.` token names no entry of that map. Or a `palette.` token resolves to no palette and no named color (§9.1). |
| `PROSE_TUNING_LITERAL` | hint | In review mode, a number in chapter prose equals a number in `values`. |

## 4b. Runtime values, time modes, and clocks

### 4b.1 Runtime values

A runtime value is something that changes during play and that the package
names, so that prose, tests and clocks can refer to it. Its address does not
declare the type of the value. §12.2 lists where a runtime address is legal.

**The address.** A runtime address is `runtime.` followed by one or more
segments, joined by single dots.

| Part | Holds |
| --- | --- |
| Each segment | One or more of `a`–`z`, `A`–`Z`, `0`–`9`, `_` and `-`. It does not begin or end with `-`. No segment is empty. This is the tuning-key segment grammar (§4). |

`runtime.oxygen_seconds`, `runtime.case_facts.gallery_argument`,
`runtime.HP` and `runtime.hp-value` are runtime addresses. `runtime.`,
`runtime..hp` and `runtime.-hp` are not.

**Rules.**

1. The chapter sentence that uses a runtime address says what the value is
   and when it is read. The builder chooses the implementation.
2. Using a runtime address in chapter prose, as the whole content of an
   inline code span, declares it.
3. Naming a runtime address in a clock's `advances` array also declares it.
4. Only one rule uses the declaration: rule 2 of §4b.3. It applies to the
   addresses that a test names in `unchanged.values`.
5. An inline code token in chapter prose that is `runtime`, or that starts
   with `runtime.`, MUST be a runtime address.

### 4b.2 Time modes and clocks

A clock is a named source that advances values, such as elapsed seconds or a
turn count. A time mode is a named situation, such as play or a pause, in
which each clock has one behavior. Clocks are optional: a package uses them
by adding `clocks.json` at its root, validated against
[clocks.schema.json](https://opengdd.org/schema/core/v0.9/clocks.schema.json).

**Example.**

```json
{
  "world_clock": {
    "unit": "seconds",
    "advances": ["runtime.scan_progress", "runtime.research_remaining"],
    "modes": {
      "playing": "running",
      "paused": "paused",
      "in-mission": "paused"
    }
  },
  "mission_turn": {
    "unit": "turns",
    "advances": ["runtime.faction_turn"],
    "modes": {
      "playing": "none",
      "paused": "none",
      "in-mission": "steps"
    }
  }
}
```

**The file.** `clocks.json` is a non-empty map from clock names to clock
objects. A clock name uses the tuning-key segment grammar (§4).

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `unit` | A non-empty string | Yes | The unit the clock counts in. |
| `advances` | An array of runtime addresses | No | The runtime values that the clock moves forward. |
| `modes` | A non-empty map from kebab-case mode ids to words (below) | Yes | What the clock does in each time mode. |

No other field is allowed in a clock object. Each value in `modes` is one of
these four words.

| Word | In that mode, the clock |
| --- | --- |
| `running` | Moves continuously. |
| `paused` | Keeps its value and does not move. |
| `steps` | Moves only when a turn or another discrete step is taken. |
| `none` | Has no value. |

**Rules.**

1. The time modes are the union of the keys in every clock's `modes` map.
2. Every clock MUST name every time mode. Because `modes` is a map, a clock
   gives one word for each mode.
3. The `advances` arrays of different clocks MUST be disjoint. No runtime
   address appears in two of them.
4. `clocks.<name>`, with exactly two segments, is the one citable clock
   address. Any other chapter token that starts with `clocks.` dangles.

**Mode tags.** A mode tag, such as `[IN-MISSION]`, is written in a chapter
heading. It can stand anywhere in the heading.

1. A mode tag limits the section under its heading to one time mode.
2. Each tag MUST name a mode id that `clocks.json` declares. The comparison
   ignores letter case.
3. A package without `clocks.json` declares no mode ids, and nothing checks
   its tags.
4. A bracketed word in a paragraph is ordinary text. In a package that
   declares a mode id, every bracketed word in a chapter heading is read as a
   mode tag. The exceptions are a word of digits only and the text of a link.
5. A statement that applies in every mode carries no mode tag. In a package
   that declares at least one mode, `[ALL]`, in any letter case, is an error.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `CLOCKS_JSON` | error | `clocks.json` does not parse as JSON. |
| `CLOCKS_SHAPE` | error | The file or a clock object breaks the shape above, except in a `unit` or in a value of `modes`. The next two rows report those. Or the top level has a key `modes` or `clocks` (Appendix A). |
| `CLOCKS_UNIT` | error | A clock's `unit` is missing, not a string, or only white space. |
| `CLOCKS_MODE_WORD` | error | A value in `modes` is not one of the four words. |
| `CLOCKS_MODE_MISSING` | error | A clock does not name a time mode (rule 2). |
| `CLOCKS_ADVANCES_DISJOINT` | error | Two clocks advance one runtime address (rule 3). |
| `MODE_TAG_DANGLING` | error | A bracketed word in a heading names no declared mode id, or is `[ALL]`. Words of digits only and link texts are not read. The check runs only when a mode is declared. |
| `PROSE_CITATION_DANGLING` | error | A `runtime` token is not a runtime address (§4b.1, rule 5). Or a `clocks.` token is not `clocks.<name>` for a declared clock (rule 4). |
| `PROSE_REFERENCE_DANGLING` | error | An inline-code token in chapter prose starts with `state:` and holds no `<` or `>` (Appendix A). |

### 4b.3 Unchanged during a mode

The optional field `unchanged` of an acceptance test (§6) lists runtime
values that stay the same during named time modes. A `scenario` or `general`
test MAY carry `unchanged`.

**Example.**

```json
{
  "unchanged": {
    "modes": ["paused", "in-mission"],
    "values": ["runtime.scan_progress"]
  }
}
```

**The fields of `unchanged`.** No other field is allowed.

| Field | Holds | Required |
| --- | --- | --- |
| `modes` | A non-empty array of mode ids | Yes |
| `values` | A non-empty array of runtime addresses | Yes |

**Rules.**

1. Every mode MUST be declared in `clocks.json`. A package without
   `clocks.json` cannot carry `unchanged`.
2. Every value MUST be a declared runtime address (§4b.1).
3. During any one continuous period in a named mode, each named value MUST
   read the same at every runner observation. In a later period, the value can
   read differently.
4. A value that a clock advances while the clock is `running` or `steps` in
   a named mode is a warning.
5. A value whose clock is `none` in a named mode is an error.

Validation does not judge whether a finished build keeps these rules. The
experimental certification protocol judges that (§2d).

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `UNCHANGED_SHAPE` | error | `unchanged` breaks the shape above. |
| `UNCHANGED_NO_CLOCKS` | error | The package has no `clocks.json` (rule 1). |
| `UNCHANGED_MODE` | error | A mode is not declared (rule 1). |
| `RUNTIME_UNDECLARED` | error | A value is not a declared runtime address (rule 2). |
| `UNCHANGED_ADVANCES` | warning | A named value moves in a named mode (rule 4). |
| `UNCHANGED_UNDEFINED` | error | A named value has no value in a named mode (rule 5). |

### 4b.4 What the runner owns

Replay schedules and replay actions are runner data, not package vocabulary.
They say which inputs the runner plays back in a test, and when. Package
validation checks only that a test's `replay` (§6) is an object. The core
format gives no meaning to the fields inside that object. The runner profile
of [the experimental certification protocol](conformance/CERTIFICATION.md)
defines the schedule and action vocabulary that it accepts.

**Not in this version.**

- A standard vocabulary for replay schedules and replay actions.

## 5. Build personalization (`personalization.json`)

Personalization lets one package produce different builds. For each build,
the builder is asked the package's questions, before or while building the
game. A choice that a player makes during play is gameplay state, not build
personalization (see "Answers outside tuning"). The questions are in the
optional file `personalization.json` at the package root, validated against
[personalization.schema.json](https://opengdd.org/schema/core/v0.9/personalization.schema.json).

**Example.**

```json
{
  "questions": [
    {
      "id": "hazard_interval",
      "prompt": "How quickly should hazards arrive?",
      "type": "choice",
      "options": [
        { "id": "steady", "label": "Steady", "sets": { "hazard.interval_seconds": 1.2 } },
        { "id": "frequent", "label": "Frequent", "sets": { "hazard.interval_seconds": 0.9 } }
      ],
      "default": "steady"
    },
    {
      "id": "hazard_warning",
      "prompt": "How many seconds of warning should a hazard give?",
      "type": "number",
      "default": 0.5,
      "sets": "hazard.warning_seconds"
    },
    {
      "id": "rival_name",
      "prompt": "What is the rival called?",
      "type": "text",
      "default": "Vex"
    }
  ]
}
```

**The file.** The top level is one object with one field.

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `questions` | An array of question objects. The array can be empty. | Yes | The questions, in the order in which answers are applied. |

No other field is allowed at the top level.

**Questions.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `id` | A non-empty string, unique in the file | Yes | The question id. A question id MUST NOT contain whitespace. A `> PERSONALIZATION: <id>` prose tag (§2) names it. |
| `prompt` | A non-empty string | Yes | The wording of the question that the builder is asked. |
| `type` | `choice`, `text` or `number` | Yes | The kind of answer. |
| `options` | A non-empty array of option objects | Yes for `choice`. Not allowed on other types. | The answers a `choice` question allows. |
| `default` | For `choice`, the `id` of one of its options. For `text`, a string. For `number`, a JSON number. | Yes | The answer when a build gives none. |
| `sets` | One tuning key (below) | No. Allowed on `number` only. | The key that receives the answer (§5, "Numeric answers"). |
| `notes` | A string | No | Notes for the builder (rule 6). |

No other field is allowed. Adding a field requires a format revision.

**Options.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `id` | A non-empty string, unique in the question | Yes | The option id. |
| `label` | A non-empty string | Yes | The option's name. |
| `notes` | A string | No | Notes for the builder (rule 6). |
| `sets` | A map with at least one entry, from tuning keys to JSON numbers | No | The numbers the option sets (§5, "Choice answers"). |

No other field is allowed in an option. A tuning key in `sets` is a flat
dotted key of two or more segments, in the tuning-key grammar (§4).

**Rules.**

1. There are two kinds of question: questions that change numbers, and
   questions that instruct the builder.
   - A `choice` option with `sets` changes numbers.
   - A `number` question with `sets` changes its one named key.
   - `text` answers and answers without `sets` are recorded for the builder
     to interpret.
2. Questions are optional for each build. When a build skips a question, its
   `default` applies. So every question has an answer.
3. For a `choice` question, the `default` and every recorded answer MUST
   name the `id` of one of its options. The answer procedure is defined only
   for declared option ids.
4. The same numeric answers always set the same numbers.
5. The builder chooses each open or ranged tuning number that no answer set,
   and supplies each open record field that applies (§4). So the resolved
   numbers of two builds can differ. Two builds with the same answers need not
   produce identical implementations (§2a).
6. Notes MUST NOT be the only authority for a numeric change. This is a
   prose obligation (§2d).
7. **Contract values are not targets.** A `sets` key MUST NOT name
   `contracts.<adoption>.<value>`. A contract's values are fixed in the
   adoption, and they cannot be set for each build.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `PERSONALIZATION_JSON` | error | `personalization.json` does not parse as JSON. |
| `PERSONALIZATION_SCHEMA` | error | The file breaks `personalization.schema.json`. |
| `PERSONALIZATION_QUESTION_ID` | error | Two questions have the same `id`. |
| `PERSONALIZATION_OPTION_ID` | error | Two options of one question have the same `id`. |
| `PERSONALIZATION_DEFAULT_OPTION` | error | The `default` of a `choice` question names no option of the question (rule 3). |
| `PERSONALIZATION_SETS_TYPE` | error | A question that is not a `number` question has `sets`. |
| `PERSONALIZATION_SETS_TARGET` | error | A key in `sets` names a contract value (rule 7), or names no key in `values` or `open`. |
| `PERSONALIZATION_SETS_UNRANGED` | error | A key in `sets` names a `values` key without a range. |
| `PERSONALIZATION_SETS_RANGE` | error | A value in an option's `sets`, or the `default` of a `number` question with `sets`, is outside the key's range. |
| `SCHEMA_JSON` | error | The validator's own copy of `personalization.schema.json` does not parse as JSON. |

### Choice answers

A `choice` option MAY set exact values of tuning keys through `sets`. A
`choice` option without `sets` gives the builder creative instruction only.

**Rules.**

1. Each key in `sets` MUST name a `values` key that has a range, or any
   `open` key (§4). A `values` key without a range cannot be set.
2. When a build selects the option, each value in its `sets` becomes the
   key's value for that build.
3. Where the key has a range, the value MUST be inside the range.

### Numeric answers

A `number` question MAY name one key with `sets`. A `number` question
without `sets` records creative instruction and changes no number by
machine.

**Rules.**

1. The `sets` key MUST name a `values` key that has a range, or any `open`
   key (§4). An `open` key needs no range.
2. The answer becomes the key's value. When a build supplies no answer, the
   `default` becomes the key's value.
3. Where the key has a range, the `default` and every supplied answer MUST
   be inside the range.
4. A supplied answer outside the range is rejected. It is never clamped,
   that is, moved to the nearest end of the range. The build record fails
   check 4 of §7.

### The resolved tuning snapshot

The resolved tuning snapshot is the final set of numbers that one build
uses, after every answer is applied. The build record reports it, and later
checking compares against it.

**Shape.** The snapshot is one object with exactly one member, `values`.
`values` is a flat map. Its keys are exactly these:

- every `values` key and every `open` key
- every present open record field, under
  `collections.<collection>.<record>.<field>`. A missing open record field
  does not apply and adds no key.
- every value of an active contract declaration, under
  `contracts.<adoption>.<value>`

A number in a record field that is not open is not in the snapshot.
Build-record validation reads these numbers from the source package when it
checks the rules (§7). Validation does not check whether a finished build
uses them (§2d).

**Procedure.**

1. Start from the tuning keys of `values` and `open`.
2. Take the questions in the order of `questions`. For each question, use
   the supplied answer, or the `default` when no answer was supplied.
   - A `choice` answer applies the `sets` map of the selected option.
   - A `number` answer is assigned to the question's `sets` key, when there
     is one.
   - A later assignment to a key replaces an earlier one.
   - Record fields are not personalization targets.
3. The builder records a value for every open tuning number that no answer
   set.
4. The builder records a value for every open record field that applies. An
   `integer` record field stays whole.
5. For a ranged `values` key that no answer set, the builder MAY choose any
   value inside its range.
6. A decided `values` key without a range keeps the value written in the
   package.
7. Finally, every value of an active contract declaration is added to the map
   as its resolved number, under `contracts.<adoption>.<value>` (§10.4,
   §10.9).

`opengdd-build.json` MUST record the answers and the full resolved snapshot
(§7). The audit compares the values that a build consumes at run time with
the resolved snapshot, for the keys that it chooses to check (§2d).

### Answers outside tuning

Numbers are the only thing that this version resolves by machine.

**Rules.**

1. A question can also apply to prose, through a `> PERSONALIZATION: <id>`
   tag (§2).
2. The builder interprets a personalized prose passage from the recorded
   answer. The builder follows the boundary of §2a and chooses an option that
   fits the fantasy block (§1a).
3. The recorded answer in `opengdd-build.json` is the only machine-checked
   trace of the personalization. Build-record validation (§7) checks only
   these four things:
   - the record carries an answer for every declared question
   - each answer names a declared question and matches its type
   - a `choice` answer names a declared option
   - a `number` answer is inside the range of its target
4. Collection records are Fixed package data, with the exceptions that §1b
   states. They are not personalization targets.
5. Choices made during play, such as upgrades, difficulty modifiers, crafting
   choices and laws, are gameplay state. They are not build personalization.

*The Handbook chapter [Who decides](https://opengdd.org/handbook/who-decides/)
shows an example of a personalized passage.*

**Not in this version.**

- A machine effect of an answer on prose: a rule to include, exclude or
  replace text, or a selector that says which answer produces which passage.
- Personalization of collection records.

## 6. Build plan and acceptance tests (`05-build-plan.md`)

The build plan is the required chapter `05-build-plan.md`. It says in which
order the game is built, stage by stage. Acceptance tests in the build plan
are optional.

**Build stages.**

1. The chapter MUST describe at least one build stage in ordinary prose. A
   stage begins with a heading or a numbered item that names the work to
   build, and it includes the text that describes that work. The chapter
   title, a test heading and a heading that only introduces the tests do not
   begin a stage. The builder builds the stages in their order in the file.
2. Each stage says what to build. A stage MAY name the chapters or the parts
   of chapters that describe that work. The build plan states the order of
   the work. The builder chooses how to build it (§2a).
3. A stage MAY list checkpoints. A checkpoint is a point at which the
   builder checks the work that is done so far. A checkpoint written as an acceptance test follows
   the test rules of this section.
4. The build stages are a prose obligation (§2d). Validators do not decide
   them.

*[Get started](https://opengdd.org/get-started/) shows a small build plan with
two stages and their checkpoints, and how to give a package to a builder.*

**Tests.** An acceptance test is a numbered heading followed by a short block.
The block states what a finished build has to prove.

1. The rules for build stages (above) and the rules for test headings and
   test blocks (below) are normative package obligations. They include the
   closed field set of the test block.
2. A measured promise in `direction.json` needs a test that covers it (§9.8).
3. Every Fixed statement applies to the build even when no test restates it
   (§2).
4. Passing every acceptance test is necessary for the experimental
   certification protocol. It is never sufficient.
5. A valid build record, checked against a package with no tests, has the
   outcome *Not verified*, not *Conforming* (§7).

How a runner executes these tests, and whether the tests truly passed, belong
to the experimental certification protocol (§2d).

**Example.**

```markdown
### AT-1: Hazard spacing
```

```test
{
  "type": "scenario",
  "given": "a chase running at the resolved hazard.interval_seconds",
  "when": ["the road runs for sixty seconds and the player never crashes"],
  "then": ["no two hazards arrive closer together than that interval"],
  "diagnostics": ["hazard-spawn-log"]
}
```

**Not in this version.**

- A machine grammar for build stages.
- An execution grammar for `test` blocks: how a runner reads a `given`, a
  `when` or a `then`, how it plays a `replay` back, and what an observation
  proves.

### Acceptance-test types

A test has a number. The number refers to the same check in every revision of
the package.

**Test types.** A runner checks `scenario` tests and `general` tests under the
runner profile.

| `type` | What it states | Required fields | How a runner checks it |
| --- | --- | --- | --- |
| `scenario` | One specific situation and its outcome | `given`, `when`, `then` | It reads `given`, `when` and `then`. |
| `general` | One claim that holds across many cases | `scope`, `holds` | It samples the cases of `scope`, or checks every case. Optional `seeds` name repeatable random sequences that generate the cases, so a failure can be reproduced. |

**Test headings.** A test heading is a Markdown heading, at any level, whose
text begins `AT-<n>`. `AT-<n>` is the letters `AT`, a hyphen and one or more
digits. After the digits, the heading ends, or the next character is not an
ASCII letter, an ASCII digit or an underscore. `AT-4: Alarm on sight` is a
test heading. `AT-4b` and `AT-four` are not.

**Rules.**

1. The validator checks the heading grammar in one file only: the root
   build plan `05-build-plan.md` (§1).
2. The number is a positive integer. The validator checks this. The number
   is written without a leading zero. The validator does not check this, so
   it is a prose obligation (§2d). The build record's `sampled` list accepts
   only the form without a leading zero (§7).
3. Numbers MUST be unique and ascending in document order.
4. Gaps are allowed. The number of a deleted test is never used again. So
   `AT-4` names the same check in every revision that has an `AT-4`.
5. This numbering applies only to game-local tests: the tests that the package
   writes itself. A generated test has a name, not a number. Its heading
   begins `AT ` with no hyphen, so the search for `AT-<n>` headings never
   finds it (see "Checked contract tests").
6. Every `AT-<n>` heading MUST be followed directly by one fenced JSON block
   whose fence carries the tag word `test`. That block is the test. No prose
   restatement is required.
7. A test that needs a person watching cannot be checked or rerun. The build
   record reports such a test as `not-run` (§7). No build record has the
   outcome *Conforming* while the package has such a test.

*The Handbook chapter
[Acceptance tests](https://opengdd.org/handbook/acceptance-tests/) shows
where to write a quality that only a person can judge, and explains what a
sampled test shows. §9.10 lists the art-direction entries that the audit
judges.*

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `VERIFICATION_AT_ORDER` | error | A test number is not a positive integer, or it is not greater than the number of the test before it. |
| `VERIFICATION_BLOCK` | error | An `AT-<n>` heading is not followed directly by a fenced `test` block. |
| `VERIFICATION_JSON` | error | A test block does not parse as JSON. |
| `VERIFICATION_CLASS` | error | `type` is neither `scenario` nor `general`. |
| `VERIFICATION_TYPE_RETIRED` | error | `type` is `property`, `exhaustive-search` or `document-check`. Appendix A gives the replacement. |

### The package-level test-block shape (normative)

A test block is one JSON object.

*The fields `replay`, `target`, `tolerance` and `extensions` are for the
runner.*

The strings in `given`, `when`, `then`, `scope` and `holds` are the
instructions of the test, and the runner reads them. An instruction can name
a tuning key or a record, as `given` does in the example above. Package
validation does not read such a name as a citation and does not resolve it
(§12.2). Package validation resolves only the paths in `direction_claims`
and the modes and values in `unchanged`.

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `type` | `scenario` or `general` | Yes | The test type. |
| `given`, `when`, `then` | A non-empty string, or a non-empty array of non-empty strings. The two forms are equivalent. | Yes in `scenario`. Not allowed in `general`. | Together, one specific situation and its outcome. |
| `scope` | A non-empty string | Yes in `general`. Not allowed in `scenario`. | The cases that the claim is about, in words. |
| `holds` | A non-empty string | Yes in `general`. Not allowed in `scenario`. | The claim across those cases. |
| `seeds` | A non-empty array of non-empty strings | No. Not allowed in `scenario`. | Names of repeatable random sequences that generate cases. |
| `diagnostics` | A non-empty array of non-empty strings | No | Names of the observations, logs or other data that the test uses. The format defines none of these names. The runner profile defines their meaning. The field does not refer to the Diagnostics tables of this document. |
| `direction_claims` | A non-empty array of strings, each an exact dotted path | No | The measured promises that the test covers: entries of `colors`, `contrast` or `timing` in `direction.json` (see "Direction-claim citations"). |
| `unchanged` | An object | No | Values that stay the same during named modes. §4b.3 defines its shape. |
| `replay` | An object | No | Replay input for the runner. The format gives no meaning to its contents (§4b.4). |
| `target` | Any JSON value. It has the same JSON type as the value that the runner observes, for example a number. | No | The expected observation: the value that the test expects the runner to observe. The runner profile defines the meaning of `target` (see "Owners"). |
| `tolerance` | A finite JSON number | No. Only together with `target`. | The tolerance of the expected observation. |
| `extensions` | An object that maps extension ids to JSON objects | No | Data that a package or a runner owns. |

No other top-level field is allowed. Adding a field name requires a revision
of the format.

**Rules.**

1. A package validator reads the field names, decides their shapes as far as
   this document defines them, and reports a violation as a package
   conformance error (§2d).
2. A `tolerance` without a `target` is invalid.
3. At package conformance, the validator checks only that `replay` is an
   object. This version leaves the contents of `replay` to the runner
   (§4b.4).
4. Data that a package or a runner owns, such as a fixture id or a capture
   handle, is legal only inside `extensions`. The same data directly beside
   the standard fields is a package conformance error.
5. Each key of `extensions` is a kebab-case extension id that the designer
   invents (§1). Each key names one package extension or runner extension.
   The key is the namespace for everything inside its value.
6. The validator checks the `extensions` object, the grammar of its keys,
   and that each value is an object. The format gives no meaning to the
   fields inside a value.
7. Appendix A lists the test types and test fields that earlier versions used
   and that this version rejects. It says what to do with each one. A
   finding for one of them names the command `opengdd migrate`. The message
   of `VERIFICATION_FIELD_UNKNOWN` for such a field names the replacement of
   the field.

**Sampled tests.** A runner can check a sample of the cases of a `general`
test.

1. A sample does not show that the claim holds for every case in the scope.
2. A counterexample in the sample can show that the claim is false.
3. A passed sampled test records a result for the cases that were checked.
   The runner profile defines any further statistical meaning.
4. A test that passed and was checked over its whole scope can support a
   claim about that scope. The runner profile's execution and observation
   rules apply.
5. The build record's `acceptance.sampled` list states which `general` tests
   were sampled (§7).

**Replay in the audit.** Package validation does not check these three
things. The audit confirms them (question 8 in
`conformance/CERTIFICATION.md`):

- every path that the runner treats as replay input is package-relative
- replay input carried as structured content is declared through §1b
- every `target` is based on an input or schedule that the runner actually
  supplies

**Owners.** Every test feature has exactly one owner. This table uses the
layers of §2d.

| Test feature | Owner |
| --- | --- |
| The block shape, the closed field set, the shapes per type, the lookup and coverage of `direction_claims` | Package validation, from the package bytes |
| Reading `given`, `when` and `then`. Sampling the `scope` of a `general` test, or checking every case in it. Playing back `replay`. The meaning of `target` and of observations. Executing a schedule. | The runner profile in `conformance/CERTIFICATION.md` |
| "The tests passed" | The build record. Validation checks the shape and the counts of this claim (§7). |
| Whether the tests truly passed, and whether uncited Fixed prose held | The audit (§2d, §9.10) |

**Diagnostics.** §4b.3 lists the findings for `unchanged`.

| Code | Kind | Reported when |
| --- | --- | --- |
| `VERIFICATION_SHAPE` | error | A test block is not a JSON object. |
| `VERIFICATION_FIELD` | error | A `scenario` block lacks `given`, `when` or `then`, or one of them is empty. |
| `VERIFICATION_FIELD_TYPE` | error | `given`, `when` or `then` is not a non-empty string or a non-empty array of non-empty strings. `diagnostics` is not a non-empty array of non-empty strings. `tolerance` is not a finite number. |
| `VERIFICATION_GENERAL_SCOPE` | error | A `general` block has no `scope`, or `scope` is not a non-empty string. |
| `VERIFICATION_GENERAL_HOLDS` | error | A `general` block has no `holds`, or `holds` is not a non-empty string. |
| `VERIFICATION_GENERAL_SEEDS` | error | `seeds` is not a non-empty array of non-empty strings. |
| `VERIFICATION_FIELD_UNKNOWN` | error | A block carries a top-level field outside the closed set for its type. |
| `VERIFICATION_EXTENSIONS` | error | `extensions` is not an object, a key is not kebab-case, or a value is not an object. |
| `VERIFICATION_REPLAY` | error | `replay` is not an object. |
| `VERIFICATION_TOLERANCE_TARGET` | error | A block carries `tolerance` without `target`. |

A block that gets `VERIFICATION_TYPE_RETIRED` gets no other finding. Such a
block has no field set to check against.

### Direction-claim citations

A `scenario` or `general` block that covers a measured promise (§9.6)
carries `direction_claims`. `direction_claims` is a non-empty array of exact
dotted paths.

**Paths.** Each path MUST resolve to an entry of `direction.json` in one of
these forms.

| Path | Resolves to |
| --- | --- |
| `colors.<key>` | One entry of `colors` |
| `contrast.<key>` | One entry of `contrast` |
| `timing.<key>` | One entry of `timing` |

Palettes, visual priorities, moods, anti-references, what must stay, and
viewing conditions are not targets of `direction_claims`.

**Rules.** The procedure of a test is its instructions for the runner. A
`scenario` test states them in `given`, `when` and `then`. A `general` test
states them in `scope` and `holds`. The runner can also use the replay input
and the runner data of the test (§4b.4). A test block has no field named
`procedure`.

1. §9.8 states which entries need a citing test, and the finding for an
   entry that has none.
2. The test refers to the promise. It does not state the value or the metric
   of the promise. Its procedure MAY name the location and the conditions of
   the promise as steps. §9.8 states this rule.
3. The test's procedure states how the runner observes the declared promise.
   The procedure also states how the runner reaches any conditions that
   `while` names. Rule 3 is a prose obligation (§2d).
4. The validator decides the citation and the coverage from the package
   bytes.

*The Handbook chapter
[Palette and color promises](https://opengdd.org/handbook/palette-and-color-promises/)
shows a test that covers three measured promises.*

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `DIRECTION_CLAIMS_SHAPE` | error | `direction_claims` is not a non-empty array, or an entry is not a string. |
| `DIRECTION_CLAIMS_DANGLING` | error | A path does not resolve to a `colors`, `contrast` or `timing` entry: it has another form, or it names no entry. |

### Checked contract tests

A checked contract adoption (§10.8) adds acceptance tests from its
verification pack. §10.8 and §10.7 define the generation of these tests and
the pack's templates.

**The two name forms.** A generated test has a name, not a number.

| Name | Used for |
| --- | --- |
| `AT <adoption>/<template-id>` | One test from one template |
| `AT <adoption>/<template-id>/<row-id>` | One test per row, for a template that expands per row |

A change to one adoption or one row renames no other test.

**Rules.**

1. The published validator generates the tests for reading, with
   `--render-contract-tests`. The generated tests are not stored in
   `05-build-plan.md`.
2. Generated tests use the same two test types, the same closed field sets,
   the same runner, the same evidence duties and the same §7 acceptance
   counts as game-local tests.
3. A generated contract test MUST NOT carry `direction_claims`. The finding
   is `CONTRACT_TEST_DIRECTION_CLAIMS` (§10.7). The package meets §9.8 with
   game-local tests.

## 7. Build records (`opengdd-build.json`)

The build record is `opengdd-build.json`, the builder's report of one build
(build-record conformance, §2d). It is validated against
[opengdd-build.schema.json](https://opengdd.org/schema/core/v0.9/opengdd-build.schema.json).
§2d states which claims in this record are decided by validation. It also
states which claims only the experimental certification protocol can confirm.

### Core fields

*This subsection is for builders and tool makers.*

**Example.**

```json
{
  "opengdd": "0.9",
  "spec": { "id": "lantern-maze", "version": "1.2.0" },
  "designer": { "name": "OpenGDD Examples" },
  "builder": { "name": "Example Studio", "role": "solo builder" },
  "personalization": { "answers": { "difficulty": "gentle" } },
  "resolved_tuning": {
    "values": {
      "lantern.fuel_seconds": 45,
      "maze.width_cells": 21
    }
  },
  "evidence": {
    "acceptance": {
      "passed": 3,
      "total": 4,
      "sampled": ["AT-3"],
      "not_passed": {
        "AT-4": { "result": "not-run", "reason": "The test needs a person." }
      }
    },
    "result_hash": "a3f1c9e07b2d4f68a1c3e5b7d9f02468ace13579bdf02468ace13579bdf02468",
    "payload": { "covers": "Results of AT-1 to AT-3", "file": "evidence/payload.json" },
    "runner": { "id": "lantern-maze-runner", "version": "1" }
  }
}
```

**The record.** The record is one JSON object.

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `opengdd` | The string `"0.9"` | Yes | The format version the build was tested against. |
| `spec` | An object (below) | Yes | The identity of the source package: the package that the build was built from. |
| `designer` | A person object (below) | Yes | The package's designer. |
| `builder` | A person object (below) | Yes | The builder of this build. |
| `personalization` | An object (below) | Yes | The answers used. |
| `resolved_tuning` | An object (below) | Yes | The resolved tuning snapshot of §5. |
| `evidence` | An object (below) | Yes | The test-run record. |
| `commerce` | An exact copy of the source manifest's `commerce` object (§3), with `license`, `split` and, when present, `derived_from` | No | Commerce metadata (rule 11). |

The top level is closed: a field that the schema does not name is reported as
`BUILD_SCHEMA`. These objects are closed too:

- `spec`, `designer`, `builder`, `personalization` and `resolved_tuning`
- `evidence.acceptance`, each result object in `not_passed`,
  `evidence.payload`, `evidence.runner` and each entry of
  `evidence.contracts`
- `commerce`, with its `split` and `derived_from`

`personalization.answers`, `resolved_tuning.values` and `not_passed` are
maps. `evidence` accepts further build-local members, and the schema gives
them no shape.

**`spec`.** In this field name and in the codes that start with `BUILD_SPEC_`,
`spec` means the source package.

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `id` | A kebab-case string (§1) | Yes | The `id` of the source package. |
| `version` | A version string (§3) | Yes | The `version` of the source package. |

**`designer` and `builder`.** Both are person objects.

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `name` | A non-empty string | Yes | The person's name. |
| `handle` | A string | No | The person's handle. |
| `contact` | A string | No | Contact details. |
| `role` | A string | No | The person's role in this build. `role` is build-local. |

**`personalization`.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `answers` | A map from question ids to answers. Each answer is a string or a number. | Yes | The answer used for each question, including each question that used its `default` (check 3). It is an empty object when there are no answers. |

**`resolved_tuning`.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `values` | A map from keys to numbers | Yes | The §5 resolved snapshot: one complete, flat map after the ordered answers and the builder's choices are applied. Check 4 gives its keys and values. |

**`evidence`.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `acceptance` | An object (below) | Yes | The test counts and the tests that did not pass. |
| `result_hash` | 64 characters of bare lowercase hexadecimal | When any test ran (rule 2) | The hash of the payload. The experimental certification protocol fixes SHA-256 for the result hash. |
| `payload` | An object (below) | When any test ran (rule 2) | The payload that the hash covers. |
| `runner` | An object (below) | When any test ran, and the source package is available (check 7) | The runner profile under which the result is true. It shows which runner produced the results. |
| `contracts` | An array of objects (below) | Exactly when the source package has checked contract adoptions (check 8) | One entry per checked adoption. |

`evidence` is open. It can also hold build-local checkpoint records, captures
and transcripts.

**`evidence.acceptance`.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `passed` | An integer, `0` or more | Yes | The number of tests that passed. |
| `total` | An integer, `0` or more | Yes | The number of tests in the source package (check 5). |
| `sampled` | An array of unique, non-empty test names, written as check 6 describes | No | The general tests whose scopes were sampled rather than checked whole (rule 8). |
| `not_passed` | A map from test names to result objects (below) | No | Every test that did not pass. Each key is the source package's test name, written as check 6 describes (§6). |

**A result object in `not_passed`.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `result` | `failed`, `partial` or `not-run` | Yes | How the test ended. `failed` means that the test ran completely and did not pass. `partial` means that the test could be run only in part. `not-run` means that the test did not run (rule 1). |
| `reason` | A non-empty string | Yes | Why the test did not pass (rule 7). |

*The Handbook chapter
[Acceptance tests](https://opengdd.org/handbook/acceptance-tests/) explains
the three results, and what a sampled test shows.*

**`evidence.payload`.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `covers` | A non-empty string | Yes | A statement, in plain words, of which artifacts the hash covers. |
| `file` | A relative path (rule 3) | Yes | The canonical payload bytes that the hash covers. |

**`evidence.runner`.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `id` | A non-empty string | Yes | The id of the runner profile. |
| `version` | A non-empty string | Yes | The version of the runner profile. |

**One entry of `evidence.contracts`.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `adoption` | A kebab-case string | Yes | The id of one checked adoption. |
| `pack` | `sha256:` followed by 64 lowercase hexadecimal characters | Yes | The pack digest that the build was verified against (§10.8). |

**Rules.**

1. A passed test ran. A test with the result `failed` or `partial` also ran. A
   test with the result `not-run` did not run. At least one test ran exactly
   when one of these is true:
   - `acceptance.passed` is greater than zero
   - a `not_passed` entry is `failed` or `partial`
2. `evidence.result_hash` and `evidence.payload` are required when any test
   ran. The two fields MAY be absent when no test ran: either the package
   has no tests, or every test is `not-run`.
3. `payload.file` is a path relative to the build record's folder, and it
   stays inside that folder. It uses forward slashes as separators. A
   backslash is invalid. The validator checks the path's shape, not whether
   the file exists.
4. The canonical form of the payload bytes follows
   [the experimental certification protocol](conformance/CERTIFICATION.md#canonical-hash-serialization)
   (§2d).
5. A source test counts as passed when `evidence.acceptance.not_passed` does
   not list it.
6. A test that needs a person cannot be checked or rerun. Its result is always
   `not-run`, and its `reason` says that the test needs a person. A build
   record for a package with such a test never has the outcome *Conforming*.
   The reason is that the format defines no way to record an observation
   that a person makes as a passed test.
7. `reason` says why the test did not pass. When the cause is an ambiguity
   in the package, `reason` can say where the package was ambiguous, or
   where to find a separate ambiguity report (§2b).
8. For `sampled`, these rules apply:
   - A test named in `sampled` MUST NOT have the result `not-run`.
   - A test that is not listed is not reported as sampled. That is not a
     claim that its whole scope was checked.
   - Only a test that passed and is not listed reports a whole-scope check.
   - A `failed`, `partial` or `not-run` result makes no claim about how much
     of the scope was checked.
9. `evidence.contracts` is absent when every adoption is promised (§10.8).
10. `evidence.contracts` records the pack bytes that the build was verified
    against. A pack that is replaced later does not change what this record
    says was checked.
11. `opengdd-build.json` MAY copy the source manifest's `commerce` object.
    When it does, the source manifest MUST carry that object, and the copy
    MUST be exact, `derived_from` included when present. Omitting the
    optional copy has no conformance consequence. Nothing in the experimental
    certification protocol depends on commerce metadata.

**Diagnostics.** The validator reports these findings from the record alone.

| Code | Kind | Reported when |
| --- | --- | --- |
| `BUILD_FILE_MISSING` | error | The build record file does not exist, or is not a file. |
| `BUILD_JSON` | error | `opengdd-build.json` does not parse as JSON. |
| `BUILD_SCHEMA` | error | The record breaks `opengdd-build.schema.json`. This includes a field that the schema does not name. |
| `BUILD_PAYLOAD_PATH` | error | `evidence.payload.file` is absolute, begins with a URL scheme, holds a backslash, or leads outside the build record's folder. |
| `BUILD_ACCEPTANCE_SHAPE` | error | `acceptance.passed` or `acceptance.total` is not a number. |
| `BUILD_ACCEPTANCE_ACCOUNTING` | error | `acceptance.passed` plus the number of `not_passed` entries is not `acceptance.total` (check 6). |
| `BUILD_SPEC_CROSS_CHECKS_SKIPPED` | warning | The record is checked without its source package. Checks 1 to 8 did not run, except the sum in check 6, which needs only the record. |

### Package-consistency checks

*This subsection is for builders and tool makers.*

Some rules depend on the source package, the package that the build was built
from. A conforming validator MUST also verify all of the following.

1. `spec.id` and `spec.version` match the source manifest.
2. The build `designer` matches the source manifest on their common identity
   fields: `name`, plus `handle` and `contact` when each is present in both.
   `role` is build-local and is excluded from matching.
3. Every recorded answer names a declared question and matches the type of
   that question (§5). A `choice` answer MUST also name a declared option id.
   A question that used its `default` is recorded too.
4. The keys of `resolved_tuning.values` exactly equal the set that §5
   defines. Unknown and missing keys are errors. The set holds:
   - every source `values` key
   - every `open` key
   - every present open record field
   - every value of an active contract declaration

   An inactive contract declaration and a missing open record field have no
   key. A key for either of them MUST be absent (§§1b, 5, 10.9). Each value
   follows the rule for its kind:
   - A decided tuning value equals the value in the package.
   - A ranged value that no answer set can be any value inside its inclusive
     range.
   - A ranged value that an answer set equals that answer.
   - An open tuning value is the builder's value, or the answer that set it.
     It stays inside its range when it has one.
   - An open record field has a value of its declared numeric type, so an
     `integer` stays whole.
   - A contract value equals its resolved number in the source package
     (§10.9).

   A recorded number answer outside the range of its `sets` target is
   rejected. It is never moved to the nearest end of the range, and the
   record does not conform (`BUILD_ANSWER_REJECTED`). The validator still uses
   the rejected answer to compute the resolved numbers that it expects in
   the record. So it can also report `BUILD_TUNING_VALUE` for the invalid
   record.
5. The source package's canonical `05-build-plan.md` exists. If it is missing,
   the build record receives `BUILD_SPEC_PLAN_MISSING`. `acceptance.total`
   equals the number of tests in the package. That number is the count of
   game-local acceptance tests plus the count of tests generated from checked
   packs. The generated tests are counted after template liveness and per-row
   expansion (§§6, 10.7). Every entry in `acceptance.sampled` names a general
   test of the source package, game-local or generated, written as check 6
   describes. An unknown name is reported as `BUILD_SAMPLED_UNKNOWN`. A test
   of another type is reported as `BUILD_SAMPLED_TYPE`.
6. Every `not_passed` key names one test of the source package. Unknown names
   are errors. A test name has one of these forms:
   - a game-local name: `AT-` followed by digits, with no leading zero
     (`AT-n`)
   - the name of a generated contract test: exactly `<adoption>/<template>`
     or `<adoption>/<template>/<row-id>` (§10.7), without the `AT ` prefix
     of its heading

   `acceptance.passed` plus the number of `not_passed` entries equals
   `acceptance.total`. The validator checks this sum even when it has no
   source package. A test that did not pass and is correctly listed makes
   the report incomplete, not invalid.
7. When any test ran (passed, failed or partial), `evidence.runner` is
   present. It is not required when every test is `not-run`.
8. `evidence.contracts` is present exactly when the source package has
   checked adoptions. It matches their adoption ids and pack digests exactly
   (§10.8).

**Further rules.**

- Every `rules` entry of the source package MUST be true for the recorded
  values together with the package's decided record numbers. A rule that is
  false, or that cannot be evaluated over these numbers, is reported as
  `BUILD_TUNING_RULE`, a build-record failure (§4). When a rule names a key of
  the check 4 set that the record lacks, the finding is `BUILD_TUNING_KEYS`,
  and the rule is not evaluated.
- Every relation that a contract definition declares is re-evaluated over
  the adoption's values in the resolved snapshot, as §10.6 says.
- Validators report a mismatch found by checks 1 to 8 as an error.
- A builder's own tests do not count toward `total`, `passed` or the derived
  outcome.
- For a package with no tests, the builder can describe their own checks in
  build-local evidence. The outcome stays *Not verified*.

**Diagnostics.** The validator reports these findings when it is given the
source package.

**Reading the source package.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `BUILD_SPEC_MISSING` | error | The source package's `manifest.json` does not exist, or it cannot be read or parsed as JSON. |
| `MANIFEST_JSON` | error | The source package's `manifest.json` does not parse as JSON. |
| `BUILD_SPEC_TUNING_MISSING` | error | The source package's `tuning.json` does not exist, is not a file, or cannot be inspected. |
| `TUNING_JSON` | error | The source package's `tuning.json` cannot be read or does not parse as JSON. |
| `BUILD_SPEC_PLAN_MISSING` | error | The source package's `05-build-plan.md` does not exist, is not a file, or cannot be inspected (check 5). |

**Identity (checks 1 and 2) and `commerce`.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `BUILD_SPEC_ID` | error | `spec.id` is not the source manifest's `id`. |
| `BUILD_SPEC_VERSION` | error | `spec.version` is not the source manifest's `version`. |
| `BUILD_DESIGNER_NAME` | error | `designer.name` is not the source manifest's `designer.name`. |
| `BUILD_DESIGNER_FIELD` | error | `designer.handle` or `designer.contact` is present in both files, and the two values differ. |
| `BUILD_COMMERCE_MISMATCH` | error | The record carries `commerce`, and it is not equal to the source manifest's `commerce` (rule 11). |

**Personalization answers (checks 3 and 4).**

| Code | Kind | Reported when |
| --- | --- | --- |
| `BUILD_ANSWER_MISSING` | error | A question that the source package declares has no recorded answer. |
| `BUILD_ANSWER_UNKNOWN` | error | An answer names a question that the source package does not declare. |
| `BUILD_ANSWER_TYPE` | error | An answer does not match its question's type: a `number` question needs a finite number, and a `choice` or `text` question needs a string. |
| `BUILD_ANSWER_OPTION` | error | A `choice` answer is not a declared option id of its question. |
| `BUILD_ANSWER_REJECTED` | error | A number answer is outside the inclusive range of its `sets` target (check 4). |

**Resolved tuning (check 4).**

| Code | Kind | Reported when |
| --- | --- | --- |
| `BUILD_TUNING_KEYS` | error | The keys of `resolved_tuning.values` are not exactly the set that check 4 names. |
| `BUILD_TUNING_RANGE` | error | A recorded value is outside the inclusive range that the source `ranges` gives its key. |
| `BUILD_TUNING_VALUE` | error | A recorded value is not the value that check 4 requires for its key. |
| `BUILD_RECORD_VALUE` | error | An open record field of type `integer` holds a number that is not whole. |
| `BUILD_CONTRACT_RULE` | error | A relation of a contract definition is false over the adoption's recorded values, or it cannot be evaluated over them. |

**Tests (checks 5, 6 and 7).**

| Code | Kind | Reported when |
| --- | --- | --- |
| `BUILD_ACCEPTANCE_TOTAL` | error | `acceptance.total` is not the number of tests in the source package. |
| `BUILD_SAMPLED_UNKNOWN` | error | A `sampled` entry names no test in the source package. |
| `BUILD_SAMPLED_TYPE` | error | A `sampled` entry names a test that is not a general test. |
| `BUILD_SAMPLED_NOT_RUN` | error | A `sampled` entry names a test whose `not_passed` result is `not-run`. |
| `BUILD_NOT_PASSED_UNKNOWN` | error | A `not_passed` key names no test in the source package. |
| `BUILD_RUNNER_REQUIRED` | error | A test ran, and `evidence.runner` is absent. |

**Contracts (check 8).**

| Code | Kind | Reported when |
| --- | --- | --- |
| `BUILD_CONTRACTS_MISSING` | error | The source package has checked adoptions, and `evidence.contracts` is absent. |
| `BUILD_CONTRACTS_UNEXPECTED` | error | `evidence.contracts` is present, and the source package has no checked adoption. |
| `BUILD_CONTRACT_PACK` | error | An entry of `evidence.contracts` is not an `adoption` and `pack` pair, repeats an adoption, or does not match its source pack. Or a checked adoption has no entry. |

### Derived build outcomes and exit codes

The record stores no outcome field. After validation, a validator derives
exactly one outcome. A run without the source package validates the evidence
shapes that it can see. A run with the source package also decides
the conditional runner rule and the test-count rules.

The exit codes are those of the command-line validator in build mode. The
first row that applies decides the outcome.

| Outcome | When | Exit code |
| --- | --- | --- |
| Invalid | The record has one or more errors. A record checked without its source package, and with errors of its own, is invalid too. | `1` |
| Not checked | No source package was supplied, and the record has no errors of its own. The source-dependent checks did not run. The run reports `NOT CHECKED` and sets `valid` to `null`. | `3` |
| Not verified | The source package has no tests. | `3` |
| Incomplete | At least one `not_passed` entry reports `failed`, `partial` or `not-run`. | `3` |
| Conforming | The package has at least one test, and every test passed. | `0` |

*Not checked* and *Not verified* have different causes. For *Not checked*, no
source package was supplied. For *Not verified*, the source package has no
tests.

A command-line usage error exits `2`. Exit `0` means conforming and nothing
else. A build record with the outcome *Incomplete* or *Not verified* is valid,
but it is not conforming. The outcome *Not checked* is not a conformance
result.

*Conforming* is an outcome of build-record validation. It does not certify
the finished build, and it does not prove that the payload file exists
(rule 3).

### Audit evidence outside the build record

The audit profile in `conformance/CERTIFICATION.md#audit-profile` records the
capture recipe that it used by id, in the audit's own record. The recipe is
not in `opengdd-build.json`. An audit can ask the builder to attach any
further evidence that it needs. The format gives that evidence no field and
no fixed shape. Under the experimental certification protocol, a result hash
whose payload cannot be reconstructed cannot be audited, and it fails the
audit.

**Not in this version.**

- A definition of the build-local detail in `evidence`, such as checkpoint
  records, captures and transcripts.
- A standard shape for ambiguity reports.
- An interpretation of the named runner profile, or a claim that two
  profiles are equivalent.
- A published conformance suite that does not depend on one validator. It is
  a requirement for version 1.0.

## 7a. Authored puzzles

An authored puzzle is a logical puzzle that the designer writes as content.
It does not come from the game's systems or from a generator. A package with
authored puzzles MAY declare them as a §1b collection. Any collection can use
the grid encoding of this section for an authored layout, not only for
puzzles.

**Tiers.**

| Tier | Each puzzle holds | Authority | Checking |
| --- | --- | --- | --- |
| Tier 1, literal layouts | Data: a layout, entity placements and a win condition, referenced from the content chapters. | The puzzle is Fixed, like every record that no Delegated passage covers (§1b). | An acceptance test can check it, for example "puzzle 7 requires at least 12 moves". |
| Tier 2, solution-annotated layouts | The tier 1 data, and designer metadata: intended insight, misleading clues, difficulty-curve position and machine-checkable properties. | The insight is Fixed. The presentation of the puzzle can be delegated (§2a). | Checking the properties needs a solver. A runner profile defines how a solver executes these acceptance tests (§§2d, 6). |

The machine-checkable properties can include minimum solution length,
required mechanics and forbidden shortcuts.

### Grid-layout encoding family: `parallel-string-layers-1` (normative)

This version defines one grid encoding, `parallel-string-layers-1`. It is a
two-dimensional encoding with one character per cell. A puzzle board is
written as rows of characters, with one set of rows per layer. A §1b
collection declares this encoding through its record schema.

**Example.**

```json
{
  "record": {
    "terrain": { "type": "grid", "required": true,
      "description": "walls and floor: `#` is wall, `.` is floor" },
    "entities": { "type": "grid", "required": true,
      "description": "what stands where: `-` is empty, `o` is a stone" }
  }
}
```

**Parts of the encoding.**

| Part | Written in | What it is |
| --- | --- | --- |
| Layer | The record schema | One field of type `grid`. |
| Layer set | The record schema | All grid fields of the schema. A single-layer grid, one field that holds the whole board, declares one grid field. |
| Row | The record | One string in the grid field's array. The row count is the array's length. |
| Column count | The record | A row's length, counted in Unicode scalar values. UTF-16 code units and grapheme clusters are not the unit. A surrogate-pair emoji is one cell. A combining-mark sequence takes as many cells as it holds scalar values. |
| Cell | The record | One Unicode scalar value, read from one layer's row at one column. |
| Grid | The record | One shared, zero-based `(x, y)` grid per collection record. It is at least 1×1, with no partial or zero-width rows. |
| Meanings of the cell characters | The grid field's `description` | What each cell character means, such as what `#` marks. |
| Game rules | The game's own chapters | Overlap rules, entity footprints, terrain semantics and the rule for winning. |

**Dimensions.** The record schema's rules (§1b) decide whether a grid field
must be present. They also check that a grid field is an array of strings.
The grids that a record carries MUST be non-empty and congruent with one
another. Congruent means that they have the same dimensions:

1. The row count, the array length, MUST be at least 1.
2. Every row's column count, measured in scalar values, MUST be at least 1.
3. Every grid field of the record MUST have the same row count.
4. Every row in one grid field MUST have the same column count.
5. That column count MUST be the same in every grid field of the record.

The row count and the column count need not be equal. A board of 2 rows and
5 columns is valid.

**Rules.**

1. The cell unit is fixed by the format.
2. A validator reads exactly the grid-typed fields as layers. No other field
   is a layer, whatever its shape.
3. Generic tools find the layers in the schema, not in game prose.
4. Single-cell rule, fixed by the core format: each `(x, y)` coordinate
   holds exactly one cell value per declared layer. The encoding cannot
   represent one value spanning several cells in a layer.
5. How a field is read is written once, in the schema (§1b). So the grid
   field's `description` says what each cell character means.
6. The core encoding fixes the grid shape and the layer set. The schema
   description says what the cell characters mean. The game's own chapters
   state the game rules in the game's own words.
7. The format defines no shared names for the moves in a puzzle or for the
   conditions that a test checks, such as the win condition. A package that
   uses this encoding defines its own names in its chapters and tests (§6).
8. A board that this encoding cannot express needs a game-local extension.
9. The dimension checks are package checks. They run on every validation, as
   part of §1b's record checks. No acceptance test is needed to find these
   problems.

**Diagnostics.** Each finding carries a lowercase name in its `data`.

| Code | Kind | Reported when |
| --- | --- | --- |
| `CONTENT_LAYER_ROW_MISMATCH` | error | The grid fields of the record disagree in row count, or a grid has zero rows. The lowercase name is `layer-row-mismatch`. |
| `CONTENT_LAYER_COLUMN_MISMATCH` | error | At a named row, a grid field's column count disagrees with the record's grid, or is zero. The lowercase name is `layer-column-mismatch`. |

**Not in this version.**

- Multi-cell entities. They are outside `parallel-string-layers-1`, even if
  a game's own rules express one entity identity across several single-cell
  footprints.
- A solver-adapter shape, in the core format.
- A solver adapter or a replay grammar declared by this encoding.

## 9. Art direction (`direction.json`)

*This document has no section 8. Appendix A explains why the number is not
used.*

Art direction records the intended look and mood of the game, and measured
promises about colors, contrast and the duration of events. It is in the
optional file `direction.json` at the package root. The file is in use when it
exists, and the manifest does not name it.

**Chapter prose and the file.** `04-presentation.md` is the chapter for prose
about presentation: art direction, audio direction, UI and feel (§1). The
structured entries that this section defines are in `direction.json`. Chapter
prose cites an entry by its address (rule 6). This version has no structured
form for audio direction (§11).

Three places say what to avoid, and each one covers something different:

- the anti-reference line of the fantasy block says what the game is not
  (§1a)
- the `anti` list of a mood says what that mood must not be (§9.3)
- an entry of the root field `anti` names a result that the builder must
  avoid (§9.4)

**Example.** A complete `direction.json`:

```json
{
  "palette": {
    "board": [{ "mark-ink": "#2B2A26" }, { "paper": "#F7F4EC" }]
  },
  "pillars": {
    "shape-not-color": "The two players are told apart by mark shape alone; color never carries identity."
  },
  "mood": {
    "paper-quiet": {
      "intent": "The quiet of a game drawn on scrap paper between two people who happen to be nearby.",
      "borrows": [{ "from": "a pencil game on the back of an envelope", "what": ["paper texture", "hand-drawn line weight"], "image": "assets/mood/envelope.jpg", "license": "CC-BY-4.0" }],
      "anti": [
        "not an arena: no announcers, no glow, no dramatic stings, no victory fanfare",
        "not a casino: no chance imagery, no jackpot celebration"
      ],
      "palette": "palette.board"
    }
  },
  "anti": {
    "no-mascots": "no wobbling mascots or candy gloss; the game is casual, not infantile"
  },
  "must_keep": {
    "shape-carries-identity": "cross and ring are distinguishable by shape alone in every state"
  },
  "colors": {
    "mark-ink": { "is": "palette.board.mark-ink", "within": 12, "where": "every placed mark and every grid line", "while": ["in-game"] }
  },
  "contrast": {
    "mark-vs-paper": { "colors": ["palette.board.mark-ink"], "against": "palette.board.paper", "at_least": 4.5, "where": "marks on the board" }
  },
  "timing": {
    "mark-placement": { "key": "feel.placement_seconds", "where": "the mark appearing after a legal tap" }
  },
  "viewing": {
    "speed_and_size": "the whole board on screen at once, at real play speed",
    "calibration": "sRGB display at standard desktop viewing distance"
  }
}
```

**The file.** `direction.json` is one JSON object, validated by
`direction.schema.json` (§3a).

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `palette` | A map of palettes (§9.1) | No | The named sets of colors. |
| `pillars` | A map of strings (§9.2) | No | The visual priorities. |
| `mood` | A map of moods (§9.3) | No | The intended feeling. |
| `anti` | A map of anti-references (§9.4) | No | The results that the builder must avoid. |
| `must_keep` | A map of strings (§9.5) | No | The visible qualities that every build preserves. |
| `colors` | A map of color promises (§9.6) | No | Measured promises about colors. |
| `contrast` | A map of contrast promises (§9.6) | No | Measured promises about contrast. |
| `timing` | A map of timing promises (§9.6) | No | Measured promises about the duration of events. |
| `viewing` | One object (§9.7) | No | How the game is looked at when its art direction is judged. |

No other root field is allowed, and the file holds at least one root field.
Every map in the file holds at least one key. In every map except `palette`,
each key is a kebab-case name (§1).

**Rules.**

1. When a package uses art direction, one file named `direction.json` MUST be
   at the package root.
2. The file holds every art-direction entry of the package. No other file adds
   entries.
3. `direction.json` adds no authority level to the three levels of §2.
4. The entries of `direction.json` state targets that every build meets. How
   a build reaches a target is the builder's choice (§2a). A palette alone
   obliges a build to nothing: it names colors. A color binds a build when
   a `colors` or `contrast` entry names it (§9.6), or when a Fixed sentence
   requires it. A `colors` entry with `within` set to `0` requires the exact
   declared color.
5. A chapter passage about presentation is Fixed unless a tag delegates it
   (§2, §2a).
6. Chapter prose cites a direction entry by its dotted address (§12.2). An
   entry of `pillars`, `mood`, `anti`, `must_keep`, `colors`, `contrast` or
   `timing` has an address of exactly two segments: the root field and the
   entry key. Example: `mood.paper-quiet`.
7. A palette address resolves by the order in §9.1.
8. An entry of `pillars`, `mood`, `anti` or `must_keep` that no chapter cites
   is legal. It produces a warning.
9. When `direction.json` does not parse, the findings that depend on its
   content are not reported until it parses.

*The Handbook chapter [Art direction](https://opengdd.org/handbook/direction/)
shows sentences of `04-presentation.md` that cite entries of `pillars`,
`mood`, `anti` and `must_keep`.*

**Diagnostics.** Each subsection lists the findings for its own fields.

| Code | Kind | Reported when |
| --- | --- | --- |
| `DIRECTION_JSON` | error | `direction.json` cannot be read, or does not parse as JSON. |
| `DIRECTION_SCHEMA` | error | The file breaks `direction.schema.json`. Examples: an unknown or missing field, an empty map, string or array, a number outside its bounds, an `image` without `license`. |
| `SCHEMA_JSON` | error | The validator's own copy of `direction.schema.json` does not parse as JSON. |
| `DIRECTION_UNMENTIONED` | warning | An entry of `pillars`, `mood`, `anti` or `must_keep` is cited by no chapter (rule 8). |
| `PROSE_CITATION_DANGLING` | error | A two-segment prose address that starts with one of the seven root fields of rule 6 names no declared entry. |
| `PROSE_REFERENCE_DANGLING` | error | A chapter holds an inline-code token of the form `descriptor:<kind>:<name>`, where the kind is not empty and holds no colon, and the name is not empty. The token holds no `<` or `>`. Appendix A gives the current form. |
| `DIRECTION_FENCE_RETIRED` | error | A chapter holds three backticks directly followed by `direction`, in any letter case, and three more backticks after the end of that line. |

### 9.1 Palettes (`palette`)

A palette is a named set of colors. `palette` is an optional map from
palette keys to palettes. Each palette is a non-empty array of color
entries.

**Keys and names.**

| Name | Grammar |
| --- | --- |
| Palette key | One or more segments, joined by single dots. The dots are part of the flat key. They do not create nested objects. |
| Segment of a palette key | MUST match `^[a-z0-9]+(-[a-z0-9]+)*$`, MUST contain at least one letter, and MUST NOT be `json` or `md`. |
| Color name | One segment, with no dot. It follows the segment rule above. |

**Entries.**

| Form | Holds | Example | Address |
| --- | --- | --- | --- |
| Bare color | A `#RRGGBB` sRGB string: `#` and six hexadecimal digits | `"#F7F4EC"` | None. A bare color cannot be cited. |
| Named color | An object with exactly one key, the color name. Its value is a `#RRGGBB` sRGB string. | `{ "paper": "#F7F4EC" }` | `palette.<key>.<name>` |

No other entry form is allowed.

**Resolving a palette address.** A palette address is `palette.` followed by
one or more segments. `palette.enemies.fire` names a palette when
`enemies.fire` is a palette key, and `palette.enemies.fire.flame` names the
color `flame` in that palette.

*For exact address resolution.* A palette address resolves in this fixed
order:

1. Remove the leading `palette.`.
2. Try the whole remainder as a palette key. If that palette exists, the
   address names the palette.
3. Otherwise, split off the final segment. If the text before it is a palette
   key, and the final segment is a color name in that palette, the address
   names that color.
4. Otherwise, the address names no palette and no color. It is dangling.

The choice between a palette and a color arises only when the address has two
or more segments after `palette.`.

A color position is a field that requires a named color: `is` of a
`colors` entry, and `colors` and `against` of a `contrast` entry (§9.6). In a
color position, the address MUST name a color.

**Rules.**

1. A color name is unique within its palette.
2. The order of the array carries no meaning. Array positions are not
   citation targets.
3. Two entries MAY carry the same hex value.
4. A palette carries no scope, no tolerance and no promise about one color.
   Those belong to the measured entry that cites a named color (§9.6).
5. A palette key MUST NOT equal another palette key plus one of that other
   palette's color names. Example: a palette `enemies.fire` with a color
   `flame` cannot exist beside a palette with the key `enemies.fire.flame`.
6. In a color position, an address with one segment after `palette.` is a
   malformed color address.
7. In a color position, an address whose whole text after `palette.` is a
   palette key names that palette, not a color (step 2 above). Such an
   address is dangling too. It is not ambiguous, because the whole key is
   tried first.
8. The package refers to a palette when any of these names it:
   - the `palette` field of a mood (§9.3)
   - a color position that names one of its colors
   - chapter prose that cites the palette or one of its colors
9. A palette that the package does not refer to is legal. It produces a
   warning. The check is per palette. A color that nothing names produces no
   warning when the package refers to its palette.
10. Tools MUST preserve the written spelling of a color string, including its
    letter case. This rule applies to tools, not to packages.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `PALETTE_SHAPE` | error | A palette is not an array, or is an empty array. |
| `PALETTE_ENTRY_FORM` | error | A palette entry is neither a bare color nor a named color. |
| `PALETTE_COLOR_DUPLICATE` | error | A palette names the same color name twice. |
| `PALETTE_KEY_COLLISION` | error | A palette key equals another palette key plus one of that palette's color names (rule 5). |
| `PALETTE_UNREACHED` | warning | The package does not refer to a palette (rules 8 and 9). |
| `DIRECTION_COLOR_REFERENCE` | error | The value in a color position is not spelled `palette.<key>.<name>`: two or more kebab-case segments after `palette.`. |
| `DIRECTION_COLOR_DANGLING` | error | A correctly spelled address in a color position names a palette, or resolves to nothing. |

### 9.2 Pillars (`pillars`)

The field `pillars` states the visual priorities that a builder uses when
direction goals conflict with each other. `pillars` is an optional map from
names to visual priorities. Each visual priority is a non-empty string, and
the entry has no other shape.

**Rules.** The order in which the visual priorities are written is their
order of priority. People read this order. No check reads it.

### 9.3 Mood (`mood`)

A mood names the intended feeling, what it takes from other sources, and what
it must not be. `mood` is an optional map from mood names to mood objects.

**The mood object.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `intent` | A non-empty string | Yes | The intended feeling. |
| `anti` | A non-empty array. Each entry is a non-empty string or an anti-reference object (§9.4). | Yes | What the mood must not be. |
| `borrows` | A non-empty array of borrow objects (below) | No | What the mood takes from other sources. |
| `palette` | A palette address, such as `palette.board` | No | The palette of the mood. It is not a bare key and not a color address. |

**The borrow object.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `from` | A non-empty string | Yes | The source that the mood takes something from. |
| `what` | A non-empty array of non-empty strings | Yes | What the mood takes from the source. |
| `image` | A package-relative path (§9.9) | No | An image of the source. |
| `license` | A non-empty string | When `image` is present | The license of the image (§9.9). |

No other field is allowed in a mood or in a borrow.

**Rules.** When `palette` is present, it MUST name a declared palette. The
address resolves by the order in §9.1.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `DIRECTION_MOOD_PALETTE_DANGLING` | error | The `palette` field of a mood names a color, or does not resolve to a declared palette. |

### 9.4 Anti-references (`anti`)

An anti-reference names a result that the builder must avoid. `anti` is an
optional map from anti-reference names to anti-references. An anti-reference
is a non-empty string or an anti-reference object.

**The anti-reference object.** The same object is legal as an entry of a
mood's `anti` array (§9.3).

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `not` | A non-empty string | Yes | The result to avoid. |
| `image` | A package-relative path (§9.9) | No | An image of the result to avoid. |
| `license` | A non-empty string | When `image` is present | The license of the image (§9.9). |

No other field is allowed.

### 9.5 What must stay (`must_keep`)

`must_keep` names the visible qualities that every build preserves. This
document calls these qualities "what must stay". `must_keep` is an optional
map from names to non-empty strings.

### 9.6 Measured promises (`colors`, `contrast`, `timing`)

Measured promises attach a number or a tuning value to the parts of art
direction that a covering acceptance test can observe. `colors`, `contrast`
and `timing` are optional maps from promise names to the closed entries
below.

**`colors` entries.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `is` | A named color address `palette.<key>.<name>` (§9.1) | Yes | The promised color. |
| `within` | A number, `0` or more | Yes | The largest allowed distance from the declared color (rule 1). `0` requires the exact declared color. |
| `where` | A non-empty string | Yes | Which visible things the promise covers. |
| `while` | A non-empty array of non-empty strings | No | Free-text descriptions of the game states in which the promise applies. The promise applies in each state that an entry describes. Without `while`, the promise applies at all times. To require a combination of states, describe the combination in one entry. No check reads these strings as mode ids or ruleset ids. |

**`contrast` entries.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `colors` | A non-empty array of named color addresses (§9.1) | Yes | The colors that are measured against `against`. |
| `against` | One named color address (§9.1) | Yes | The color that each entry of `colors` is measured against. |
| `at_least` | A number above `0` | Yes | The smallest allowed WCAG 2.1 contrast ratio. |
| `where` | A non-empty string | Yes | Which visible things the promise covers. |
| `while` | A non-empty array of non-empty strings | No | Free-text descriptions of the game states in which the promise applies. The promise applies in each state that an entry describes. Without `while`, the promise applies at all times. To require a combination of states, describe the combination in one entry. No check reads these strings as mode ids or ruleset ids. |

**`timing` entries.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `key` | The dotted address of a key in `values` of `tuning.json` | Yes | The tuning value that the duration matches. |
| `where` | A non-empty string | Yes | The rendered event whose duration the build matches to the tuning value. |
| `while` | A non-empty array of non-empty strings | No | Free-text descriptions of the game states in which the promise applies. The promise applies in each state that an entry describes. Without `while`, the promise applies at all times. To require a combination of states, describe the combination in one entry. No check reads these strings as mode ids or ruleset ids. |

No other field is allowed in any of the three entries.

*The Handbook chapter
[Palette and color promises](https://opengdd.org/handbook/palette-and-color-promises/)
gives example values for `within` and `at_least`, and a complete test that
covers three measured promises (§9.8).*

**Rules.**

1. `within` is a CIEDE2000 distance in CIELAB D65. It is computed after the
   declared sRGB values are decoded.
2. Package validation does not compute the distance of `within`.
3. For each `contrast` entry, the validator decides from the declared sRGB
   values whether every color in the entry's `colors` array meets the
   `at_least` minimum against the entry's `against` color. The comparison
   uses a tolerance of 1e-9.
4. An open number cannot carry a timing promise. `key` names a key in
   `values`.
5. The procedure of the covering test (§6) says how the runner observes the
   event. The format defines no universal timing window.
6. This section fixes the metric for each kind of promise. No field in an
   entry can choose a different metric or describe the metric again.

An address in `is`, `colors` or `against` that fails is reported under §9.1.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `DIRECTION_CONTRAST_FAILED` | error | In a `contrast` entry, a color of the `colors` array has a contrast ratio below `at_least` against `against` (rule 3). |
| `DIRECTION_TIMING_KEY` | error | `key` names no key in `values` of `tuning.json`. |

### 9.7 Viewing (`viewing`)

Viewing says how the game is looked at when its art direction is judged: at
what speed, at what size, and on what display. `viewing` is one optional
object. It holds one set of viewing conditions, not a map with a separate set
for each viewing context.

**The viewing object.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `speed_and_size` | A non-empty string | Yes | The playback speed, and the size or framing at which the game is seen. |
| `calibration` | A non-empty string | Yes | The calibration of the display or output that is used when the art direction is judged. |
| `sequence` | A non-empty string | No | The span or order of play that must be included when the art direction is judged. |

No other field is allowed. `viewing` is not a citation target.

### 9.8 The covering rule

The covering rule ties each measured promise (§9.6) to an acceptance test
that cites it.

**Rules.**

1. Every `colors`, `contrast` and `timing` entry MUST be cited by the
   `direction_claims` field of at least one game-local test. §6 defines that
   field and how its paths resolve.
2. The test refers to the promise. The procedure of the test says how to
   test it. The procedure MAY name the location and the conditions of the
   promise as steps that lead to the observation.
3. The test MUST NOT state the value or the metric of the promise. The
   promise is the only authority for its value, location and conditions. The
   kind of the promise decides its metric (§9.6). Where a step of the
   procedure differs from the promise, the promise is correct. This is a
   prose obligation (§2d).
4. Apart from the steps that rule 2 allows, `direction.json` and
   `05-build-plan.md` do not repeat each other.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `DIRECTION_CLAIM_UNCOVERED` | error | No game-local test cites a `colors`, `contrast` or `timing` entry in `direction_claims`. |

### 9.9 Images

A mood borrow (§9.3) and an anti-reference object (§9.4) can carry an
`image` and its `license`.

**Rules.**

1. An `image` is a package-relative path.
2. The path MUST stay inside the package and MUST name an existing file.
3. An `image` carries a non-empty `license`.
4. The core format checks nothing else about the image or the license.

**Diagnostics.** A missing or malformed `image` or `license` field is a
`DIRECTION_SCHEMA` finding (§9).

| Code | Kind | Reported when |
| --- | --- | --- |
| `MEDIA_PATH_MISSING` | error | An `image` is not a package-relative path, names no existing file, or names something that is not a file. A path that leaves the package gets the same code under §1. |

### 9.10 What the audit owns

The audit of the experimental certification protocol (§2d) judges the entries
of `pillars`, `mood`, `anti` and `must_keep`: visual priorities, moods,
anti-references and what must stay. The audit judges these entries in a
finished build. Validation does not judge them.

**Rules.**

1. The judges, the people who judge the build for the audit, use the viewing
   conditions of the package (§9.7).
2. The judges do not know the builder's name.
3. Where a borrow refers to a real place, people, culture or living
   tradition, the audit uses qualified judges.
4. The audit records observations for each judged entry.
5. The audit reports adherence and coverage as two separate results.
   Adherence describes how well the build follows the entries that the audit
   judged. Coverage describes how much the audit judged.
6. `direction.json` has no field for any of these.

### 9.11 Migration

Appendix A lists the earlier forms of art direction, the code that the
validator reports for each one, and how to convert it.

## 10. Contracts

A contract is a reusable description of one game mechanism, not a business
agreement. It asks questions about the mechanism, and each question has a
closed set of answer options. A package adopts a contract with one file in the
optional folder `contracts/` at the package root. A package without this
folder is unaffected by this section.

### 10.1 What a contract is

**The three parts.**

| Part | What it is | Who writes it | Where it is |
| --- | --- | --- | --- |
| Definition | The whole contract, without the answers of any game: mechanism text, questions, declarations and rules. Its identity is `<contract>-<version>`. | A catalog publishes it. | In each adoption file, as its definition part (§10.2). |
| Adoption | A copy of a definition, with one game's answers, values, rows and verification inputs added. | The designer. | `contracts/<adoption>.json`, one file for each adoption. |
| Pack | The verification pack: templates from which validation generates acceptance tests for every adoption of one definition (§10.7). | Whoever published the contract. | `contracts/<contract>-<version>.pack.json`. It is optional. |

An adoption that has a matching pack file is checked. An adoption that has
none is promised (§10.8).

*The Handbook chapter [Contracts](https://opengdd.org/handbook/contracts/)
shows how to adopt a contract. The OpenGDD site has a
[contract catalog](https://opengdd.org/contracts/catalog/).*

**The folder.**

1. An adoption file declares its adoption by being in the folder. Nothing is
   registered in the manifest.
2. The adoption file holds its own copy of the definition. Validation
   therefore needs no registry and no network access.
3. The folder name is exactly `contracts`, in lowercase.
4. An entry whose name starts with a dot is ignored. Every other entry is one
   adoption file or one pack file. A subdirectory or any other file is not
   allowed.
5. A file whose name has the form `<contract>-<version>.pack.json`, where
   `<version>` is digits, is a pack file. Every other `.json` file is an
   adoption file.
6. The name of an adoption file without `.json` is the adoption id and its
   address (§10.9). The adoption id is kebab-case (§1) and holds no dot. The
   file holds no separate id field.
7. A package that already uses `contracts/` for unrelated files has to rename
   that folder.
8. A file counts as an adoption when it is a `.json` file other than a
   `.pack.json` file, it parses, and it holds an object that carries
   `contract` or `format`.

**Diagnostics.** In the codes and placeholders of §10, `instance` means an
adoption, and `envelope` means the adoption file.

| Code | Kind | Reported when |
| --- | --- | --- |
| `CONTRACT_FOLDER_CASE` | warning | A folder at the package root has a name that differs from `contracts` only in letter case. |
| `CONTRACT_FOLDER_ENTRY` | error | An entry in `contracts/` whose name does not start with a dot is a subdirectory, or is not a `.json` file. |
| `CONTRACT_FOLDER_RESERVED` | error | The folder holds at least one entry whose name does not start with a dot, and none of those entries counts as an adoption (rule 8). The finding names the number of entries and the migration command (Appendix A). This is the only case of this finding. |
| `CONTRACT_INSTANCE_FILENAME` | error | The name of an adoption file without `.json` is not kebab-case, or holds a dot. |
| `CONTRACT_INSTANCE_JSON` | error | An adoption file does not parse as JSON. |

### 10.2 The adoption file

An adoption file is one JSON object in two parts. The definition part is the
copy of the definition. The designer part holds the game's own choices.

*The definition part is for definition authors. The designer part is for
designers who adopt a contract.*

**Example.**

```json
{
  "contract": "clamped-meter",
  "version": 1,
  "origin": "https://catalog.example/clamped-meter-1",
  "summary": "A value that stays between a lowest and a highest point.",
  "mechanism": ["No change moves the value outside its limits."],
  "questions": {
    "overflow": {
      "asks": "A change would pass a limit. What happens?",
      "options": {
        "clamp": { "meaning": "The value stops at the limit." },
        "refuse": { "meaning": "The change does not happen." }
      }
    }
  },
  "declares": {
    "values": {
      "maximum": { "description": "The highest point.", "range": [1, 999] }
    }
  },
  "rules": { "maximum-above-zero": "maximum > 0" },
  "answers": { "overflow": "clamp" },
  "values": { "maximum": 100 }
}
```

**Top level.**

| Field | Part | Holds | Required | Meaning |
| --- | --- | --- | --- | --- |
| `contract` | Definition | A kebab-case string | Yes | The definition's id. |
| `version` | Definition | An integer | Yes | The definition's version. `<contract>-<version>` is the definition identity. |
| `origin` | Definition | A string | No, but recommended | Where the definition came from. |
| `summary` | Definition | A non-empty string | Yes | A summary of the contract. |
| `mechanism` | Definition | An array. The array MUST have at least one entry. Every entry MUST be a non-empty string. | Yes | What the builder implements. This text is the builder's exact obligation. |
| `questions` | Definition | A map from question ids to questions | Yes | The questions (§10.3). |
| `declares` | Definition | An object with an optional `values` map and an optional `rows` map | Yes | The value declarations (§10.4) and the row-set declarations (§10.5). The object is present even when it holds neither map. |
| `rules` | Definition | A map from rule names to rules | No | The rules (§10.6). |
| `pack` | Definition | `sha256:` followed by 64 lowercase hexadecimal digits | No | The digest of the pack (§10.8). |
| `answers` | Designer | A map from question ids to option ids | Yes | The game's answers (§10.3). |
| `values` | Designer | A map from value names to values | Yes | The game's values (§10.4). |
| `rows` | Designer | A map from row-set names to arrays of rows | No | The game's rows (§10.5). |
| `verification` | Designer | A map from template ids to inputs | No | The inputs for the pack's tests (§10.7). |

**Rules.**

1. No field is allowed at the top level, or in any object inside it, beyond
   the fields that this section lists.
2. A key that begins with `_` is an annotation, in every object. No check
   reads an annotation, and the closed-object checks ignore it.
3. The order of the fields at the top level has no meaning, and nothing
   checks it. The order of members inside the definition fields is part of
   the definition identity (§10.11).
4. These names are kebab-case (§1) and hold no dot: the contract id, question
   ids, option ids, value names, row-set names and record field names.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `CONTRACT_ENVELOPE_REQUIRED` | error | An object in the adoption file lacks a required field. |
| `CONTRACT_ENVELOPE_UNKNOWN` | error | An object in the adoption file, or a template `when`, carries a field that is not allowed there and is not an annotation. |
| `CONTRACT_ENVELOPE_TYPE` | error | A field holds a value of the wrong type, and no other code of this section applies. This includes a top level that is not an object, an empty `options` map, and an unknown field `type`. It also includes an empty `mechanism` array or entry, an empty `summary`, `asks`, `meaning` or value `description`, a malformed field or template `when` and a malformed `verification` entry. |
| `CONTRACT_ORIGIN_ABSENT` | warning | The definition has no `origin`. |
| `CONTRACT_NAME_GRAMMAR` | error | A name of rule 4 is not kebab-case or holds a dot. Also: a closed option is longer than 64 characters, a row value in a field with `pattern` breaks kebab-case, or a value name breaks rule 1 of §10.4. |

### 10.3 Questions and answers

The definition asks its questions in `questions`. The designer answers them
in `answers`.

*The parts about `questions` are for definition authors. The parts about
`answers` are for designers who adopt a contract.*

**Questions.** `questions` maps each question id to a question.

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `asks` | A non-empty string | Yes | The question. |
| `options` | A non-empty map from option ids to options | Yes | The closed set of answers. |
| `rationale` | A string | No | Explanatory text. |
| `guidance` | A string | No | Explanatory text. |
| `when` | A condition: exactly one of `flag`, `value-form`, `row-count`, `any` or `all` (§12.3) | No | The question is asked exactly when the condition holds. |
| `otherwise` | One non-empty string | No | Text that the builder implements as `mechanism` text while the question is not asked. |

**Options.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `meaning` | A non-empty string | Yes | What the option means. This text is the designer's obligation. |
| `semantics` | A string | No | A more precise wording. This text is the obligation of the builder and of the tests. |
| `rationale` | A string | No | Explanatory text. |

**Rules.**

1. A question without `when` is asked. A question with `when` is asked exactly
   when its condition holds.
2. Validation evaluates an adoption in three stages, in this order:
   1. It reads the forms of the unconditional values and the lengths of the
      row arrays.
   2. It decides which questions are asked, and reads their answers.
   3. It decides which value declarations are active (§10.4), and checks the
      conditional declarations and the conditional row fields.
3. The validator checks the shape of every question condition before it
   decides which questions are asked.
4. Dependencies through `flag`, including those inside `any` and `all`, MUST
   be acyclic. No question depends on itself, directly or through other
   questions.
5. While the question is not asked, the builder implements the `otherwise`
   text as `mechanism` text. It is not a default answer. It does not enter
   `answers` and does not make the question asked.
6. An answer recorded for a question that is not asked does not replace the
   `otherwise` text.
7. Using any one of the five forms in the list below changes the requirements
   for the whole definition. A definition that uses at least one of these
   forms MUST carry `otherwise` on every question with `when`, and
   `when-empty` on every row set (§10.5). This covers every question with
   `when` and every row set of the definition, not only the ones that use
   one of the five forms. A definition that uses none of these forms need not
   carry `otherwise` or `when-empty`.
   - `otherwise` on a question
   - a question `when` that holds `value-form`, `row-count`, `any` or `all`
   - `forms` or `when` on a value declaration (§10.4)
   - `when-empty` on a row set
   - a rule written as an answer-aware object (§10.6)
8. When `semantics` is present, it MUST NOT contradict `meaning`. This is a
   prose obligation (§2d).
9. `answers` maps question ids to option ids. Every asked question MUST have
   exactly one answer, and the answer is one of its option ids.
10. An answer to a question that is not asked is allowed, and produces a
    warning.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `CONTRACT_QUESTION_CONDITION` | error | A question's `when` breaks §12.3. This includes an unknown form such as `row`, any `row-has`, and an undeclared name inside `value-form`, `row-count`, `any` or `all`. |
| `CONTRACT_QUESTION_CYCLE` | error | The questions depend on each other in a cycle through `flag` (rule 4). |
| `CONTRACT_QUESTION_OTHERWISE` | error | `otherwise` is not one non-empty string, or a question with `when` lacks `otherwise` where rule 7 requires it. |
| `CONTRACT_ANSWER_MISSING` | error | An asked question has no answer. |
| `CONTRACT_ANSWER_UNKNOWN` | error | An answer is not one of its question's option ids, or `answers` names a question that is not declared. |
| `CONTRACT_ANSWER_NOT_ASKED` | warning | `answers` answers a question that is not asked. |

### 10.4 Values

The definition declares named numbers in `declares.values`. The adoption
supplies them in `values`.

*The parts about `declares.values` are for definition authors. The parts
about `values` are for designers who adopt a contract.*

**Value declarations.** `declares.values` maps each value name to a closed
object.

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `description` | A non-empty string | Yes | What the value is. |
| `range` | `[minimum, maximum]`: two finite numbers, the minimum not above the maximum | No | The inclusive range of the resolved value. |
| `forms` | A non-empty array that holds `number`, `citation`, or both | No | The forms that the adoption can supply. Without `forms`, the only form is `number`. |
| `when` | A condition: exactly one of `flag`, `value-form`, `row-count`, `any`, `all` or `row-has` (§12.3) | No | The declaration is active exactly when the condition holds. |

**Supplied values.** `values` maps value names to values.

| Form | The value is |
| --- | --- |
| `number` | A finite plain JSON number. |
| `citation` | A value citation: a string that names a dotted tuning address, or another numeric value of the same adoption (§10.10). |

**Rules.**

1. A value name MUST begin with a lowercase letter, so that a bare token of
   digits in a rule is always a literal number. A value name MUST NOT be
   `and`, `or` or `not`, which the rule grammar reserves.
2. A value name MUST NOT be the same as a question id.
3. A declaration without `when` is active. A declaration with `when` is
   active exactly when its condition holds.
4. A declaration condition reads only the forms of the unconditional
   values, the lengths of the row arrays, the recorded answers, and the row
   fields that `row-has` names. Declarations therefore cannot depend on each
   other in a cycle, and no cycle check exists.
5. `values` supplies one value of an accepted form for every active
   declaration, no more and no fewer. An inactive declaration MUST have no
   value.
6. The adoption file keeps the citation text as written. Package validation
   resolves each value citation to a number (§10.10).
7. Every resolved number MUST be inside its declared `range`.
8. Contract values are Fixed. §5 states the rule that keeps them out of
   personalization.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `CONTRACT_VALUE_CONDITION` | error | A declaration's `when` breaks §12.3, or names an undeclared question, option, value, row set or row field. This includes `row-has` inside `any` or `all`, and `row-has` reading a field that is not unconditional and required. |
| `CONTRACT_VALUE_FORM` | error | A declaration's `forms` is not a non-empty array of `number`, `citation`, or both. |
| `CONTRACT_VALUE_TYPE` | error | A supplied value has a form that its declaration does not accept, or is neither a finite number nor a citation string. |
| `CONTRACT_VALUE_MISSING` | error | An active declaration has no value. |
| `CONTRACT_VALUE_INACTIVE` | error | A value is supplied for a declaration that exists but whose condition does not hold. |
| `CONTRACT_VALUE_UNKNOWN` | error | A value names no declaration. |
| `CONTRACT_VALUE_RANGE` | error | A declared `range` breaks its shape, or a resolved number is outside its declared `range`. |
| `CONTRACT_NAME_UNIQUE` | error | A value name is the same as a question id. |

### 10.5 Row sets and rows

The definition declares tables of rows in `declares.rows`. The adoption
supplies each table as an inline array in `rows`.

*The parts about `declares.rows` are for definition authors. The parts about
`rows` are for designers who adopt a contract.*

**Row-set declarations.** `declares.rows` maps each row-set name to an object.

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `description` | A string | No | What the row set is. |
| `record` | A record schema in the contract form (§12.1) | Yes | The fields of each row. |
| `when-empty` | One non-empty string | No | Text that the builder implements as `mechanism` text while the adoption's array for the row set is empty. |

A row-set declaration has no key for a maximum number of rows.

**Rules.**

1. `rows` holds one inline array for every declared row set, including `[]`
   when the set is empty. It holds no other key. A row set cannot be read
   from a collection (§1b).
2. Each row is one closed object. It carries only fields that the record
   schema declares.
3. A required field is present. A field with `when` is present exactly when
   its condition holds (§12.1).
4. A present value has the field's type and satisfies the field's
   `options`, `pattern` and `unique` members (§12.1).
5. A present number MUST be inside the field's `within` pair when the
   adoption supplied both named bounds. A named bound reads the value's
   resolved number (§10.4).
6. A `within` bound that names an inactive declaration, or a value that the
   adoption did not supply, leaves the pair unchecked.
7. `when-empty` supplies no row. It does not make the row set optional, and
   it does not change whether a question is asked.
8. Rows are Fixed package data. They are validated whether or not a pack
   test uses them.
9. A field of type `citation` follows §10.10.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `CONTRACT_ROWS_SHAPE` | error | `rows` is not a map, a row set is not an array, or a row is not an object. |
| `CONTRACT_ROWS_BINDING` | error | `rows` lacks a declared row set, or names a row set that is not declared. |
| `CONTRACT_ROW_FIELD_SHAPE` | error | A field shape has one of these faults: `required` together with `when`; `pattern` or `options` on a field that is not `string`; a `pattern` that is not `kebab-case`; an `options` value that is not a non-empty array; `within` on a field that is not `number` or `integer`; a `within` value that is not a pair of value names or finite numbers; on an `integer` field, a literal number bound that is a fraction; a lower bound above the upper bound, as two literal numbers or after named bounds resolve. On an `integer` field, a named bound that resolves to a fraction is allowed. The codes of §10.2 whose names start with `CONTRACT_ENVELOPE_` report a missing `type`, an unknown member, and a field shape that is not an object. They also report a `type`, `required`, `unique` or `description` of the wrong type. |
| `CONTRACT_ROW_FIELD` | error | A row carries an undeclared field or lacks a required one. Or a row carries a field whose condition does not hold, holds a wrong type, or repeats a `unique` value. |
| `CONTRACT_ROW_CHOICE` | error | A string value is not in the field's `options`. |
| `CONTRACT_ROW_RANGE` | error | A number is outside the field's resolved `within` pair. |
| `CONTRACT_ROW_WHEN_EMPTY` | error | `when-empty` is not one non-empty string, or a row set lacks `when-empty` where rule 7 of §10.3 requires it. |

### 10.6 Rules

`rules` maps each rule name to a rule. A rule is a numeric comparison or an
answer-aware rule object.

*This subsection is for definition authors.*

**The two kinds.**

| Kind | Shape | Evaluated |
| --- | --- | --- |
| Comparison | One string in §4's one-comparison grammar, with its operators, its three functions and its arithmetic, over the definition's bare value names | At package validation, over the resolved values of the adoption. At build-record validation, over the values at `contracts.<adoption>.<value>` in the resolved snapshot. |
| Answer-aware rule | A closed object (below) | At package validation only |

**Answer-aware rules.**

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `forbid` | One `flag` condition, or one `any` or `all` whose members are `flag` conditions (§12.3) | Yes | The combination of asked answers that the rule forbids. |
| `message` | A non-empty string | Yes | The text of the finding, written by the definition's author for designers. |
| `severity` | `error` or `warning` | No | The severity of the finding. The default is `error`. |

**Rules.**

1. A rule name is kebab-case.
2. A comparison that names a conditional declaration is evaluated only while
   every declaration that it names is active.
3. At build-record validation, a declaration is active exactly when its
   address `contracts.<adoption>.<value>` is present in the resolved
   snapshot. A comparison that names an absent address is skipped, not
   failed.
4. A comparison that needs active values that the adoption did not supply is
   invalid. The finding names those values.
5. A false comparison in the build record is reported as `BUILD_CONTRACT_RULE`
   (§7).
6. When the `forbid` condition of a valid answer-aware rule holds, package
   validation MUST report `CONTRACT_RULE_FORBIDDEN` at the rule's `severity`
   and MUST use its `message`.
7. Build-record validation MUST NOT evaluate an answer-aware rule, because
   the resolved snapshot carries no answers.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `CONTRACT_RULE_INVALID` | error | Anything is wrong with a rule or its name. The cases include a name that is not kebab-case, a comparison outside the grammar, a comparison that breaks rule 4, and an answer-aware rule that breaks its table or §12.3. |
| `CONTRACT_RULE_FAILED` | error | A comparison is false at package validation. |
| `CONTRACT_RULE_FORBIDDEN` | error or warning | The `forbid` condition of a valid answer-aware rule holds. The severity is the rule's `severity`, and the finding uses its `message`. |

### 10.7 The pack

A pack holds the templates from which validation generates acceptance tests.
It is one optional file, `contracts/<contract>-<version>.pack.json`. The one
file serves every adoption of the definition `<contract>-<version>`. Its tests
are generated from each adoption's answers.

*This subsection is for pack authors. The parts about `verification` are also
for designers who adopt a contract.*

**Example.**

```json
{
  "contract": "clamped-meter",
  "version": 1,
  "templates": [
    {
      "id": "stops-at-maximum",
      "title": "A gain stops at the maximum",
      "type": "scenario",
      "expand": "once",
      "when": { "flag": { "overflow": ["clamp"] } },
      "test": {
        "type": "scenario",
        "given": "{{instance}} is 1 below {{value-cite:maximum}}",
        "when": "a gain of 5 arrives",
        "then": "{{instance}} equals {{value-cite:maximum}}"
      },
      "text": "A gain never moves {{instance}} above {{value-cite:maximum}}."
    }
  ]
}
```

**The pack file.** The pack is one closed object.

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `contract` | A kebab-case string | Yes | The definition's id. It agrees with the file name. |
| `version` | An integer | Yes | The definition's version. It agrees with the file name. |
| `templates` | An array of templates | Yes | The templates, in authored order. |

**Templates.** A template is one closed object.

| Field | Holds | Required | Meaning |
| --- | --- | --- | --- |
| `id` | A kebab-case string, unique in the pack | Yes | The template id. |
| `title` | A string | Yes | The title of the generated test. |
| `type` | `scenario` or `general` | Yes | The test type. It equals `test.type`. |
| `expand` | `once` or `per-row` | Yes | One test, or one test for each matching row. |
| `test` | An object | Yes | The test block. Validation generates a §6 test block from it. |
| `text` | A string | Yes | Prose that goes with the generated test. It is not a field of the test block. The published validator writes it after the block. |
| `when` | A condition: `flag`, and on a `per-row` template also `row` (§12.3) | No | The condition for the template to be live. |
| `bindings` | A map from kebab-case binding ids to bindings | No | Phrases selected by an answer or a row field. |
| `collection` | A declared row-set name | Only with `per-row` | The row set that the template expands. A `once` template has no `collection`. This field does not name a collection of §1b. |
| `inputs` | A map that can hold `scope` and `seeds`. An empty map is allowed. | No | The inputs that the adoption supplies in `verification`. |

**Inputs.** Each input declaration in `inputs` is a closed object whose
only field is an optional `default`. The adoption supplies an input under
`verification.<template-id>`, in the same shape as the `default`.

| Input | `default` and the supplied input hold |
| --- | --- |
| `scope` | A non-empty string. |
| `seeds` | A non-empty array of non-empty strings. |

**Bindings.** A binding carries exactly one selector and a `map`.

| Field | Holds | Meaning |
| --- | --- | --- |
| `flag` | The id of a question in the definition | The selector reads the adoption's recorded answer. Each `map` key is one of that question's option ids. |
| `row_field` | The name of a field in the template's row set | The selector reads the row being expanded. Each `map` key is one of that field's values. Legal on a `per-row` template only. |
| `map` | A map from selected values to phrases | Required. `{{bind:<id>}}` renders the phrase for the selected value. |

**Placeholders.** This table lists every placeholder that a template can
hold.

| Placeholder | Renders |
| --- | --- |
| `{{instance}}` | The adoption id. |
| `{{value-cite:<value>}}` | The address `contracts.<adoption>.<value>`, never the number. |
| `{{inputs:scope}}`, `{{inputs:seeds}}` | The input from `verification`, or its `default`. |
| `{{bind:<id>}}` | The phrase that the binding selects. |
| `{{row.<field>}}` | The field of the row being expanded, in a `per-row` template. |

**Rules.**

1. The pack is identified by the SHA-256 of its exact file bytes. Under that
   identity it never changes.
2. One pack serves every adoption of one definition. A package holds at most
   one pack for each definition identity.
3. A `once` template is live when its `when.flag` condition holds and every
   question that a binding reads is asked.
4. A `per-row` template is live when the conditions of rule 3 hold, and at
   least one row satisfies its `when.row` condition and carries every field
   that the template reads.
5. A template that holds `{{value-cite:<value>}}` for an inactive
   declaration is not live. No live template reads an inactive declaration.
6. A template that is not live generates no test and accepts no
   `verification` entry. Its placeholders follow these rules:
   - In a template that rule 5 makes not live, the placeholder that names the
     inactive declaration stays unresolved. No placeholder finding is reported
     for it.
   - A placeholder in a template that is not live is not a citation. No
     `CONTRACT_CITATION_DANGLING` is reported for it.
   - An unknown placeholder is still reported as `CONTRACT_PLACEHOLDER`, in
     every template.
7. A live `once` template generates one test named `<adoption>/<template>`.
8. A live `per-row` template generates one test for each matching row, in
   authored row order, named `<adoption>/<template>/<row-id>`. Tests follow
   the authored order of the templates.
9. A row set that a `per-row` template expands therefore declares a field
   `id`: a required, unique `string` with `pattern` `kebab-case`.
10. A live template whose input has no `default` MUST have that input in
    `verification`.
11. A live binding MUST have a phrase for the value that it selects.
12. A placeholder that is a whole JSON value is replaced by the raw JSON
    value, so a supplied number stays a JSON number. A placeholder inside a
    string is replaced by text.
13. Expansion reads the pack's `title`, `test`, `text` and binding phrases
    once. Values that an adoption or a row supplies are never scanned again.
14. Every string that an adoption supplies, including strings nested in an
    array or object, MUST contain none of `{{`, `}}` and a three-backtick
    code fence.
15. Annotations are removed from a generated test. A generated test carries
    no `direction_claims`.
16. Every name MUST point at something declared. `CONTRACT_REFERENCE`
    reports these cases:
    - a top-level `flag` in a question, field or template `when` names an
      undeclared question or option
    - a `row` in a field or template `when` names an undeclared field
    - a `within` bound, a `collection` or a binding selector names nothing
      declared
    - a placeholder names an undeclared value, input, binding or row field
    - a `verification` entry names no template, or a template that is not
      live
    - a live template lacks a required input (rule 10)

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `CONTRACT_PACK_SHAPE` | error | The pack's own shape is wrong. It does not parse, or a field of the pack, a template or an input is missing, unknown or of the wrong type. This includes a bad or repeated template id, a `type` unlike `test.type`, and a misplaced `collection`. It also includes a file name that disagrees with the fields, and a second pack for one identity. |
| `CONTRACT_BINDING_SHAPE` | error | A binding is not an object, carries no selector or both selectors, or has no `map`. |
| `CONTRACT_BINDING_MAP` | error | A `map` key names no declared option, or a live binding has no phrase for the selected value. |
| `CONTRACT_PLACEHOLDER` | error | A placeholder is unknown or unreachable, stays unresolved in a generated test, or puts an array or object inside a string. |
| `CONTRACT_INJECTION` | error | A supplied string breaks rule 14. |
| `CONTRACT_REFERENCE` | error | A name points at nothing declared (rule 16). |
| `CONTRACT_ROW_ID` | error | A row set that a `per-row` template expands lacks the `id` field of rule 9. |
| `CONTRACT_WHEN_DOMAIN` | error | The `when` of a `once` template carries `row`. |
| `CONTRACT_TEST_DIRECTION_CLAIMS` | error | A generated test carries `direction_claims`. |

### 10.8 Checked and promised

A checked adoption has a matching pack file. A promised adoption has no
matching pack file. Neither status reports a result of validation, and neither
says that a build has passed the tests.

*This subsection is for designers who adopt a contract, and for builders.*

**Rules.**

1. An adoption with no matching pack is promised, even when its definition
   names `pack`. No finding is reported for the absent file.
2. The requirements of a promised adoption apply to the builder in the same
   way as Fixed prose does. Validation does not judge whether a finished
   build meets them. The experimental certification protocol judges that
   (§2d).
3. A file `contracts/<contract>-<version>.pack.json` makes every adoption of
   that definition checked.
4. When the pack is present, the definition's `pack` MUST equal `sha256:`
   followed by the SHA-256 of the pack's exact bytes.
5. A present pack with the same identity makes the adoption checked, even
   when another pack finding is reported. A malformed pack cannot turn a
   checked adoption back into a promised one.
6. The published validator generates the tests of a checked adoption for
   reading (`--render-contract-tests`). Generating them changes no file.
7. Generated tests are never written into `05-build-plan.md`.
8. Generated tests use the §6 test shapes. They run under the same runner and
   audit duties as game-local tests, and count in the build record's
   acceptance total.
9. The build MUST pass every generated test. A build record lists a failed
   generated test in `not_passed`, under its exact name (§10.7). An otherwise
   valid record is then incomplete.
10. A build record checked with its source package carries
    `evidence.contracts` exactly when the package has checked adoptions.
    It holds one `{ "adoption": "<id>", "pack": "sha256:<digest>" }` entry
    for each checked adoption, and none for a promised adoption.
11. The entries MUST match the source pack digests. The findings are
    `BUILD_CONTRACTS_MISSING`, `BUILD_CONTRACTS_UNEXPECTED` and
    `BUILD_CONTRACT_PACK` (§7).

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `CONTRACT_PACK_HASH` | error | A pack is present, and its definition names no `pack` or names a different digest. |
| `CONTRACT_PACK_ORPHAN` | error | A pack's `contract` and `version` match no adoption. |
| `CONTRACT_BLOCK_RETIRED` | error | `05-build-plan.md` holds a generated-contracts marker block. |

### 10.9 Addresses

An adoption's address is `contracts.<adoption>`. The address of one of its
values is `contracts.<adoption>.<value>`. §12.2 lists both forms.

*This subsection is for designers who adopt a contract, and for builders.*

**Rules.**

1. Both forms are written exactly as shown, in prose and in JSON. They resolve
   against the adoption file. `contracts` is a reserved first segment (§12.2).
2. An adoption address or a value address that resolves to nothing is
   dangling, and a dangling address is an error.
3. The address of an inactive declaration is absent, not dangling. Only a
   citation that reads it fails, with `CONTRACT_CITATION_DANGLING`.
4. Chapter prose is not such a citation. §4's prose check resolves an
   inline-code `contracts.` token against the adoption's declared value names,
   active or not. A chapter that names an inactive declaration therefore
   reports nothing.
5. Contract values enter `resolved_tuning.values` under their addresses
   `contracts.<adoption>.<value>`, as resolved numbers. A value supplied as a
   number is recorded as that number. A value supplied as a citation is
   recorded as the number that the citation resolves to.
6. The address of an inactive declaration is absent from the resolved
   snapshot (§7, check 4).

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `PROSE_CITATION_DANGLING` | error | An inline-code prose token that starts with `contracts.` names no declared adoption and no declared value. |

### 10.10 Citations in a contract

A value citation supplies a value. A row citation is the value of a row field
of type `citation`.

**The two kinds.**

| Kind | Where | Legal targets |
| --- | --- | --- |
| Value citation | A value of form `citation` in `values` (§10.4) | A dotted tuning address, or `contracts.<adoption>.<value>` naming a numeric value of the same adoption |
| Row citation | A row field of type `citation` (§12.1) | A dotted tuning address, a contract address (§10.9), or one chapter anchor `<file>.md#<anchor>` |

**Rules.**

1. Every citation MUST resolve. No citation targets an open number.
2. A value citation MUST resolve to a number. It can cite a key in `values`
   of `tuning.json`, with or without a range (§4), or a numeric value of the
   same adoption. It uses the number that the package states, also when a
   build changes a cited ranged number. It MUST NOT target another adoption.
   A chapter anchor is not a value citation.
3. Value-citation chains MUST be acyclic. No citation leads back to itself,
   directly or through other citations.
4. A chapter anchor MUST match exactly one heading in the file, under the
   anchor rule below. A heading line inside a fenced code block is not a
   heading.
5. The cited section runs from that heading to the next heading with the
   same number of `#` marks or fewer, or to the end of the file. It
   includes its subsections.
6. A chapter target MUST be Fixed. No `> DELEGATED:` or
   `> PERSONALIZATION:` authority tag covers any line of the cited section
   or appears inside it.
7. The dangling rule applies to value citations, to row citations, and to
   `{{value-cite:<value>}}` placeholders in live templates (§10.7).

**The anchor of a heading (normative).** A heading's anchor comes from its
text by these steps, in order:

1. lowercase it;
2. remove every HTML tag, meaning every run from `<` through the next `>`;
3. remove every backtick, asterisk, underscore, and tilde;
4. remove every remaining character that is not a Unicode letter, a Unicode
   number, whitespace, or a hyphen;
5. trim leading and trailing whitespace; and
6. replace each run of whitespace with a single hyphen.

The rule adds no suffix that makes equal anchors different. Two headings in
one file can produce the same anchor. A citation of such an anchor fails.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `CONTRACT_CITATION_GRAMMAR` | error | A citation is not a non-empty string in its grammar, or holds a colon. A value citation that starts with `contracts.` does not have exactly three segments. |
| `CONTRACT_CITATION_DANGLING` | error | A citation's target does not resolve, including an inactive declaration, a value that was not supplied, a missing file, and an anchor that matches no heading. |
| `CONTRACT_CITATION_AMBIGUOUS` | error | A chapter anchor matches more than one heading. |
| `CONTRACT_CITATION_AUTHORITY` | error | A chapter target is not Fixed (rule 6). |
| `CONTRACT_CITATION_OPEN` | error | A value citation or a row citation targets an open number. |
| `CONTRACT_CITATION_NON_NUMERIC` | error | A value citation resolves to a target that is not a number. |
| `CONTRACT_CITATION_CROSS_ADOPTION` | error | A value citation targets another adoption. |
| `CONTRACT_CITATION_CYCLE` | error | A value-citation chain leads back to itself. |

### 10.11 Forking and definition identity

A catalog definition never changes under its published identity. Editing
the definition part of a copy creates a modified definition, called a fork.

**Rules.**

1. Two adoptions with the same `contract` and `version` are two copies of
   one definition, each with its own designer part. Their definition parts
   MUST be equal under rule 2.
2. *For definition authors and tool makers.* To compare two copies,
   validation does this for each copy:
   1. It removes `answers`, `values`, `rows`, `verification` and every
      annotation.
   2. It writes the remaining definition fields in the order of the table
      in §10.2, whatever order the file uses.
   3. It writes them as JSON indented with two spaces.

   Inside those fields, the order of the members of each JSON object is
   part of the identity. The same members in a different order count as a
   difference.
3. A fork loses the catalog's identity and its verification claim. The
   catalog's statements about that definition and its pack no longer
   apply to it.
4. A fork keeps its status in the package, checked or promised. The presence
   of a matching pack decides the status (§10.8). A fork without a matching
   pack is promised.
5. To check a fork as its own contract, publish it under a new `contract` or
   `version`, with its own `origin` and its own pack, and update `pack`.
6. Finding that a copy differs from the catalog's definition is audit
   work. The audit records a finding that names the difference.
7. The audit records the SHA-256 digest of the definition part that it
   judged (§2d). That digest identifies the exact definition contents that
   its finding or verdict covers.
8. The package validator does not contact a catalog. It cannot discover
   that two unrelated definitions claim the same id and version. Catalog
   identity rules therefore apply only to unforked copies.

**Diagnostics.**

| Code | Kind | Reported when |
| --- | --- | --- |
| `CONTRACT_DEFINITION_DIVERGENT` | error | Two adoptions with the same `contract` and `version` have different definition parts under rule 2. |

### 10.12 What this layer does not do

- **No registry or online lookup.** Definitions and packs are shared as
  copies and stay readable offline. The catalog publishes them but does
  not make their ids globally unique.
- **No dependencies between contracts.** A definition is readable and
  removable on its own.
- **No composition algebra.** The format has no formal method that derives
  a combined contract from two contracts.
- **No implementation code.** A contract specifies behavior. A library can
  claim that it implements that behavior only through evidence outside the
  format.
- **No semantic review by validation.** Validation checks the file shape,
  references, ranges, rules, pack pairing and generated test shape. It does
  not decide whether a definition is useful or its mechanism and options
  are well designed. It does not judge whether the text of `otherwise`,
  `when-empty` or a rule's `message` is true, complete, clear or in the
  right voice. It does not judge whether a rule's `message` states one clear
  claim. The review of the definition decides these.

## 11. What this version deliberately excludes

This section lists the subjects for which this version defines no
standardized mechanism. Such a subject has no structured fields, no checks
and no certification profile. An exclusion that belongs to one mechanism is
in the "Not in this version" list of that mechanism's section.

**Rules.**

1. Ordinary chapter prose can still describe an excluded subject.
2. A Fixed statement about an excluded subject applies to the builder like any
   other Fixed statement.

**Excluded subjects.**

- Networked multiplayer. Rules for several players on one device are
  ordinary chapter prose.
- Rendered-capture certification for 3D graphics. The audit profile defines
  one browser capture recipe. It defines no standardized recipe for 3D
  rendered captures (`conformance/CERTIFICATION.md#audit-profile`).
- Binary asset pipelines.
- Audio direction. The format has no structured audio vocabulary and no
  audio measurement.
- Localization structure.
- Monetization design beyond the optional commerce split, including in-app
  purchase design.
- Any registry API.
- Target families beyond web delivery (`web-2d`, `web-3d`).

**3D packages are not excluded.** A `web-3d` package validates. A build of a
`web-3d` package can assemble a full build record under the experimental
certification protocol (§2d). This is possible when its complete acceptance
suite needs only logic and state observations.

## 12. Shared tables

This section holds three grammars that several sections use: the record-field grammar, the reference forms and the condition forms. A section that uses one of these grammars cites the table here and does not restate it.

### 12.1 Record-field grammar

A record schema maps each field name to a field shape. A record schema appears in two objects: the schema file of a collection (§1b) and a row-set declaration in a contract definition (§10.5). This section calls them the collection form and the contract form. A contract field of type `citation` (§10.10) is a contract field with a narrower set of members.

*This subsection is for readers who write a record schema.*

**Field names.**

- In the collection form, a field name is one or more lowercase letters, digits, underscores and hyphens. It does not begin or end with a hyphen.
- In the contract form, a field name is kebab-case (§1). It cannot hold an underscore.
- In both forms, a key that starts with `_` is an annotation, not a field name.

**Members.** A field shape is an object. This section calls its fields members, to distinguish them from the record field that the shape describes.

| Member | Holds | Meaning |
| --- | --- | --- |
| `type` | One value from the type table below | The kind of value that the field holds. |
| `required` | A Boolean | `true` means that every record or row carries the field. |
| `when` | A condition (§12.3) | The field is required exactly when the condition holds, and forbidden otherwise. |
| `open` | `true` | The field holds an open number (§1b). |
| `options` | A non-empty array of kebab-case strings, each at most 64 characters | The closed set of allowed values. |
| `pattern` | Only `"kebab-case"` | The value is kebab-case. |
| `unique` | A Boolean | `true` means that no two values of the field are equal, compared as JSON text. |
| `description` | A string | How the field is read. |
| `to` | A collection id | The collection that holds the linked records (§1b). |
| `many` | A Boolean | `true` means that the field holds an array of ids. Otherwise the field holds one id. |
| `loops` | A Boolean | `false` forbids cycles in the links of the field (§1b). |
| `mirrored_by` | A field name | The link field on the target collection that links back (§1b). |
| `of` | A record schema in the collection form | The closed record schema for each entry of the list. |
| `within` | A pair `[lower, upper]`. Each bound is a value name from `declares.values` or a finite JSON number. | The inclusive bounds of the value (§10.5). |

No other member is allowed in either form.

**Where each member is allowed.** A cell that names a type applies only to a field of that type. On a field of any other type, the member is not allowed.

| Member | Collection form (§1b) | Contract form (§10.5) | `citation` field (§10.10) |
| --- | --- | --- | --- |
| `type` | Required. | Required. | Required. |
| `required` | Allowed. | Allowed. | Allowed. |
| `when` | Allowed. | Allowed. | Allowed. |
| `open` | Allowed on `number` or `integer`. | Not allowed. | Not allowed. |
| `options` | Allowed on `string`. | Allowed on `string`. | Not allowed. |
| `pattern` | Allowed on `string`. | Allowed on `string`. | Not allowed. |
| `unique` | Allowed. | Allowed. | Allowed. |
| `description` | Allowed. | Allowed. | Allowed. |
| `to` | Required on `link`. | Not allowed. | Not allowed. |
| `many` | Allowed on `link`. | Not allowed. | Not allowed. |
| `loops` | Allowed on `link`. | Not allowed. | Not allowed. |
| `mirrored_by` | Allowed on `link`. | Not allowed. | Not allowed. |
| `of` | Required on `list`. | Not allowed. | Not allowed. |
| `within` | Not allowed. | Allowed on `number` or `integer`. | Not allowed. |

**Further rules for some members.**

- In a `citation` field, the value of `type` is `citation`.
- In the collection form, `when` holds `row` only. In the contract form and in a `citation` field, `when` holds `flag`, `row`, or both.
- In the collection form, `open` is allowed on a top-level field only.
- In the collection form, the comparison of `unique` covers every record of the collection. Inside `of`, the comparison covers every entry of every record. In the contract form and in a `citation` field, the comparison covers every row of the row set.
- On an `integer` field, a number bound of `within` is a whole number.

**Types.**

| `type` | The field holds | Collection form | Contract form |
| --- | --- | --- | --- |
| `number` | A JSON number. In an open field, the value can also be `null`. | Allowed. | Allowed. |
| `integer` | A whole number. In an open field, the value can also be `null`. | Allowed. | Allowed. |
| `string` | A string. | Allowed. | Allowed. |
| `citation` | A string: a dotted tuning address, a contract address, or one chapter anchor `<file>.md#<anchor>` (§12.2, §10.10). | Not allowed. | Allowed. |
| `grid` | A non-empty array of strings, one string per row (§7a). | Allowed on a top-level field only. | Not allowed. |
| `link` | One record id, or an array of record ids (§1b). | Allowed. | Not allowed. |
| `list` | An array of objects. Each object follows the record schema in `of`. | Allowed. | Not allowed. |

**Combination rules.**

1. A field shape MUST NOT carry both `required` and `when`, whatever the value of `required` is.
2. A field shape MUST NOT carry both `open` and `required`, whatever the value of `required` is.
3. A field without `required: true` and without `when` is optional.
4. A field shape inside `of` uses the collection form, with two exceptions. No field inside `of` has the type `grid`, and no field inside `of` carries `open`.
5. A `list` field inside `of` carries its own `of`. The grammar repeats at every depth.

### 12.2 Reference forms

A reference form is a spelling that cites or declares something in the package. Most forms cite. The ruleset tag declares. This table lists every reference form. The section in the column "Defined in" holds the rules for resolving the form and the findings when the form fails.

| Form | Cites | Legal in | Defined in |
| --- | --- | --- | --- |
| `<key>`, a dotted token with no reserved first segment | A key of `values` or `open` in `tuning.json`. The key is written alone, with no prefix. | Chapter prose. A contract citation (§10.10). | §4 |
| `values.<key>`, `ranges.<key>` | The entry for `<key>` in the map of that name in `tuning.json`. | Chapter prose. | §4 |
| `rules.<name>` | The named rule in `tuning.json`. | Chapter prose. | §4 |
| `<kind>.<key>`, with exactly two segments | One entry of a map in `direction.json`. `<kind>` is one of `pillars`, `mood`, `anti`, `must_keep`, `colors`, `contrast` or `timing`. | Chapter prose. JSON fields that cite the same address. | §9 |
| `palette.<key>`, `palette.<key>.<color>` | A palette, or one named color of a palette, in `direction.json`. The whole key is tried first (§9.1). | Chapter prose. JSON fields that cite the same address. | §9.1 |
| `clocks.<name>`, with exactly two segments | One clock in `clocks.json`. | Chapter prose. | §4b |
| `runtime.<name>`, where `<name>` is one or more dotted segments | One runtime value. | Chapter prose. A clock's `advances`. A test's `unchanged.values`. | §4b |
| `contracts.<adoption>` | One adoption in `contracts/`. | Chapter prose and JSON. | §10.9 |
| `contracts.<adoption>.<value>` | One value of that adoption. | Chapter prose and JSON. | §10.9 |
| `collections.<collection>` | One collection, as a set of records. | Chapter prose. | §1b |
| `collections.<collection>.<record>` | One record. | Chapter prose. | §1b |
| `collections.<collection>.<record>.<field>` | One field of one record. | Chapter prose. A rule in `tuning.json` (§4). | §1b |
| `manifest.<...>`, `build.<...>` | Nothing in this version. The token is not checked and is not a citation. | Chapter prose. | §4 |
| `<file>.md#<anchor>` | One section of a chapter, found by the anchor rule of §10.10. | A `citation` field of a contract row. | §10.10 |
| `> RULESET: <id>` | Declares the ruleset `<id>`. | A blockquote tag in a chapter. | §2c |
| `[MODE]` | One time mode that `clocks.json` declares. | Anywhere in a chapter heading. | §4b |

**Reserved words.** The reserved first segments are `pillars`, `mood`, `anti`, `must_keep`, `colors`, `contrast`, `timing`, `values`, `ranges`, `rules`, `runtime`, `clocks`, `manifest`, `build`, `contracts`, `palette` and `collections`. `manifest` and `build` are reserved for future use. `open`, `content` and `viewing` are not reserved, and no `open.<key>` form exists. The reserved extensions are `json` and `md`.

**Classifying a token in prose.** A dotted token is the whole content of one inline code span in chapter prose, outside fenced code. A dotted token has two or more segments, joined by single dots. Each segment uses the tuning-key segment grammar (§4). The first step that matches decides what the token is.

| Step | The token | The token is |
| --- | --- | --- |
| 1 | Its first segment is reserved. | A mechanism path. It cites what the table above gives for that first segment. |
| 2 | Every segment holds only digits. | A version string. It is not a citation. |
| 3 | Any segment is `json` or `md`, in any position. | A mention of a file or of a member of a file. It is not a citation. |
| 4 | None of the steps above matches. | A tuning citation. |

A token that matches step 1 is a mechanism path, even when one of its segments is `json` or `md`. §4 states what happens to the token after classification.

These are also not references:

- a token that holds a colon, which is read as prose and not as a dotted citation
- a `#` that does not start a bare chapter anchor under the lexical rule of §1a

### 12.3 Condition forms

A condition is a JSON object that decides whether something applies: a field, a question, a value declaration, a template or a rule. This table lists every condition form.

| Form | Shape | Reads | Holds when |
| --- | --- | --- | --- |
| `flag` | A map from one or more question ids to non-empty arrays of option ids | The recorded answers of the adoption | Every named question is asked, and its recorded answer is in its array. |
| `value-form` | A map from one or more value names to a non-empty array of `number`, `citation`, or both. Each name is an unconditional declaration in `declares.values`. | The form of each named value in the adoption. A finite plain JSON number has the form `number`. A value citation (§10.10) has the form `citation`. | Every named value has one of the listed forms. |
| `row-count` | A map from one or more row-set names in `declares.rows` to exactly one of `empty`, `non-empty` or `at-least-two` | The length of the adoption's array for each named row set, and nothing else | Every named array has the stated number of rows. |
| `any` | A non-empty array of conditions | Its members | At least one member holds. |
| `all` | A non-empty array of conditions | Its members | Every member holds. |
| `row` | A map from field names to non-empty arrays of allowed values | One object: the record, the list entry, the contract row, or the row that a template expands. This object is never a row of a grid (§7a). | The object carries every named field, and each value is in its array. An absent or empty map holds. |
| `row-has` | A map from exactly one declared row-set name to a non-empty `row` map | The rows of that row set | At least one row in the set satisfies the `row` map. |

**Where each form is legal.**

| Where the condition is written | Defined in | Accepted forms |
| --- | --- | --- |
| `when` of a field in the collection form | §1b | `row` only. An empty `when` object holds. |
| `when` of a field in the contract form | §10.5 | `flag`, `row`, or both in one object. With both, both must hold. An empty `when` object holds. |
| `when` of a question | §10.3 | Exactly one of `flag`, `value-form`, `row-count`, `any` or `all`. |
| `when` of a value declaration | §10.4 | Exactly one of `flag`, `value-form`, `row-count`, `any`, `all` or `row-has`. |
| `when` of a `once` template | §10.7 | `flag` only. |
| `when` of a `per-row` template | §10.7 | `flag`, `row`, or both. `row` reads the row that the template expands. |
| `forbid` of an answer-aware rule | §10.6 | One `flag` condition, or one `any` or `all` whose members are all `flag` conditions. |
| A member of `any` or `all` | §12.3 | `flag`, `value-form` or `row-count`. |
| The inner map of `row-has` | §12.3 | One `row` map. |

**Rules.**

1. `any` and `all` do not nest. A member of `any` or `all` is never `any`, `all`, `row` or `row-has`.
2. A `flag` that names a question that is not asked is false. An answer recorded for a question that is not asked never satisfies a `flag`.
3. A `row` condition that names a field that the object does not carry is false.
4. Every field that `row-has` reads MUST be unconditional and required in the schema of its row set.
5. A condition whose named operand is absent or malformed is false. The check of the operand reports the absence. The condition reports nothing.
6. `otherwise` (§10.3) and `when-empty` (§10.5) are strings of text that the builder implements as `mechanism` text. They are not conditions.

## Appendix A. Reference tables (non-normative)

*A designer who starts a new package can skip this appendix.*

Every rule that this appendix restates belongs to the section it cites. Where
the two say different things, that section is correct. The reference forms are
in §12.2, and each contract check is a row in a diagnostics table of §10.

### Retired forms and migration

This table lists the forms that earlier versions of the format used and that
this version rejects. `opengdd migrate` rewrites a package. `opengdd migrate
--build` rewrites a build record.

| Retired form | Where it appeared | Code | What to do |
| --- | --- | --- | --- |
| A `> COLLECTION:` blockquote tag | Chapter prose (§1b) | `COLLECTION_TAG_RETIRED` | Remove the tag. The folder declares the collection, prose cites it, and the `record` schema holds the shape. |
| A prose token that starts with the word `collections`, holds a colon, and holds no `<` or `>` (the colon count form) | Chapter prose (§1b) | `PROSE_REFERENCE_DANGLING` | Cite the collection by its dotted address. State the count in prose, or store it under a key when something else in the package needs it (§4). |
| Field type `reference` | The `record` schema of a collection (§1b) | `COLLECTION_SCHEMA_SHAPE` | Write `link`. `opengdd migrate` does this. |
| `"loops": "never"` | A `link` field in the `record` schema of a collection (§1b) | `COLLECTION_SCHEMA_SHAPE` | Write `"loops": false`. `opengdd migrate` does this. |
| A seed that contains a colon (`:`) | A seed address (§2a) | None. The validator does not check this rule. | Choose a seed with no colon. Change every place that uses the seed. |
| `> RULESET: all` | Chapter prose (§2c) | `RULESET_TAG_SHAPE` | Leave the statement untagged. Text outside every ruleset already applies in all rulesets. |
| A top-level `tunables`, `constants`, `meta`, `invariants` or `clocks` | `tuning.json` (§4) | `TUNING_SHAPE` | Run `opengdd migrate`. It merges `tunables` and `constants` into `values`. It moves each range in `meta` into `ranges`, and it removes `must_match` and `ruleset` from the file. It writes each expression in `invariants` as an entry in `rules`. It moves `clocks` unchanged to `clocks.json`. |
| A tuning key whose first segment is `values`, `ranges`, `rules`, `runtime`, `colors`, `contrast` or `timing` (reserved in v0.7), or `palette` or `collections` (reserved in v0.6) | `tuning.json` (§4) | `TUNING_KEY_RESERVED` | Rename the key, for example with `feel` as its first segment. |
| A tuning key in which every segment holds only digits, such as `1.2` | `tuning.json` (§4) | `TUNING_KEY` and `TUNING_SCHEMA` | Rename the key so that at least one segment holds a character that is not a digit. Change every place that names the key, for example a prose citation, a rule line, a key of `ranges` or a `sets` of a personalization question. |
| A root `modes` or `clocks` key | `clocks.json` (§4b) | `CLOCKS_SHAPE` | Run `opengdd migrate`. It puts each clock at the root with its own `modes` map. |
| The mode tag `[ALL]`, in a package that declares at least one time mode | A chapter heading (§4b) | `MODE_TAG_DANGLING` | Remove the tag. A statement without a mode tag already holds in every mode. In a package that declares no time mode, nothing checks a bracketed word in a heading. |
| A prose token `state:number:<name>` | Chapter prose (§4b) | `PROSE_REFERENCE_DANGLING` | Write `runtime.<name>`. |
| Any other prose token that starts with `state:` | Chapter prose (§4b) | `PROSE_REFERENCE_DANGLING` | Write a `runtime.<name>` address and state the condition in a sentence. |
| The fields `tuning_overrides`, `resolution`, `operation`, `operand`, `bounds`, `out_of_range` and `affects` | `personalization.json` (§5) | `PERSONALIZATION_SCHEMA` | Run `opengdd migrate`. |
| A question id that contains whitespace | `personalization.json` (§5) | `PERSONALIZATION_SCHEMA` | Remove the whitespace, or choose another id. Change every `> PERSONALIZATION:` tag that names the question (§2). |
| Test type `property` or `exhaustive-search` | A test block (§6) | `VERIFICATION_TYPE_RETIRED` | Run `opengdd migrate`. It rewrites the test as a `general` test. |
| Test type `document-check` | A test block (§6) | `VERIFICATION_TYPE_RETIRED` | Delete or rewrite the test. A check of package files belongs in the data rules or in ordinary prose. `opengdd migrate` reports the test for manual review. |
| Test field `freeze_invariant` | A test block (§6) | `VERIFICATION_FIELD_UNKNOWN` | Write `unchanged`. |
| Test field `domain` | A test block (§6) | `VERIFICATION_FIELD_UNKNOWN` | Write `scope` on a `general` test. |
| Test field `predicate` | A test block (§6) | `VERIFICATION_FIELD_UNKNOWN` | Write `holds` on a `general` test. |
| Test field `applies_to` | A test block (§6) | `VERIFICATION_FIELD_UNKNOWN` | Remove it. The `holds` sentence says whether the claim is about each case or about a measure across the cases. |
| Test fields `initial_states` and `bound` | A test block (§6) | `VERIFICATION_FIELD_UNKNOWN` | Put their content into the `scope` of a `general` test. |
| Test fields `transitions`, `finite_state` and `complete` | A test block (§6) | `VERIFICATION_FIELD_UNKNOWN` | Remove them. The build record's `acceptance.sampled` says how thoroughly a `general` test was checked (§7). |
| Test fields `rule_set` and `artifacts` | A test block (§6) | `VERIFICATION_FIELD_UNKNOWN` | Remove them. A check of package files belongs in the data rules or in ordinary prose. |
| `resolved_tuning.tunables` and `resolved_tuning.constants` | `opengdd-build.json` (§7) | `BUILD_SCHEMA` | Run `opengdd migrate --build`. The record carries `resolved_tuning.values`. |
| `direction_result` and `evidence.direction_observations` | `opengdd-build.json` (§7) | `BUILD_SCHEMA` | Run `opengdd migrate --build`. A build record carries neither field. |
| `renderer` and `resources` | `opengdd-build.json` (§7) | `BUILD_SCHEMA` | Run `opengdd migrate --build`. |
| `capture_profile` | `opengdd-build.json` (§7) | `BUILD_SCHEMA` | Run `opengdd migrate --build`. The audit records the capture profile in its own record (`conformance/CERTIFICATION.md`, audit profile). |
| `evidence.algorithm` | `opengdd-build.json` (§7) | `BUILD_SCHEMA` | Run `opengdd migrate --build`. The certification protocol names the hash. |
| A palette and mood descriptors | `manifest.json` (§3) | `MANIFEST_SCHEMA` | Run `opengdd migrate`. It moves them into `direction.json`. |
| A fenced code block opened with `direction` | Chapter prose (§9) | `DIRECTION_FENCE_RETIRED` | Run `opengdd migrate`. It turns the fence into ordinary delegated presentation prose. A fence that remains after migration is still reported. |
| A prose token `descriptor:mood:<name>` | Chapter prose (§9) | `PROSE_REFERENCE_DANGLING` | Write `mood.<name>`. |
| A prose token `descriptor:<kind>:<name>` of another kind | Chapter prose (§9) | `PROSE_REFERENCE_DANGLING` | Descriptors do not exist in this version. Cite a mood as `mood.<name>`. |
| A prose token that starts with `palette:` or `tuning:` | Chapter prose (§9) | None in chapter prose, because a token with a colon is read as prose (§12.2). In the fantasy block, `FANTASY_REFERENCE` (§1a). | Run `opengdd migrate`. It rewrites the reference as a dotted address. |
| A prose token `constraints.colors.<id>`, `constraints.thresholds.<id>` or `constraints.timing.<id>` | Chapter prose (§9) | `PROSE_CITATION_DANGLING` (§4). Its message names the new address. | Write `colors.<id>`, `contrast.<id>` or `timing.<id>`. |
| `pillars.<id>.statement` | `direction.json` (§9) | `DIRECTION_SCHEMA` | Write `pillars.<id>`, holding that string. |
| `must_keep.<id>.statement` | `direction.json` (§9) | `DIRECTION_SCHEMA` | Write `must_keep.<id>`, holding that string. |
| `anti.<id>` with `description` and an image | `direction.json` (§9) | `DIRECTION_SCHEMA` | Write `anti.<id>` as `{ not, image, license }`, with `not` holding the description. |
| `anti.<id>` with `description` and no image | `direction.json` (§9) | `DIRECTION_SCHEMA` | Write `anti.<id>`, holding the description string. |
| `constraints.colors.<id>` with `color`, `tolerance`, `scope.applies_to` and `scope.states` | `direction.json` (§9) | `DIRECTION_SCHEMA` | Write `colors.<id>` with `is`, `within`, `where` and optional `while`. |
| `constraints.thresholds.<id>` with `colors`, `against`, `min_contrast`, `scope.applies_to` and `scope.states` | `direction.json` (§9) | `DIRECTION_SCHEMA` | Write `contrast.<id>` with `colors`, `against`, `at_least`, `where` and optional `while`. |
| `constraints.timing.<id>` with `key`, `scope.applies_to` and `scope.states` | `direction.json` (§9) | `DIRECTION_SCHEMA` | Write `timing.<id>` with `key`, `where` and optional `while`. |
| A map of `viewing` entries | `direction.json` (§9) | `DIRECTION_SCHEMA` | Write one `viewing` object. `opengdd migrate` does this. |
| A root `semantics`, a descriptor's `behaviors`, and a per-entry `viewing`, `observable`, `may_vary`, `sampling`, `metric` or `tie_break_order` | `direction.json` (§9) | `DIRECTION_SCHEMA` | Remove them. The current shape does not have these fields. `opengdd migrate` removes them. |
| `format` instead of `contract` | An adoption file (§10.2) | `CONTRACT_ENVELOPE_UNKNOWN` and `CONTRACT_ENVELOPE_REQUIRED` | Run `opengdd migrate`. |
| An empty `summary`, `asks`, `meaning` or value `description`, or an empty `mechanism` array or entry | The definition part of an adoption file (§10.2, §10.3, §10.4) | `CONTRACT_ENVELOPE_TYPE` | Write the text that the field is meant to hold. This edit changes the definition part, so a copy of a catalog definition becomes a fork (§10.11). |
| A value name that begins with a digit | The definition part of an adoption file (§10.4) | `CONTRACT_NAME_GRAMMAR` | Rename the value so that it begins with a lowercase letter. Change every place that names the value: its entry in `values`, rules, conditions, `within` bounds, citations, and `{{value-cite:<value>}}` placeholders in the pack. This edit changes the definition part, so a copy of a catalog definition becomes a fork (§10.11). A pack that changes gets a new digest, and the definition's `pack` names that digest (§10.8). |
| A row set bound to a collection, instead of an inline array | An adoption file (§10.5) | `CONTRACT_ROWS_SHAPE` | Write the rows as an inline array. `opengdd migrate` does this. |
| The placeholder `{{surface:<input>}}` | A pack template (§10.7) | `CONTRACT_PLACEHOLDER` | Write `{{inputs:<input>}}`. |
| Template type `property`, `exhaustive-search` or `document-check` | A pack template (§10.7) | `CONTRACT_PACK_SHAPE` | Run `opengdd migrate`. |
| A generated-contracts marker block | `05-build-plan.md` (§10.8) | `CONTRACT_BLOCK_RETIRED` | Run `opengdd migrate`. It removes the markers and their content. |
| A citation with a colon form | A contract citation (§10.10) | `CONTRACT_CITATION_GRAMMAR` | Use the dotted address of the cited thing. |

Each finding for a test type or a test field in this table names
`opengdd migrate` (§6, rule 7 of the test blocks).

**Migration of art direction.** `opengdd migrate` makes these further
changes when it rewrites art direction (§9).

- It rewrites palette and mood addresses to their current spelling.
- Every entry in the table keeps its `<id>`.
- A `mood` entry stays an object. Only the entries that the table names are
  turned into strings.
- A `mood` entry gets its descriptor's id when the two ids differ.
- The migration report names every dropped field.
- A borrowed reference that the migrator cannot convert is reported for manual
  review. The migrator does not guess.
- The migrator checks the result with the validator before it writes it.

**Compatibility.**

- v0.7 retired §1c, §4a and §8, and this document does not reuse those
  numbers. Links between records moved to §1b, runtime values to §4b, and
  identifiers to §1.
- v0.9 changed the structure of this document. The change of structure
  itself changed no rule. §12 is new. The former Appendix A.1 is §12.2. The
  former Appendix A.2 is in the diagnostics tables of §10. The subsections
  of §10 have new numbers, and the table at the end of this appendix lists
  them. Every other section keeps its number.
- v0.9 also changed rules. The [changelog](https://opengdd.org/spec/changelog/)
  lists them.
- The forms that §10 gained since v0.7 are additions. A contract definition
  that uses only v0.7 forms keeps exactly its v0.7 meaning.
- v0.9 makes two rules for contract definitions stricter. A value name
  begins with a lowercase letter (§10.4). Required text is not empty
  (§10.2). The table above says what to do with a definition that breaks one
  of these rules. `opengdd migrate` does not make these corrections.
- A definition that uses none of the forms listed in §10.3, rule 7, uses only
  v0.7 forms. It can omit `otherwise` and `when-empty`.
- v0.7 retired the audit mechanisms that the package format used to
  contain. The
  [technical changelog](https://opengdd.org/spec/changelog/technical/) lists
  them field by field.
- `references.*` and `viewing.*` are legal tuning keys again since v0.7.
- The build record's `spec` field keeps its historical name.
- The folder check of §10.1 counts a file that carries the historical
  `format` as an adoption. So a v0.6 package is migrated instead of being
  told to rename its `contracts/` folder (`CONTRACT_FOLDER_RESERVED`).

**Subsections of §10 with a new number.**

| In v0.8 | In this document |
| --- | --- |
| 10.2 The adoption file | §10.1 (folder and file names), §10.2 (fields), §10.11 (comparing definitions) |
| 10.4 Values, rows, and rules | §10.4 (values), §10.5 (rows), §10.6 (rules), §10.10 (value citations) |
| 10.5 Promised and checked | §10.8 |
| 10.6 Addresses | §10.9 |
| 10.7 Citations in a contract | §10.10 |
| 10.8 The pack | §10.7 |
| 10.9 Forking | §10.11 |
| 10.10 What this layer does not do | §10.12 |
