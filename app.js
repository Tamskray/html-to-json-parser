const EXAMPLES = [
  {
    label: "Standard Webpage",
    file: "01_standard_webpage.html",
    description:
      "Full HTML page with head, body, navigation, sections, forms, and inline elements.",
  },
  {
    label: "Edge Cases (Comments & Math Operators)",
    file: "02_edge_cases.html",
    description:
      "Comments with > inside, comparison operators in text, void/self-closing elements.",
  },
  {
    label: "Attributes Showcase",
    file: "04_attributes_showcase.html",
    description:
      "Double quotes, single quotes, boolean flags, unquoted values, whitespace around '=', and '>' inside attribute values.",
  },
  {
    label: "Raw Text: Script & Style",
    file: "05_raw_text_containers.html",
    description:
      "CSS selectors with '>', JS with '<' '>' comparison operators and HTML-like strings inside code.",
  },
  {
    label: "Implicit Closing Tags",
    file: "06_implicit_closing.html",
    description:
      "Lists, tables, and paragraphs with optional closing tags omitted — valid HTML per spec.",
  },
];

function convertHtml2JsonAndSet() {
  const htmlTextArea = document.getElementById("html");
  const jsonArea = document.getElementById("json");
  const htmlTextAreaValue = htmlTextArea.value;

  const includeScriptsEl = document.getElementById("includeScripts");
  const includeStylesEl = document.getElementById("includeStyles");

  const options = {
    includeScripts: includeScriptsEl ? includeScriptsEl.checked : true,
    includeStyles: includeStylesEl ? includeStylesEl.checked : true,
  };

  try {
    const jsonObj = html2json(htmlTextAreaValue, options);
    jsonArea.textContent = JSON.stringify(jsonObj, null, 2);
    jsonArea.style.borderColor = "";
  } catch (error) {
    jsonArea.textContent = JSON.stringify(
      {
        error: "HTML Parsing Error",
        message: error.message || String(error),
      },
      null,
      2,
    );
    jsonArea.style.borderColor = "red";
  }
}

async function loadSelectedExample(value) {
  const index = parseInt(value, 10);
  if (isNaN(index) || index < 0 || index >= EXAMPLES.length) return;

  const example = EXAMPLES[index];
  const jsonArea = document.getElementById("json");

  try {
    const response = await fetch("html_samples/" + example.file);
    if (!response.ok) {
      throw new Error("HTTP " + response.status + " — " + response.statusText);
    }
    const html = await response.text();
    document.getElementById("html").value = html;
    jsonArea.textContent = example.description;
    jsonArea.style.borderColor = "";
  } catch (error) {
    jsonArea.textContent =
      "Failed to load example: " +
      error.message +
      "\n\nMake sure you are serving this page via HTTP server (e.g. npx serve, python -m http.server).";
    jsonArea.style.borderColor = "red";
  }
}

function populateExamples() {
  const select = document.getElementById("exampleSelect");
  if (!select) return;

  EXAMPLES.forEach(function (example, index) {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = example.label;
    select.appendChild(option);
  });
}

document.addEventListener("DOMContentLoaded", populateExamples);
