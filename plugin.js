/**
 * Portable Clipboard — a CardMirror plugin (apiVersion 1).
 *
 * THE PROBLEM
 * -----------
 * CardMirror's named-style marks (Cite, Underline, Emphasis, Undertag,
 * Analytic, Highlight, Shading) and structural headings (Pocket, Hat,
 * Block, Tag, Undertag, Analytic, cite paragraph) get their look from
 * CSS class/attribute rules that only CardMirror's own stylesheet
 * defines — e.g. `.pmd-hat { font-weight: bold; text-decoration:
 * underline double; }`, or `.pmd-highlight[data-highlight="yellow"] {
 * background: #ffff00; }`. Copying selected text writes that
 * class-and-attribute-only HTML to the clipboard; Google Docs, Word,
 * Outlook, Slack, etc. have no access to CardMirror's stylesheet, so
 * all of that formatting disappears on paste — leaving only clean
 * text with paragraph breaks. (Bold/italic/strikethrough/links, plus
 * the font-color/font-size/shading marks that already emit inline
 * `style`, are unaffected — highlight, notably, is NOT one of these:
 * it renders as `<span class="pmd-highlight" data-highlight="yellow">`
 * with no inline style of its own, same as the other affected marks.)
 *
 * THE FIX
 * -------
 * This plugin listens for the browser's native `copy` event on the
 * whole document, in the CAPTURE phase — i.e. before CardMirror's own
 * copy handling ever runs. When the selection is inside the editor
 * (#editor) it:
 *
 *   1. Clones the selected DOM range.
 *   2. Temporarily mounts that clone in the live document — as a
 *      sibling surface, never inside the real editor's contenteditable
 *      subtree (so ProseMirror's own DOM/state reconciliation never
 *      sees it) — carrying the `pmd-pane-editor` class CardMirror's
 *      own CSS already treats as equivalent to `#editor` for exactly
 *      this purpose (multiple editor surfaces reuse the same rules;
 *      see `:is(#editor, .pmd-pane-editor)` throughout style.css).
 *   3. For every element carrying one of the known app-only classes
 *      (or, for Shading, the `data-shading` attribute — it has no
 *      class of its own), reads its REAL, currently-rendered computed
 *      style — resolving CSS variables, dark mode, and any dynamic
 *      overrides (like the highlight-frequency heat map) exactly as
 *      the screen shows them right now — and bakes the relevant
 *      properties in as a real inline `style` attribute.
 *   4. Unmounts the temporary clone immediately (nothing here is ever
 *      visible or affects layout/scrolling).
 *   5. Writes the result as `text/html` (plus a matching `text/plain`)
 *      onto the clipboard itself, then prevents CardMirror's default
 *      copy so it doesn't get overwritten with the original HTML.
 *
 * Reading real computed style (rather than hand-maintaining a map of
 * CardMirror's CSS variables/colors here) means this plugin doesn't
 * need updating if CardMirror adds new highlight colors, changes a
 * default, or ships a new display setting — whatever's on screen is
 * what gets copied.
 *
 * Elements that already carry real inline styles (font_color,
 * font_size — direct-formatting marks) or real semantic tags
 * (bold/italic/underline/strikethrough/sup/sub/links) are left
 * completely untouched; this only adds to what's already there.
 *
 * Scope: only the `copy` event is intercepted. `cut` is deliberately
 * left alone — CardMirror's own cut handling also deletes the
 * selection from the document, and re-implementing that safely from a
 * full-trust script (without risking a duplicate/missed deletion) is
 * out of scope for what's otherwise a clipboard-formatting fix. If you
 * need a portable copy of something, cut still works as a "select,
 * copy (gets the fix), then delete" two-step.
 */
(function () {
  'use strict';

  var PLUGIN_ID = 'cardmirror-portable-clipboard';

  // Node classes (Pocket/Hat/Block/Tag/Analytic/cite paragraph/Undertag)
  // and mark classes (Cite/Underline/Emphasis/Undertag/Analytic/Highlight)
  // that render via app-only CSS. Shading isn't here — it's matched by
  // the `data-shading` attribute below instead, since it has no class.
  var RECOGNIZED_CLASSES = [
    'pmd-pocket', 'pmd-hat', 'pmd-block', 'pmd-tag', 'pmd-analytic',
    'pmd-cite-para', 'pmd-undertag',
    'pmd-cite', 'pmd-underline', 'pmd-emphasis',
    'pmd-undertag-mark', 'pmd-analytic-mark',
    'pmd-highlight',
  ];

  // The computed properties worth baking in. Harmless to over-include —
  // copying e.g. a default `border-top-width: 0px` onto a plain Cite
  // span is a no-op visually, just a few extra bytes.
  var COPY_PROPS = [
    'font-weight', 'font-style', 'font-size', 'font-family',
    'color', 'background-color',
    'text-decoration-line', 'text-decoration-style',
    'text-decoration-color', 'text-decoration-thickness',
    'text-align', 'line-height',
    'border-top-width', 'border-top-style', 'border-top-color',
    'border-right-width', 'border-right-style', 'border-right-color',
    'border-bottom-width', 'border-bottom-style', 'border-bottom-color',
    'border-left-width', 'border-left-style', 'border-left-color',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  ];

  function isRecognized(el) {
    for (var i = 0; i < RECOGNIZED_CLASSES.length; i++) {
      if (el.classList.contains(RECOGNIZED_CLASSES[i])) return true;
    }
    return el.hasAttribute('data-shading');
  }

  /** Bake real computed style onto every recognized element inside
   *  `root`. `root` must already be mounted in the live document (see
   *  onCopy) so getComputedStyle reflects the actual cascade. */
  function bakeComputedStyles(root) {
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!isRecognized(el)) continue;
      var computed = getComputedStyle(el);
      for (var p = 0; p < COPY_PROPS.length; p++) {
        var value = computed.getPropertyValue(COPY_PROPS[p]);
        if (value) el.style.setProperty(COPY_PROPS[p], value);
      }
    }
  }

  /** Best-effort plain-text fallback with paragraph breaks, built from
   *  the same DOM we're about to rewrite (rather than relying on
   *  Selection.toString(), which is inconsistent about block breaks
   *  across browsers). */
  function toPlainText(root) {
    var BLOCK = /^(P|H1|H2|H3|H4|H5|H6|DIV|LI|TR|TABLE)$/;
    var out = [];
    (function walk(node) {
      if (node.nodeType === 3) {
        out.push(node.nodeValue);
        return;
      }
      if (node.nodeType !== 1) return;
      if (node.tagName === 'BR') {
        out.push('\n');
        return;
      }
      var block = BLOCK.test(node.tagName);
      for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
      if (block) out.push('\n');
    })(root);
    return out.join('').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
  }

  function onCopy(event) {
    var mounted = null;
    try {
      var editorRoot = document.getElementById('editor');
      if (!editorRoot) return; // not this app's editor surface

      var sel = document.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

      var range = sel.getRangeAt(0);
      if (!editorRoot.contains(range.commonAncestorContainer)) return;

      if (!event.clipboardData) return; // no clipboard API available — let default proceed

      var container = document.createElement('div');
      container.appendChild(range.cloneContents());

      // Mount OUTSIDE the real editor's contenteditable subtree — never
      // as a descendant of it — so ProseMirror's DOM/state reconciler
      // never observes a foreign node. `pmd-pane-editor` gives us the
      // same CSS scope CardMirror already applies to secondary editor
      // surfaces, so every scoped rule (typography flags, dark mode,
      // the highlight-frequency override, etc.) still resolves
      // correctly via getComputedStyle.
      container.className = 'pmd-pane-editor';
      container.contentEditable = 'false';
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '-99999px';
      container.style.opacity = '0';
      container.style.pointerEvents = 'none';
      document.body.appendChild(container);
      mounted = container;

      bakeComputedStyles(container);

      document.body.removeChild(container);
      mounted = null;

      event.clipboardData.setData('text/html', container.innerHTML);
      event.clipboardData.setData('text/plain', toPlainText(container));
      event.preventDefault();
      // Stop CardMirror's own copy handling from running afterward and
      // overwriting what we just wrote with the original, unstyled HTML.
      event.stopImmediatePropagation();
    } catch (err) {
      // Never break copying — on any unexpected error, just let the
      // browser/CardMirror's default copy proceed untouched.
      console.error('[' + PLUGIN_ID + '] copy handling failed, falling back to default copy:', err);
    } finally {
      // Belt-and-suspenders: if something threw between mount and
      // unmount above, don't leave the temporary node in the document.
      if (mounted && mounted.parentNode) mounted.parentNode.removeChild(mounted);
    }
  }

  document.addEventListener('copy', onCopy, true);

  window.__registerCardMirrorPlugin && window.__registerCardMirrorPlugin({
    id: PLUGIN_ID,
    name: 'Portable Clipboard',
    apiVersion: 1,
    commands: [],
  });
})();
