/**
 * Portable Clipboard — a CardMirror plugin (apiVersion 1).
 *
 * THE PROBLEM
 * -----------
 * CardMirror's named-style marks (Cite, Underline, Emphasis, Undertag,
 * Analytic) and structural headings (Pocket, Hat, Block, Tag, Undertag,
 * Analytic, cite paragraph) get their look from CSS classes that only
 * CardMirror's own stylesheet defines (e.g. `.pmd-hat { font-weight:
 * bold; text-decoration: underline double; ... }`). Copying selected
 * text writes that class-only HTML to the clipboard; Google Docs,
 * Word, Outlook, Slack, etc. have no access to CardMirror's stylesheet,
 * so all of that formatting disappears on paste — leaving only clean
 * text with paragraph breaks. (Bold/italic/underline/strikethrough/
 * links/highlights already survive fine — they render as real
 * <strong>/<em>/<u>/<a> tags or real inline `style` attributes.)
 *
 * THE FIX
 * -------
 * This plugin listens for the browser's native `copy` event on the
 * whole document, in the CAPTURE phase — i.e. before CardMirror's own
 * copy handling ever runs. When the selection is inside the editor
 * (#editor) it:
 *   1. Clones the selected DOM range.
 *   2. Walks the clone and, for every element carrying one of the
 *      known app-only classes, adds the CURRENT resolved appearance
 *      (read live off the page's CSS variables / typography-flag
 *      classes — the same place CardMirror's own settings code writes
 *      them) as a real inline `style` attribute.
 *   3. Writes that as `text/html` (plus a matching `text/plain`) onto
 *      the clipboard itself, then prevents CardMirror's default copy
 *      so it doesn't get overwritten with the original, unstyled HTML.
 *
 * Elements that already carry real inline styles (highlight, shading,
 * font_color, font_size — all direct-formatting marks) or real
 * semantic tags (bold/italic/underline/strikethrough/sup/sub/links)
 * are left completely untouched.
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

  // ---- Read the live, current appearance off the page --------------------

  /** A `--pmd-*` custom property off :root, or `fallback` if unset. */
  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) {
      return fallback;
    }
  }

  /** Whether a typography-flag class (pmd-emphasis-bold, pmd-cite-underlined,
   *  etc.) is currently active — CardMirror toggles these on
   *  document.documentElement itself whenever settings change. */
  function flag(className) {
    return document.documentElement.classList.contains(className);
  }

  // ---- Style resolvers, one per app-only class ----------------------------
  // Values/fallbacks mirror src/editor/style.css and the defaults in
  // src/editor/settings.ts (DEFAULT_DISPLAY_SIZES / DEFAULT_DISPLAY_COLORS)
  // as of CardMirror 0.1.0-beta.26. If CardMirror ever renames these
  // variables/classes, the fallbacks below still produce a sane (if
  // un-customized) copy rather than a broken one.

  function pocketStyle() {
    var boxOff = flag('pmd-pocket-box-off');
    var s =
      'font-size: ' + cssVar('--pmd-size-pocket', '26pt') + ';' +
      'font-weight: bold;' +
      'text-align: center;' +
      'line-height: ' + cssVar('--pmd-line-height-heading', '1.2') + ';';
    if (!boxOff) {
      s += 'border: ' + cssVar('--pmd-pocket-box-size', '3px') + ' solid ' +
        cssVar('--pmd-c-emphasis-box', '#333') + ';' +
        'padding: 0.5rem 1rem;';
    }
    return s;
  }

  function hatStyle() {
    var doubleUnderline = !flag('pmd-hat-underline-single');
    return (
      'font-size: ' + cssVar('--pmd-size-hat', '22pt') + ';' +
      'font-weight: bold;' +
      'text-align: center;' +
      'line-height: ' + cssVar('--pmd-line-height-heading', '1.2') + ';' +
      'text-decoration: underline' + (doubleUnderline ? ' double' : '') + ';'
    );
  }

  function blockStyle() {
    return (
      'font-size: ' + cssVar('--pmd-size-block', '16pt') + ';' +
      'font-weight: bold;' +
      'text-align: center;' +
      'line-height: ' + cssVar('--pmd-line-height-heading', '1.2') + ';' +
      'text-decoration: underline;'
    );
  }

  function tagStyle() {
    return (
      'font-size: ' + cssVar('--pmd-size-tag', '13pt') + ';' +
      'font-weight: bold;' +
      'line-height: ' + cssVar('--pmd-line-height-tag', '1.2') + ';'
    );
  }

  function analyticStyle() {
    return (
      'font-size: ' + cssVar('--pmd-size-tag', '13pt') + ';' +
      'font-weight: bold;' +
      'color: ' + cssVar('--pmd-color-analytic', '#1F3864') + ';'
    );
  }

  function citeParaStyle() {
    return 'line-height: ' + cssVar('--pmd-line-height-cite', '1') + ';';
  }

  function undertagStyle() {
    var s =
      'color: ' + cssVar('--pmd-color-undertag', '#385623') + ';' +
      "font-family: 'Times New Roman', serif;" +
      'font-size: ' + cssVar('--pmd-size-undertag', '12pt') + ';' +
      'line-height: ' + cssVar('--pmd-line-height-undertag', '1.2') + ';';
    if (flag('pmd-undertag-italic')) s += 'font-style: italic;';
    if (flag('pmd-undertag-bold')) s += 'font-weight: bold;';
    return s;
  }

  function citeMarkStyle() {
    var s =
      'font-weight: ' + (flag('pmd-cite-unbold') ? 'normal' : 'bold') + ';' +
      'font-size: ' + cssVar('--pmd-size-cite', '13pt') + ';';
    if (flag('pmd-cite-underlined')) {
      s += 'text-decoration: underline;' +
        'text-decoration-thickness: ' + cssVar('--pmd-underline-size', 'auto') + ';';
    }
    return s;
  }

  function underlineMarkStyle() {
    var s =
      'text-decoration: underline;' +
      'text-decoration-thickness: ' + cssVar('--pmd-underline-size', 'auto') + ';' +
      'font-size: ' + cssVar('--pmd-size-underline', '11pt') + ';';
    if (flag('pmd-underline-bold')) s += 'font-weight: bold;';
    return s;
  }

  function emphasisMarkStyle() {
    var s =
      'text-decoration: underline;' +
      'text-decoration-thickness: ' + cssVar('--pmd-underline-size', 'auto') + ';' +
      'font-size: ' + cssVar('--pmd-size-emphasis', '11pt') + ';';
    if (flag('pmd-emphasis-bold')) s += 'font-weight: bold;';
    if (flag('pmd-emphasis-italic')) s += 'font-style: italic;';
    if (flag('pmd-emphasis-box')) {
      s += 'border: ' + cssVar('--pmd-emphasis-box-size', '1pt') + ' solid ' +
        cssVar('--pmd-c-emphasis-box', '#333') + ';';
    }
    return s;
  }

  function undertagMarkStyle() {
    var s = 'color: ' + cssVar('--pmd-color-undertag', '#385623') + ';';
    if (flag('pmd-undertag-italic')) s += 'font-style: italic;';
    if (flag('pmd-undertag-bold')) s += 'font-weight: bold;';
    return s;
  }

  function analyticMarkStyle() {
    return 'font-weight: bold; color: ' + cssVar('--pmd-color-analytic', '#1F3864') + ';';
  }

  // class name -> resolver. Checked in this order; first match wins
  // (a node is never more than one of these at once in practice).
  var STYLERS = [
    ['pmd-pocket', pocketStyle],
    ['pmd-hat', hatStyle],
    ['pmd-block', blockStyle],
    ['pmd-tag', tagStyle],
    ['pmd-analytic', analyticStyle],
    ['pmd-cite-para', citeParaStyle],
    ['pmd-undertag', undertagStyle],
    ['pmd-cite', citeMarkStyle],
    ['pmd-underline', underlineMarkStyle],
    ['pmd-emphasis', emphasisMarkStyle],
    ['pmd-undertag-mark', undertagMarkStyle],
    ['pmd-analytic-mark', analyticMarkStyle],
  ];

  /** Walk a cloned fragment and bake resolved inline styles onto every
   *  app-only-classed element. Appends to (never replaces) any
   *  existing inline style, since indent/highlight/font-size etc.
   *  already render as real inline styles we must keep. */
  function rewrite(root) {
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      for (var j = 0; j < STYLERS.length; j++) {
        var className = STYLERS[j][0];
        var resolver = STYLERS[j][1];
        if (el.classList.contains(className)) {
          var existing = el.getAttribute('style') || '';
          el.setAttribute('style', existing + ';' + resolver());
          break; // one match per element is all we expect
        }
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
      rewrite(container);

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
