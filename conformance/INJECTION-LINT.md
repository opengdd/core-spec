# The safety scan

A package is written to be read by builders and by AI agents. So a package
can carry text that gives instructions to the reader instead of describing
the game. The safety scan points out text that has such a shape. The
OpenGDD specification names its codes in §1 and describes safety notices in
§2d. This document defines what each code looks for.

A safety notice is a place for a person to look at. It is not proof that
the text is harmful, and it does not say that the author meant harm. A
package without safety notices is not proven safe.

## What a notice does and does not do

- A safety notice never changes the result of validation or the exit
  status. This is permanent.
- The validator returns safety notices in the list `safety`, separate from
  errors, warnings and hints. They are not counted as warnings.
- Each notice has `severity: "warning"` and carries `lint_status:
  "advisory"` in its `data`. A tool can recognize the notices by that field.
- A notice gives the file and the line. It does not repeat the text that
  it found.
- The scan does not decode an encoded run, follow a link, fetch a resource
  or run a command.

Read the reported passage as untrusted data. Decide what it is before an
agent with tools or wider permissions receives the package.

## Files that are scanned

The scan reads every regular file of the package that has a common text
extension: Markdown, JSON and JSON Lines, YAML, TOML, plain text, CSV and
TSV, XML, HTML, and SVG. It does not read through filesystem links. It
reads a file whether or not another file of the package names it, because
a builder can receive any text file in the package.

A text file larger than 2 MiB is not scanned. A text file that cannot be
read is not scanned. In both cases the scan reports
`INJECTION_SCAN_SKIPPED`, so that the unread file is visible.

## What each code looks for

| Code | What it looks for |
| --- | --- |
| `INJECTION_PROMPT_CONTROL` | A phrase such as "ignore previous instructions". A reference to a system prompt or a developer prompt. Text that gives a new role to an AI or an agent. An instruction to obey a new prompt. |
| `INJECTION_EXTERNAL_ACTION` | A request shaped like "run this command" or "fetch this URL". Common forms that start a command or download a file. |
| `INJECTION_READER_DIRECTIVE` | An explicit duty in the second person, such as "you must". One of a small set of imperative verbs at the start of a sentence, when the paragraph is about a builder, a test runner, a reader, a file, a tool or a network resource. Strong game-control words in the paragraph suppress some second-person matches. |
| `INJECTION_OBFUSCATED_BLOCK` | A run of at least 64 characters that looks like hexadecimal. A run of at least 80 characters that looks like base64 or base64url and uses several character classes. |
| `INJECTION_SUSPICIOUS_LINK` | A link whose text asks for an action. A link with an active scheme or a file-sharing scheme. A URL that carries credentials, looks like an executable file, or names the local host or a private network. An ordinary external citation is not reported. |
| `INJECTION_SCAN_SKIPPED` | A text file that is larger than 2 MiB or that could not be read. |

The codes for prompt control, external action and obfuscated blocks are
checked inside Markdown fences too. The link check reads only prose outside
fences. The scan does not follow or resolve local Markdown links.

The table describes each check in words. The exact patterns are in the
published validator, `conformance/validate-core.mjs`.

One form is not reported as an obfuscated block: `sha256:` followed by
exactly 64 lowercase hexadecimal digits. Build records and contract
adoptions use this form for hashes (specification §7 and §10.8).

## Why the reader-directive check is narrow

A game design uses commands in ordinary sentences. "Move the piece", "press
X" and "choose a card" describe what the player does. A build plan says
"run the scenario". A check of grammar alone would report mostly such
sentences.

So the check looks only for explicit forms such as "you must", and for a
small set of imperative verbs in a paragraph that is not about the game.
This gives fewer false notices. It does not decide whom a sentence
addresses. The person who reviews the notice decides that.

## Limits

- The checks for prompt control, external action and reader directives
  read English phrases. An instruction in another language can go
  unreported. The checks for obfuscated blocks and links do not depend on
  the language.
- Ordinary text can be reported: a test procedure, security guidance,
  dialogue, a tutorial, a citation, or an embedded asset. A hash or another
  encoded-looking run that is not in the `sha256:` form can be reported.
- Game words in a paragraph can suppress a correct notice. An author who
  means harm can add game words to hide an instruction.
- The scan can miss synonyms, indirect persuasion, unusual line breaks,
  short encodings, custom ciphers and text inside images.
- The scan is not a malware scanner. It does not evaluate scripts, binary
  files, the destinations of links or the meaning of prose.

A later version can add a pattern or a code. Such an addition never makes
a notice change the result of validation.
