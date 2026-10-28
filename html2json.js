const TAG_OPEN = "<";
const TAG_CLOSE = ">";
const TAG_SLASH = "/";
const TAG_EXCLAMATION = "!";
const CLOSING_TAG_PREFIX = "</";
const COMMENT_START = "<!--";
const COMMENT_END = "-->";
const DOCTYPE_PREFIX = "<!";

const RAW_TEXT_TAGS = ["script", "style", "textarea", "title"];

const SELF_CLOSING_TAGS = [
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
];

// Elements that are implicitly closed when specific other tags open
const AUTO_CLOSE_MAP = new Map(
  Object.entries({
    p: [
      "p",
      "div",
      "section",
      "article",
      "aside",
      "nav",
      "header",
      "footer",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "table",
      "form",
      "blockquote",
      "pre",
      "hr",
      "address",
      "fieldset",
      "figure",
      "main",
      "details",
      "dl",
      "hgroup",
      "search",
    ],
    li: ["li"],
    td: ["td", "th", "tr", "thead", "tbody", "tfoot"],
    th: ["td", "th", "tr", "thead", "tbody", "tfoot"],
    tr: ["tr", "thead", "tbody", "tfoot"],
    dd: ["dd", "dt"],
    dt: ["dd", "dt"],
    thead: ["tbody", "tfoot"],
    tbody: ["tbody", "tfoot"],
    tfoot: ["tbody"],
    option: ["option", "optgroup"],
    optgroup: ["optgroup"],
    colgroup: ["colgroup", "thead", "tbody", "tfoot", "tr"],
    rt: ["rt", "rp"],
    rp: ["rt", "rp"],
  }),
);

const NAMED_ENTITIES = new Map(
  Object.entries({
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: "\u00A0",
    copy: "\u00A9",
    reg: "\u00AE",
    trade: "\u2122",
    mdash: "\u2014",
    ndash: "\u2013",
    hellip: "\u2026",
    laquo: "\u00AB",
    raquo: "\u00BB",
    bull: "\u2022",
    middot: "\u00B7",
    lsquo: "\u2018",
    rsquo: "\u2019",
    ldquo: "\u201C",
    rdquo: "\u201D",
    euro: "\u20AC",
    pound: "\u00A3",
    yen: "\u00A5",
    cent: "\u00A2",
    times: "\u00D7",
    divide: "\u00F7",
    plusmn: "\u00B1",
    deg: "\u00B0",
    micro: "\u00B5",
  }),
);

const MAX_CODE_POINT = 0x10ffff;

function decodeHtmlEntities(text) {
  if (text.indexOf("&") === -1) return text;

  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = parseInt(entity.slice(2), 16);
      return code > 0 && code <= MAX_CODE_POINT ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith("#")) {
      const code = parseInt(entity.slice(1), 10);
      return code > 0 && code <= MAX_CODE_POINT ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES.get(entity) ?? match;
  });
}

function isValidTagStart(htmlText, index) {
  if (index + 1 >= htmlText.length) return false;
  const nextChar = htmlText[index + 1];

  const isAsciiLetter =
    (nextChar >= "a" && nextChar <= "z") || (nextChar >= "A" && nextChar <= "Z");
  const isClosingSlash = nextChar === TAG_SLASH;
  const isSpecialTag = nextChar === TAG_EXCLAMATION;

  return isAsciiLetter || isClosingSlash || isSpecialTag;
}

function findNextOpenTagIndex(htmlText, fromIndex) {
  let openTagIndex = htmlText.indexOf(TAG_OPEN, fromIndex);

  while (openTagIndex !== -1) {
    if (isValidTagStart(htmlText, openTagIndex)) {
      return openTagIndex;
    }
    openTagIndex = htmlText.indexOf(TAG_OPEN, openTagIndex + 1);
  }

  return -1;
}

function findTagCloseIndex(htmlText, fromIndex) {
  let inQuote = null;

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

function parseAttributes(rawAttributes) {
  const attributes = {};
  if (!rawAttributes) return attributes;

  const text = rawAttributes.trim();
  let i = 0;
  const len = text.length;

  while (i < len) {
    while (i < len && text[i] <= " ") {
      i++;
    }
    if (i >= len) break;

    if (text[i] === TAG_SLASH) {
      i++;
      continue;
    }

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
    const attrName = text.substring(nameStart, i).toLowerCase();
    if (!attrName) break;

    while (i < len && text[i] <= " ") {
      i++;
    }

    if (i < len && text[i] === "=") {
      i++;

      while (i < len && text[i] <= " ") {
        i++;
      }

      if (i >= len) {
        attributes[attrName] = "";
        break;
      }

      const quoteChar = text[i];
      if (quoteChar === '"' || quoteChar === "'") {
        i++;
        const valStart = i;
        while (i < len && text[i] !== quoteChar) {
          i++;
        }
        attributes[attrName] = decodeHtmlEntities(text.substring(valStart, i));
        if (i < len) i++;
      } else {
        const valStart = i;
        while (
          i < len &&
          text[i] > " " &&
          text[i] !== TAG_CLOSE &&
          !(text[i] === TAG_SLASH && (i + 1 >= len || text[i + 1] === TAG_CLOSE))
        ) {
          i++;
        }
        attributes[attrName] = decodeHtmlEntities(text.substring(valStart, i));
      }
    } else {
      attributes[attrName] = true;
    }
  }

  return attributes;
}

function findRawContainerEnd(htmlText, fromIndex, tagName) {
  const targetTag = tagName.toLowerCase();
  let searchPos = fromIndex;

  while (searchPos < htmlText.length) {
    const closeStart = htmlText.indexOf(CLOSING_TAG_PREFIX, searchPos);
    if (closeStart === -1) return null;

    let i = closeStart + CLOSING_TAG_PREFIX.length;
    const nameStart = i;
    while (
      i < htmlText.length &&
      htmlText[i] > " " &&
      htmlText[i] !== TAG_CLOSE &&
      htmlText[i] !== TAG_SLASH
    ) {
      i++;
    }
    const foundTagName = htmlText.substring(nameStart, i).toLowerCase();

    if (foundTagName === targetTag) {
      const closeEnd = htmlText.indexOf(TAG_CLOSE, i);
      if (closeEnd !== -1) {
        return {
          contentEnd: closeStart,
          nextCursor: closeEnd + TAG_CLOSE.length,
        };
      }
    }

    searchPos = closeStart + CLOSING_TAG_PREFIX.length;
  }

  return null;
}

function processTextContent(rawText, currentParent, isFollowedByClosingTag) {
  if (!rawText) return null;

  let hasNonWhitespace = false;
  for (let i = 0; i < rawText.length; i++) {
    if (rawText[i] > " ") {
      hasNonWhitespace = true;
      break;
    }
  }
  if (!hasNonWhitespace) return null;

  let collapsed = "";
  let inSpace = false;
  for (let i = 0; i < rawText.length; i++) {
    if (rawText[i] <= " ") {
      inSpace = true;
    } else {
      if (inSpace && collapsed.length > 0) {
        collapsed += " ";
      }
      collapsed += rawText[i];
      inSpace = false;
    }
  }

  const preserveLeading = currentParent.children.length > 0 && rawText[0] <= " ";
  const preserveTrailing = !isFollowedByClosingTag && rawText[rawText.length - 1] <= " ";

  return decodeHtmlEntities(
    (preserveLeading ? " " : "") + collapsed + (preserveTrailing ? " " : ""),
  );
}

function html2json(htmlText, options = {}) {
  if (!htmlText || typeof htmlText !== "string") {
    return [];
  }

  const { includeScripts = true, includeStyles = true } = options;

  let cursor = 0;
  const root = { children: [] };
  const stack = [root];

  while (cursor < htmlText.length) {
    const currentParent = stack[stack.length - 1];

    const openTagIndex = findNextOpenTagIndex(htmlText, cursor);

    if (openTagIndex === -1) {
      const remainingRaw = htmlText.substring(cursor);
      const textNode = processTextContent(remainingRaw, currentParent, true);

      if (textNode) {
        currentParent.children.push({ type: "text", content: textNode });
      }

      break;
    }

    if (openTagIndex > cursor) {
      const textRaw = htmlText.substring(cursor, openTagIndex);
      const isNextClosing = htmlText.startsWith(CLOSING_TAG_PREFIX, openTagIndex);
      const textNode = processTextContent(textRaw, currentParent, isNextClosing);

      if (textNode) {
        currentParent.children.push({ type: "text", content: textNode });
      }
    }

    cursor = openTagIndex;

    // Comments (<!-- ... -->)
    if (htmlText.startsWith(COMMENT_START, cursor)) {
      const commentEndIndex = htmlText.indexOf(COMMENT_END, cursor + COMMENT_START.length);

      if (commentEndIndex === -1) break;

      cursor = commentEndIndex + COMMENT_END.length;
      continue;
    }

    // DOCTYPE (<!DOCTYPE ...>)
    if (htmlText.startsWith(DOCTYPE_PREFIX, cursor)) {
      const doctypeEndIndex = htmlText.indexOf(TAG_CLOSE, cursor + DOCTYPE_PREFIX.length);

      if (doctypeEndIndex === -1) break;

      cursor = doctypeEndIndex + TAG_CLOSE.length;
      continue;
    }

    // Closing tags (</tag>)
    if (htmlText.startsWith(CLOSING_TAG_PREFIX, cursor)) {
      const closeTagIndex = htmlText.indexOf(TAG_CLOSE, cursor + CLOSING_TAG_PREFIX.length);

      if (closeTagIndex === -1) {
        cursor += CLOSING_TAG_PREFIX.length;
        continue;
      }

      const closingTagName = htmlText
        .substring(cursor + CLOSING_TAG_PREFIX.length, closeTagIndex)
        .trim()
        .toLowerCase();

      let matchIndex = -1;
      for (let j = stack.length - 1; j >= 1; j--) {
        if (stack[j].tag === closingTagName) {
          matchIndex = j;
          break;
        }
      }

      // Close tags up to the matching opener; orphan closing tags are ignored
      if (matchIndex !== -1) {
        while (stack.length > matchIndex) {
          stack.pop();
        }
      }

      cursor = closeTagIndex + TAG_CLOSE.length;
    }
    // Opening tags (<tag ...>)
    else {
      const closeTagIndex = findTagCloseIndex(htmlText, cursor + TAG_OPEN.length);
      if (closeTagIndex === -1) {
        cursor += TAG_OPEN.length;
        continue;
      }

      const rawTagContent = htmlText.substring(cursor + TAG_OPEN.length, closeTagIndex);

      let i = 0;
      while (
        i < rawTagContent.length &&
        rawTagContent[i] > " " &&
        rawTagContent[i] !== TAG_SLASH &&
        rawTagContent[i] !== TAG_CLOSE
      ) {
        i++;
      }
      const tagName = rawTagContent.substring(0, i).toLowerCase();

      const rawAttributes = rawTagContent.substring(i);
      const attributes = parseAttributes(rawAttributes);

      const isRawTextContainer = RAW_TEXT_TAGS.includes(tagName);
      const isXmlSelfClosing = rawTagContent.trim().endsWith(TAG_SLASH);
      const isVoidElement = SELF_CLOSING_TAGS.includes(tagName);
      const isSelfClosing = isXmlSelfClosing || isVoidElement;

      const shouldInclude =
        (tagName === "script" && !includeScripts) || (tagName === "style" && !includeStyles)
          ? false
          : true;

      // Auto-close preceding tags if current tag implicitly closes them
      while (stack.length > 1) {
        const topTag = stack[stack.length - 1].tag;
        const closedBy = AUTO_CLOSE_MAP.get(topTag);

        if (closedBy && closedBy.includes(tagName)) {
          stack.pop();
        } else {
          break;
        }
      }

      const activeParent = stack[stack.length - 1];

      // Handle raw text containers (script, style, textarea, title)
      if (isRawTextContainer && !isSelfClosing) {
        const bodyStartIndex = closeTagIndex + TAG_CLOSE.length;
        const containerEnd = findRawContainerEnd(htmlText, bodyStartIndex, tagName);

        if (!containerEnd) {
          const rawContent = htmlText.substring(bodyStartIndex).trim();

          if (shouldInclude) {
            activeParent.children.push({
              type: "element",
              tag: tagName,
              attributes: attributes,
              children: rawContent ? [{ type: "text", content: rawContent }] : [],
            });
          }
          break;
        }

        let rawContent = htmlText.substring(bodyStartIndex, containerEnd.contentEnd).trim();

        if (tagName === "textarea" || tagName === "title") {
          rawContent = decodeHtmlEntities(rawContent);
        }

        if (shouldInclude) {
          activeParent.children.push({
            type: "element",
            tag: tagName,
            attributes: attributes,
            children: rawContent ? [{ type: "text", content: rawContent }] : [],
          });
        }

        cursor = containerEnd.nextCursor;
        continue;
      }

      if (!shouldInclude) {
        cursor = closeTagIndex + TAG_CLOSE.length;
        continue;
      }

      const newNode = {
        type: "element",
        tag: tagName,
        attributes: attributes,
        children: [],
      };

      activeParent.children.push(newNode);

      if (!isSelfClosing) {
        stack.push(newNode);
      }

      cursor = closeTagIndex + TAG_CLOSE.length;
    }
  }

  return root.children;
}
