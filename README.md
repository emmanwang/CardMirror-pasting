# Portable Clipboard — a CardMirror plugin

Fixes the bug where copying formatted text (Cite, Underline, Emphasis,
Undertag, Analytic, Pocket/Hat/Block/Tag headings) out of CardMirror
and pasting into Google Docs, Word, Outlook, Slack, etc. loses all the
formatting and leaves only plain text with paragraph breaks.

## Install it (30 seconds, works right now)

1. Open CardMirror → **Settings → \[your plugins tab] → Developer**.
2. Click **"Load plugin from file…"**.
3. Select `plugin.js` from this folder.
4. That's it — it's active for this session. Select some formatted
   text in an open document, copy it, and paste into a Google Doc: the
   bold/underline/box/size formatting should now show up.

This uses the same "unpackaged plugin bundle" developer path already
in your Settings screen — no allowlist, no GitHub release needed. The
one thing to know: it only loads **for the current session**. If you
want it to load automatically every time you open CardMirror, see
"Making it permanent" below.

## What it does

It listens for the browser's native `copy` event and, only when the
selection is inside CardMirror's editor, rewrites the copied HTML so
every named-style mark/heading — including Highlight and Shading —
carries its *current* rendered look as real inline CSS (colors, bold,
underline, box borders, sizes) instead of the app-only CSS classes
that external apps can't see. It does this by reading the real,
currently-rendered computed style off each element (rather than a
hand-maintained color/size table), so it automatically matches
whatever CardMirror is showing on screen right now — including custom
highlight-frequency colors or dark mode — and won't need updating if
CardMirror adds new colors or settings later. Full technical
explanation is in the comment block at the top of `plugin.js`.

It only touches the `copy` event — nothing else about the editor,
your documents, or `cut` (see the comment in `plugin.js` for why `cut`
is deliberately left alone).

## Making it permanent (optional)

The "Load plugin from file…" path is intentionally session-only. To
have it load automatically on every launch, you install it the normal
way — pasting a GitHub URL or `owner/repo` into "Install a plugin" —
which needs the plugin's `id` to be on the curated allowlist (or your
own instance's `__plugins('community-on')` unlocked, or a self-hosted
relay you control). Two ways to get there:

- **Simplest:** push this folder to a public GitHub repo, cut a
  release with `cardmirror-plugin.json` and `plugin.js` attached as
  release assets (already set up for that — the manifest is here),
  and ask whoever curates your CardMirror install's allowlist (or
  relay operator, if self-hosted) to add your `owner/repo`.
- **If you control the app/relay yourself:** add your repo to
  `PLUGIN_INSTALL_ALLOWLIST` (or your relay's
  `RELAY_PLUGIN_ALLOWLIST`), or unlock arbitrary installs from the
  dev console with `__plugins('community-on')`.

None of that is required just to use the fix — "Load plugin from
file…" each session is fine if you don't want to bother with it.
