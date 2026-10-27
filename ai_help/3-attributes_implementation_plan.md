# Attribute Parsing Implementation Plan

## Goal Description
Implement full HTML attribute parsing for `html2json.js` strictly following all task criteria:
1. **Zero DOM parser / Zero Regular Expressions:** Pure character-by-character scanner.
2. **Incorporate All Conversation Decisions:**
   - Descriptive parameter naming (`rawAttributes`).
   - `.trim()` input handling.
   - Clean, self-documenting character comparisons (`char === '='`, `char === '"'`, `char === '\''`) with zero cryptic numeric ASCII codes.
   - Boolean attributes stored as `true` (e.g. `{ disabled: true }`).
3. **Quote-Aware Tag Close Indexing:** Prevent premature tag cutting when `>` appears inside attribute values (e.g. `<input value="a > b">`).
4. **Resilience & Robustness:** Never crash or infinite-loop on weird whitespace, unquoted attributes, or trailing self-closing slashes.

---

## Architectural Rationale: Why a Separate Function is Essential

### 1. Separation of Concerns (Structural AST vs. Lexical Attributes)
* `html2json()` is responsible for **structural document flow**: managing cursor movement, text node collection, opening/closing tag pairing, and stack hierarchy.
* `parseAttributes()` is responsible for **lexical tokenization**: distinguishing attribute keys, `=`, quoted values, unquoted values, and boolean flags.
* Mixing attribute scanning directly into the main loop turns a clean AST orchestrator into an unreadable, deeply nested loop.

### 2. Testability & Maintainability
* A standalone `parseAttributes(rawAttributes)` function can be tested in isolation on dozens of attribute permutations (single quotes, double quotes, unquoted values, booleans, multiple spaces) without requiring an entire HTML document.

---

## The "Hard Parts" in HTML Attribute Parsing

HTML attributes have several subtle edge cases that easily break naive parsers:

| Edge Case | Problem Description | Solution in Our Scanner |
| :--- | :--- | :--- |
| **`>` inside attribute quotes** | `<input placeholder="5 > 3">`<br/>A naive `indexOf(">")` cuts the tag prematurely at `>` inside the placeholder string! | Implement `findTagCloseIndex(htmlText, fromIndex)` that tracks quote states (`'` and `"`) and ignores `>` when inside quotes. |
| **Mixed Quote Types** | Double quotes inside single quotes (`alt='He said "hello"'`) or vice versa. | Track the exact matching opening quote char (`"` or `'`). |
| **Irregular Whitespace** | `disabled \n autofocus`, `class = "btn"`, spaces around `=`. | Explicitly skip whitespace between name, `=`, and value. |
| **Boolean Attributes** | `<input type="checkbox" checked disabled>` | When an attribute name is not followed by `=`, assign `true`. |
| **Self-Closing Slash** | `<img src="pic.jpg" />` | Skip trailing `/` so it is not mistaken for an attribute name or value. |
| **Unquoted Values** | `<table border=0 cellpadding=5>` | Read value characters until whitespace or `/` is encountered. |

---

## Proposed Architecture

```mermaid
flowchart TD
    A["html2json encounters Opening Tag '<'"] --> B["findTagCloseIndex(htmlText, openTagIndex)<br/>Quote-aware search for actual '>'"]
    B --> C["Extract rawTagContent: 'tag attr1=val attr2'"]
    C --> D["Extract tagName (first word)"]
    D --> E["Extract rawAttributes (remainder of rawTagContent)"]
    E --> F["parseAttributes(rawAttributes)"]
    
    subgraph "parseAttributes(rawAttributes) Scanner"
        G["Trim & loop cursor i through rawAttributes"] --> H["Skip whitespace & trailing '/'"]
        H --> I["Read attrName until whitespace, '=', or '/'"]
        I --> J{"Is next non-space char '='?"}
        J -->|No| K["attributes[attrName] = true (Boolean)"]
        J -->|Yes| L["Consume '=' & skip whitespace"]
        L --> M{"Next char is quote (' or \")?"}
        M -->|Yes| N["Read value until matching quote"]
        M -->|No| O["Read unquoted value until whitespace or '/'"]
        N --> P["attributes[attrName] = attrValue"]
        O --> P
        K --> Q["Repeat until end of string"]
        P --> Q
    end
    
    F --> R["Assign attributes to newNode.attributes"]
    R --> S["Push to Parent & Stack"]
```

---

## Proposed Code Changes

### [MODIFY] [html2json.js](file:///d:/projects/test_tasks/html-parser/html2json.js)

#### 1. Quote-Aware Tag Delimiter Helper
```javascript
/**
 * Finds the index of the closing '>' for a tag, ignoring '>' that appear inside quoted attribute values.
 */
function findTagCloseIndex(htmlText, fromIndex) {
  let inQuote = null; // null, '"', or "'"
  for (let i = fromIndex; i < htmlText.length; i++) {
    const char = htmlText[i];
    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      }
    } else {
      if (char === '"' || char === "'") {
        inQuote = char;
      } else if (char === TAG_CLOSE) {
        return i;
      }
    }
  }
  return -1;
}
```

#### 2. Pure Character-by-Character Attribute Parser (Zero DOM, Zero Regex)
```javascript
/**
 * Parses raw HTML attribute string into a key-value dictionary.
 * Supports quoted strings ("...", '...'), unquoted values, and boolean flags.
 * Uses no DOM parser and no regular expressions.
 * @param {string} rawAttributes
 * @returns {Record<string, string | boolean>}
 */
function parseAttributes(rawAttributes) {
  const attributes = {};
  if (!rawAttributes) return attributes;

  const text = rawAttributes.trim();
  let i = 0;
  const len = text.length;

  while (i < len) {
    // 1. Skip whitespace
    while (i < len && text[i] <= " ") {
      i++;
    }
    if (i >= len) break;

    // Skip trailing self-closing slash if present
    if (text[i] === TAG_SLASH) {
      i++;
      continue;
    }

    // 2. Read attribute name
    const nameStart = i;
    while (
      i < len &&
      text[i] > " " &&
      text[i] !== "=" &&
      text[i] !== TAG_SLASH &&
      text[i] !== TAG_CLOSE
    ) {
      i++;
    }
    const attrName = text.substring(nameStart, i);
    if (!attrName) break;

    // 3. Skip whitespace between name and '='
    while (i < len && text[i] <= " ") {
      i++;
    }

    // 4. Check if attribute has an '=' value assignment
    if (i < len && text[i] === "=") {
      i++; // consume '='

      // Skip whitespace after '='
      while (i < len && text[i] <= " ") {
        i++;
      }

      if (i >= len) {
        attributes[attrName] = "";
        break;
      }

      const quoteChar = text[i];
      if (quoteChar === '"' || quoteChar === "'") {
        // Quoted value
        i++; // skip opening quote
        const valStart = i;
        while (i < len && text[i] !== quoteChar) {
          i++;
        }
        attributes[attrName] = text.substring(valStart, i);
        if (i < len) i++; // skip closing quote
      } else {
        // Unquoted value
        const valStart = i;
        while (i < len && text[i] > " " && text[i] !== TAG_SLASH) {
          i++;
        }
        attributes[attrName] = text.substring(valStart, i);
      }
    } else {
      // Boolean attribute (e.g., 'disabled', 'checked', 'required')
      attributes[attrName] = true;
    }
  }

  return attributes;
}
```

#### 3. Update Opening Tag Handling in `html2json()`
- Replace `htmlText.indexOf(TAG_CLOSE, cursor + TAG_OPEN.length)` with `findTagCloseIndex(htmlText, cursor + TAG_OPEN.length)`.
- Extract `rawAttributes = rawTagContent.substring(i)`.
- Attach `attributes: parseAttributes(rawAttributes)` to `newNode`.

#### 4. Add UI Examples for Attributes
- Add **Example 5 (Attributes Showcase)** to [`html2json.js`](file:///d:/projects/test_tasks/html-parser/html2json.js) and the dropdown in [`index.html`](file:///d:/projects/test_tasks/html-parser/index.html).

---

## Future Scope: What Else Can / Should Be Added?

Once attributes are implemented, the parser will handle the vast majority of HTML documents. Here is an honest assessment of what remains and whether it's needed:

1. **Raw Text Containers (`<script>` and `<style>`)**:
   * *Status:* Highly recommended.
   * *Why:* In standard HTML, JS scripts and CSS styles can contain `<`, `>`, `&&`, or quotes inside their code (e.g. `for (let i = 0; i < 10; i++)`). Currently, the parser might see `< 10` and treat it cautiously, but a raw `<script>` handler ensures all contents until `</script>` are captured purely as raw text.
2. **HTML Entity Decoding (Optional)**:
   * *Status:* Nice-to-have, but usually left as raw strings in ASTs.
   * *Why:* Strings like `&amp;`, `&lt;`, `&copy;` can either remain as-is (standard in most ASTs like Babel/Hast) or be unescaped. Leaving them raw is standard AST behavior.
3. **Whitespace Normalization**:
   * *Status:* Already handled gracefully using `.trim()`.

---

## Manual Test Scenarios

| Scenario # | Test Case Description | HTML Input Snippet | Expected JSON Attributes Result |
| :--- | :--- | :--- | :--- |
| **TC-1** | Standard double quotes & classes | `<button id="btn-submit" class="primary bold">` | `{"id": "btn-submit", "class": "primary bold"}` |
| **TC-2** | Single quotes with nested double quote | `<span title='He said "Hello"'>` | `{"title": "He said \"Hello\""}` |
| **TC-3** | Boolean attributes | `<input type="checkbox" checked disabled required>` | `{"type": "checkbox", "checked": true, "disabled": true, "required": true}` |
| **TC-4** | `>` character inside attribute quotes | `<input placeholder="Enter score > 50" value="a > b">` | `{"placeholder": "Enter score > 50", "value": "a > b"}` (Tag does NOT break prematurely) |
| **TC-5** | Unquoted attribute values | `<table border=1 cellpadding=0>` | `{"border": "1", "cellpadding": "0"}` |
| **TC-6** | Self-closing void tags with attributes | `<img src="logo.png" alt="Company Logo" />` | `{"src": "logo.png", "alt": "Company Logo"}` (No trailing `/` in attributes) |
| **TC-7** | Whitespace around `=` | `<div data-id = "123" >` | `{"data-id": "123"}` |
