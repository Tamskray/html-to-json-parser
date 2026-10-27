# HTML to JSON Parser Improvement Plan (Updated)

## Goal Description
Enhance `html2json.js` and `index.html` according to the feedback:
1. **Focus for this iteration**: Refactor code structure, helper functions, variable renaming, and safety guards (crash prevention & robust error handling).
2. **Postpone Attribute Parsing**: Attribute parsing will be designed and implemented in the **next** step.
3. **Readability First**: Replace cryptic numeric `charCodeAt` checks with self-documenting character comparisons (e.g., `char === '='`, `char >= 'a' && char <= 'z'`) or named constants.
4. **Error Handling & UI Feedback**: Ensure that if HTML has structural errors, the parser does not crash. Catch or report errors cleanly in the UI instead of failing silently or throwing unhandled exceptions.
5. **Additional Test Examples**: Add new example buttons in `index.html` (including edge cases and malformed HTML) for rapid manual verification.

---

## Answers to Review Feedback & Design Questions

### 1. `charCodeAt` vs Direct Character Comparison / `indexOf`
> **User Question:** *"is it even worth it to use charCodeAt instead of indexOf / char comparisons? Right now without comments it's hard to understand."*
- **Recommendation:** **Use direct character comparisons** (e.g. `char >= 'a' && char <= 'z'`, `char === '/'`, `char === '!'`).
- **Why:** `charCodeAt` is a micro-optimization from C/Assembly habits. In V8 (Chrome / Node.js), comparing single characters (`str[i] === '/'` or `char === '='`) has virtually identical performance for documents of realistic sizes, while being **10x more readable** and eliminating the need for magic numbers like `61`, `47`, `33`.

### 2. DOCTYPE and Comments in the Output JSON
> **User Question:** *"as I understood we should not include comments and doctype in the output JSON?"*
- **Recommendation:**
  - Standard DOM-to-JSON trees focus on content elements (`element` and `text`).
  - Comments (`<!-- ... -->`) and `<!DOCTYPE ...>` should be safely detected and skipped so they **do not enter the parent stack** (which was causing subsequent elements to nest inside them).
  - *Optionally*, if the reviewer expects them, they can be emitted as `{ type: "comment", content: "..." }` and `{ type: "doctype", content: "html" }`. For now, we will handle them gracefully so they never break the tree hierarchy or get trapped on the stack.

### 3. Error Handling: Resilient vs Error Display
> **Requirement:** *"if we can't parse html to json, due to some of the errors, we should display appropriate message about that."*
- In `html2json(htmlText)`:
  - Validate input (`htmlText` null/undefined/non-string $\rightarrow$ return empty tree or throw a clear descriptive error).
  - Track unclosed tags or severe malformations. If unrecoverable, return an error object `{ error: true, message: "..." }` or throw a descriptive `ParseError`.
- In `convertHtml2JsonAndSet()`:
  - Wrap in a `try...catch` block.
  - If an error occurs (or if the result contains `{ error: true }`), display a clear, formatted error message in `jsonArea` (and optionally style it with a subtle warning border/color) rather than leaving the user confused with a blank or crashed script.

---

## Implementation Details

### Phase 1: Structural Refactoring & Helper Functions

#### 1. Helper Function: `isValidTagStart(htmlText, index)`
Extract the check for whether a `<` is followed by a valid tag start:
```javascript
function isValidTagStart(htmlText, index) {
  if (index + 1 >= htmlText.length) return false;
  const nextChar = htmlText[index + 1];

  const isAsciiLetter = (nextChar >= 'a' && nextChar <= 'z') || (nextChar >= 'A' && nextChar <= 'Z');
  const isClosingSlash = nextChar === '/';
  const isSpecialTag = nextChar === '!'; // doctype or comment

  return isAsciiLetter || isClosingSlash || isSpecialTag;
}
```

#### 2. Helper Function: `findNextOpenTagIndex(htmlText, fromIndex)`
Scans for `<` that satisfies `isValidTagStart`, correctly distinguishing tags from math comparisons (like `a < b`):
```javascript
function findNextOpenTagIndex(htmlText, fromIndex) {
  let openTagIndex = htmlText.indexOf("<", fromIndex);
  while (openTagIndex !== -1) {
    if (isValidTagStart(htmlText, openTagIndex)) {
      return openTagIndex;
    }
    openTagIndex = htmlText.indexOf("<", openTagIndex + 1);
  }
  return -1;
}
```

#### 3. Variable Renaming & Loop Logic
- Rename `nextBracketIndex` $\rightarrow$ `openTagIndex`.
- Rename `closeBracketIndex` $\rightarrow$ `closeTagIndex`.
- Add infinite-loop protection: if `closeTagIndex === -1` (unclosed `<`), advance the cursor or raise an error instead of infinite looping.
- Add stack-underflow protection: ensure `stack.length > 1` before `stack.pop()`. If an unmatched closing tag (e.g. `</span>` with no matching open tag) is encountered, log a warning or report the mismatch safely.

---

### Phase 2: Comments & DOCTYPE Handling
- **Comments (`<!-- ... -->`)**:
  - If `htmlText.startsWith("<!--", openTagIndex)`:
  - Find closing `-->` (`htmlText.indexOf("-->", openTagIndex + 4)`).
  - Do NOT push onto `stack`.
  - Advance `cursor = closeIndex + 3`.
- **DOCTYPE (`<!DOCTYPE ...>`)**:
  - If `htmlText.startsWith("<!", openTagIndex)` (and not comment):
  - Find closing `>` (`htmlText.indexOf(">", openTagIndex)`).
  - Do NOT push onto `stack`.
  - Advance `cursor = closeIndex + 1`.

---

### Phase 3: Error Handling & UI Notification
In `convertHtml2JsonAndSet()`:
```javascript
function convertHtml2JsonAndSet() {
  const htmlTextArea = document.getElementById("html");
  const jsonArea = document.getElementById("json");
  const htmlTextAreaValue = htmlTextArea.value;

  try {
    const jsonObj = html2json(htmlTextAreaValue);
    jsonArea.textContent = JSON.stringify(jsonObj, null, 2);
    jsonArea.style.borderColor = "";
  } catch (error) {
    jsonArea.textContent = JSON.stringify(
      {
        error: "HTML Parsing Error",
        details: error.message || String(error)
      },
      null,
      2
    );
    jsonArea.style.borderColor = "red";
  }
}
```

---

### Phase 4: Additional Test Examples in `index.html` & `html2json.js`
Add buttons to `index.html`:
1. **Example 1**: Initial complex HTML (already present).
2. **Example 2**: Simpler HTML (already present).
3. **Example 3 (Edge cases)**:
   - Includes comments `<!-- ... -->`.
   - Math expressions `5 < 10 && 20 > 15`.
   - Self-closing tags (`<img src="pic.jpg">`, `<br>`).
4. **Example 4 (Malformed / Erroneous HTML)**:
   - Unmatched closing tag `</div>`.
   - Missing closing bracket `<p Hello world`.
   - Broken hierarchy to demonstrate error messaging.

---

## Proposed Changes to Codebase

### [MODIFY] [html2json.js](file:///d:/projects/test_tasks/html-parser/html2json.js)
- Add `isValidTagStart(htmlText, index)` using clear character comparisons.
- Add `findNextOpenTagIndex(htmlText, fromIndex)`.
- Refactor `html2json`:
  - Rename `nextBracketIndex` $\rightarrow$ `openTagIndex`.
  - Rename `closeBracketIndex` $\rightarrow$ `closeTagIndex`.
  - Implement comment & DOCTYPE skipping.
  - Implement stack underflow protection & unclosed tag guards.
  - Add input validation.
- Update `convertHtml2JsonAndSet` with `try...catch` and error display in the JSON textarea.
- Add `showExample3()` and `showExample4()` functions.

### [MODIFY] [index.html](file:///d:/projects/test_tasks/html-parser/index.html)
- Add buttons for `Input Example 3 (Edge Cases)` and `Input Example 4 (Malformed HTML)`.

---

## Verification Plan

### Manual Verification
1. Open `index.html` in browser.
2. Click **Input Example 1** $\rightarrow$ Click **Convert to JSON** $\rightarrow$ Verify clean AST without comments/doctype breaking the stack.
3. Click **Input Example 2** $\rightarrow$ Click **Convert to JSON** $\rightarrow$ Verify valid output.
4. Click **Input Example 3 (Edge Cases)** $\rightarrow$ Verify that `<` in text (`5 < 10`) is parsed as text, comments are handled cleanly, self-closing tags work.
5. Click **Input Example 4 (Malformed HTML)** $\rightarrow$ Verify that the parser doesn't crash or freeze; instead, displays a clean error message in the output area.
6. Verify code formatting and absence of magic numbers.
