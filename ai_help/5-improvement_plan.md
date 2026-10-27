# Plan: Resolution of Testing Observations & Edge Cases

## Goal Description
Address the 8 precise observations identified during testing to bring `html2json.js` to full compliance with HTML specifications and eliminate edge-case bugs:
1. Fix unquoted attribute values prematurely truncating at `/` (e.g. `<a href=https://example.com/page>`).
2. Preserve meaningful whitespace between inline elements (e.g. `<p><b>Hello</b> world</p>`).
3. Normalize tag and attribute names to lowercase per HTML standard.
4. Remove dead code in opening tag processing.
5. Simplify the root stack sentinel.
6. Fix filtering bug where self-closing `<script src="a.js"/>` bypassed `includeScripts = false`.
7. Disallow invalid `</ script>` (spaces immediately following `</`).
8. Add RCDATA support for `<textarea>` and `<title>` so their inner tags are treated as literal text.

---

## Detailed Analysis & Proposed Solutions

### 1. Unquoted Attribute Values with Slashes (`/`)
* **Problem:** In `parseAttributes()`, the unquoted value reader stopped on `TAG_SLASH` (`/`). As a result, `<a href=https://example.com/page>` broke at `https:`, treating `/example.com` and `/page` as boolean attributes.
* **HTML Specification:** According to HTML5 §13.1.2.3, unquoted attribute values may contain `/`. The only time `/` acts as a delimiter is when it is immediately followed by `>` (e.g., self-closing `<img src=pic.png/>`).
* **Solution:** Allow `/` in unquoted values unless it is part of `/>` or followed by `>`.
  ```javascript
  // Read until whitespace, '>', or '/>'
  while (
    i < len &&
    text[i] > " " &&
    text[i] !== TAG_CLOSE &&
    !(text[i] === TAG_SLASH && (i + 1 >= len || text[i + 1] === TAG_CLOSE))
  ) {
    i++;
  }
  ```

---

### 2. Whitespace Preservation Between Inline Elements
* **Problem:** `htmlText.substring(cursor, openTagIndex).trim()` stripped leading/trailing spaces from `" world"`, turning `<p><b>Hello</b> world</p>` into `Hello` and `world` without spacing.
* **HTML Specification:** Whitespace between words or inline tags is significant. Only pure-whitespace text nodes (e.g. indentation newlines `\n  ` between block tags) should be discarded.
* **Solution:**
  - If a text chunk contains non-whitespace characters (`text.trim().length > 0`), normalize multi-whitespace inside it (`\n`, `\t`, multiple spaces) into a single space, while **preserving the boundary space** if it was preceded or followed by one.
  - Or simply: collapse consecutive whitespace sequences `\s+` into a single space `" "` and trim only if it's purely whitespace. This perfectly preserves `" world"`.

---

### 3. Case Normalization for Tags and Attributes
* **Problem:** `<DIV ID="a" id="b"></div>` produces `"tag": "DIV"` and duplicate attributes `{"ID": "a", "id": "b"}`.
* **HTML Specification:** In HTML5, tag names and attribute names are **strictly case-insensitive**. Standard DOM parsers always convert tag names and attribute names to lowercase.
* **Solution:**
  - Store `tag: tagName.toLowerCase()`.
  - Store `attributes[attrName.toLowerCase()] = attrValue`. If an attribute repeats in different cases, earlier or later value overwrites it cleanly instead of having duplicate keys.

---

### 4. Dead Code Cleanup
* **Observation:** In the opening tag branch:
  ```javascript
  while (i < rawTagContent.length && rawTagContent[i] <= " ") i++;
  // ...
  if (!tagName) throw new Error(...);
  ```
* **Analysis:** Because `isValidTagStart()` already verified that the character following `<` is an ASCII letter, `rawTagContent[0]` can never be whitespace, and `tagName` can never be empty.
* **Solution:** Remove the redundant leading whitespace loop and redundant `!tagName` check.

---

### 5. Sentinel Root Stack Cleanup
* **Observation:** `const root = { type: "root", children: [] };` is created, but only `root.children` is returned.
* **Solution:** Change `const root = { children: [] };` to make it clear it is purely an internal stack sentinel container, avoiding misleading `type: "root"` in code reading.

---

### 6. Filter Handling for Self-Closing `<script />` and `<style />`
* **Problem:** In `<script src="a.js"/><p>x</p>`, if `isSelfClosing` is `true`, the code bypassed the `isRawTextContainer` check and pushed the `<script>` node even when `includeScripts = false`.
* **Solution:** Check the filtering condition (`includeScripts` / `includeStyles`) uniformly before pushing to `currentParent.children`, whether self-closing or paired:
  ```javascript
  const shouldInclude =
    (lowerTagName === "script" && !includeScripts) ||
    (lowerTagName === "style" && !includeStyles)
      ? false
      : true;
  ```

---

### 7. Strict Closing Tag Syntax (Disallowing `</ script>`)
* **Problem:** `findRawContainerEnd()` had a loop skipping whitespace after `</`:
  ```javascript
  while (i < htmlText.length && htmlText[i] <= " ") i++;
  ```
  This mistakenly accepted `</ script>` as a closing tag. In HTML, `</ script>` does NOT close a script; it is parsed as literal script text.
* **Solution:** Remove the whitespace loop immediately after `CLOSING_TAG_PREFIX`. The tag name must follow `</` immediately without spaces. (Spaces remain allowed *after* the tag name, before `>`, e.g. `</script  >`).

---

### 8. RCDATA Support for `<textarea>` and `<title>`
* **Problem:** `<textarea><b>x</b></textarea>` currently parses `<b>` as an element node instead of literal text.
* **HTML Specification:** `<textarea>` and `<title>` are **RCDATA elements**. HTML markup inside them is not parsed into DOM elements; it is treated as raw text content.
* **Solution:**
  - Define `const RAW_TEXT_TAGS = ["script", "style", "textarea", "title"];`
  - All 4 tags capture their inner content as raw text until their corresponding closing tag (`</textarea>`, `</title>`, etc.).
  - The filtering flags apply specifically to `script` and `style` (`includeScripts`, `includeStyles`), while `textarea` and `title` are content elements that are always retained.

---

## Verification Plan

### Test Scenarios

| # | Test Observation | Input HTML | Expected Result |
| :--- | :--- | :--- | :--- |
| **T-1** | Unquoted URL | `<a href=https://example.com/page>x</a>` | `attributes: { "href": "https://example.com/page" }` |
| **T-2** | Inline spacing | `<p><b>Hello</b> world</p>` | Child 2 content: `" world"` (space preserved) |
| **T-3** | Case normalization | `<DIV ID="a" id="b"></div>` | `tag: "div"`, `attributes: { "id": "b" }` |
| **T-4** | Self-closing script filter | `<script src="a.js"/><p>x</p>` with `includeScripts: false` | No `script` element in output; only `<p>` |
| **T-5** | Strict closing tag | `<script>a</ script>b</script>` | Script content is `"a</ script>b"`, closed by final `</script>` |
| **T-6** | Textarea RCDATA | `<textarea><b>x</b></textarea>` | `tag: "textarea"`, child text content: `"<b>x</b>"` (no `b` element) |
| **T-7** | Title RCDATA | `<title>Page & Section <hr></title>` | `tag: "title"`, child text content: `"Page & Section <hr>"` |
| **T-8** | Examples 1–6 regression | Run UI examples 1–6 | All pass cleanly with consistent lowercased tags and correct spacing |
