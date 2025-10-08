const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

function parseRadicalsTable(htmlPath = path.join(__dirname, "radicals.html")) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) {
    throw new Error("Unable to locate <tbody> in radicals table.");
  }

  const tbody = tbodyMatch[1];
  const rows = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(tbody)) !== null) {
    const cells = extractCells(rowMatch[1]);
    if (cells.length === 0) {
      continue;
    }

    const radicalFormsRaw = cells[1] ?? "";
    const radicalForms = parseRadicalForms(radicalFormsRaw);
    const simplifiedRaw = cells[10] ?? "";
    const { simplified, traditional } = parseSimplifiedCell(
      simplifiedRaw,
      radicalForms
    );

    rows.push({
      index: toNumber(cells[0]),
      radicalForms,
      radicalFormsRaw,
      strokeCount: toNumber(cells[2]),
      meaning: cells[3] ?? "",
      colloquialTerm: cells[4] ?? "",
      pinyin: cells[5] ?? "",
      hanViet: cells[6] ?? "",
      hiraganaRomaji: cells[7] ?? "",
      hangulRomaja: cells[8] ?? "",
      frequency: toNumber(cells[9]),
      simplified,
      traditional,
      simplifiedRaw,
      examples: cells[11] ?? "",
      rawCells: cells,
    });
  }

  return rows;
}

function extractCells(rowHtml) {
  const cells = [];
  const cellRegex = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
  let cellMatch;

  while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
    const cleaned = cleanCellContent(cellMatch[2]);
    if (cleaned !== "") {
      cells.push(cleaned);
    } else {
      cells.push("");
    }
  }

  return cells;
}

function cleanCellContent(content) {
  if (!content) {
    return "";
  }

  let text = content;
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/<br\s*\/?>/gi, " / ");
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

function decodeEntities(text) {
  const entityMap = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&quot;": '"',
    "&apos;": "'",
    "&frasl;": "/",
    "&middot;": "·",
    "&ndash;": "–",
    "&mdash;": "—",
    "&lt;": "<",
    "&gt;": ">",
  };

  let decoded = text.replace(
    /&(nbsp|amp|quot|apos|frasl|middot|ndash|mdash|lt|gt);/g,
    (match) => {
      return entityMap[match] ?? match;
    }
  );

  decoded = decoded.replace(/&#(\d+);/g, (_, code) => {
    return String.fromCharCode(Number(code));
  });

  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });

  return decoded;
}

function toNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const numericPortion = value.replace(/[^\d.]/g, "");
  if (numericPortion === "") {
    return null;
  }

  const number = Number(numericPortion);
  return Number.isNaN(number) ? null : number;
}

function parseRadicalForms(text) {
  if (!text) {
    return [];
  }

  const normalized = text
    .replace(/[()（）[\]［］]/g, " ")
    .replace(/[、，,;；・]/g, "/")
    .replace(/\s+/g, " ")
    .trim();

  const candidates = normalized
    .split(/\s*\/\s*/)
    .flatMap((chunk) => chunk.split(/\s+/))
    .map((form) => form.trim())
    .filter((form) => form.length > 0);

  const seen = new Set();
  const uniqueForms = [];
  for (const form of candidates) {
    if (!seen.has(form)) {
      seen.add(form);
      uniqueForms.push(form);
    }
  }

  return uniqueForms;
}

function parseSimplifiedCell(text, radicalForms = []) {
  if (!text) {
    return fillMissingWithRadicalForms(
      { simplified: null, traditional: null },
      radicalForms
    );
  }

  let simplified = text.trim();
  let traditional = null;

  const prMatch = simplified.match(/\(pr\.\s*([^)]+)\)/i);
  if (prMatch) {
    traditional = prMatch[1].trim() || null;
    simplified = simplified.replace(prMatch[0], "").trim();
  }

  if (simplified === "") {
    simplified = null;
  }

  return fillMissingWithRadicalForms({ simplified, traditional }, radicalForms);
}

function fillMissingWithRadicalForms(values, radicalForms) {
  const primaryForm =
    Array.isArray(radicalForms) && radicalForms.length > 0
      ? radicalForms[0]
      : null;
  const result = { ...values };
  if (!result.simplified && primaryForm) {
    result.simplified = primaryForm;
  }
  if (!result.traditional && primaryForm) {
    result.traditional = primaryForm;
  }
  return result;
}

function buildQueryCharacters(row) {
  const candidates = [
    ...(Array.isArray(row.radicalForms) ? row.radicalForms : []),
    row.simplified,
    row.traditional,
  ].filter(Boolean);

  const uniqueCharacters = [];
  const seen = new Set();
  for (const char of candidates) {
    if (!seen.has(char)) {
      seen.add(char);
      uniqueCharacters.push(char);
    }
  }
  return uniqueCharacters;
}

function parseStoredList(value) {
  if (!value) {
    return [];
  }

  const trimmed = String(value).trim();
  if (trimmed === "") {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (item == null ? "" : String(item).trim()))
        .filter((item) => item.length > 0);
    }
  } catch (error) {
    // Fall back to delimiter-based parsing below.
  }

  return trimmed
    .split(/[,;/]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function serializeList(items) {
  if (!items || items.length === 0) {
    return null;
  }
  return JSON.stringify(items);
}

function insertRadicalsIntoDb(
  dbPath,
  htmlPath = path.join(__dirname, "radicals.html")
) {
  if (!dbPath || typeof dbPath !== "string") {
    throw new Error("insertRadicalsIntoDb requires a database path string.");
  }

  const absoluteDbPath = path.resolve(dbPath);
  if (!fs.existsSync(absoluteDbPath)) {
    throw new Error(
      `SQLite database not found at ${absoluteDbPath}. Check the path you provided.`
    );
  }

  const absoluteHtmlPath = path.resolve(htmlPath);
  const radicals = parseRadicalsTable(absoluteHtmlPath);

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(
      absoluteDbPath,
      sqlite3.OPEN_READWRITE,
      (err) => {
        if (err) {
          reject(err);
          return;
        }

        (async () => {
          try {
            for (const radical of radicals) {
              await upsertRadical(db, radical);
            }

            db.close((closeErr) => {
              if (closeErr) {
                reject(closeErr);
              } else {
                resolve(radicals.length);
              }
            });
          } catch (processingError) {
            db.close(() => reject(processingError));
          }
        })();
      }
    );
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
}

async function upsertRadical(db, radicalRow) {
  const queryCharacters = buildQueryCharacters(radicalRow);
  if (queryCharacters.length === 0) {
    return;
  }

  const simplifiedMatch = await findMatchByColumn(
    db,
    "simplified",
    queryCharacters
  );
  const matchRow =
    simplifiedMatch ||
    (await findMatchByColumn(db, "traditional", queryCharacters));

  if (matchRow) {
    await updateExistingKeyword(db, matchRow, radicalRow, queryCharacters);
  } else {
    await insertNewKeyword(db, radicalRow, queryCharacters);
  }
}

async function findMatchByColumn(db, columnName, queryCharacters) {
  for (const character of queryCharacters) {
    const row = await dbGet(
      db,
      `SELECT id, keyword, simplified, traditional, additional_forms, additional_keywords
       FROM hanzi_keywords
       WHERE ${columnName} = ?
       LIMIT 1`,
      [character]
    );
    if (row) {
      return row;
    }
  }
  return null;
}

async function updateExistingKeyword(
  db,
  existingRow,
  radicalRow,
  queryCharacters
) {
  const formsAlreadyPresent = parseStoredList(existingRow.additional_forms);
  const formsToAdd = queryCharacters.filter((character) => {
    return (
      character !== existingRow.simplified &&
      character !== existingRow.traditional &&
      !formsAlreadyPresent.includes(character)
    );
  });

  const meaning = (radicalRow.meaning || "").trim();
  const existingKeyword = (existingRow.keyword || "").trim();
  const additionalKeywords = parseStoredList(existingRow.additional_keywords);
  const meaningAlreadyPresent =
    meaning.length === 0 ||
    meaning === existingKeyword ||
    additionalKeywords.includes(meaning);

  const updates = [];
  const params = [];

  if (formsToAdd.length > 0) {
    const updatedForms = [...formsAlreadyPresent, ...formsToAdd];
    updates.push("additional_forms = ?");
    params.push(serializeList(updatedForms));
  }

  if (!meaningAlreadyPresent) {
    const updatedKeywords = [...additionalKeywords, meaning];
    updates.push("additional_keywords = ?");
    params.push(serializeList(updatedKeywords));
  }

  if (updates.length > 0) {
    params.push(existingRow.id);
    const sql = `UPDATE hanzi_keywords SET ${updates.join(", ")} WHERE id = ?`;
    await dbRun(db, sql, params);
  }
}

async function insertNewKeyword(db, radicalRow, queryCharacters) {
  const simplified = radicalRow.simplified || queryCharacters[0] || null;
  const traditional =
    radicalRow.traditional || simplified || queryCharacters[1] || null;

  const additionalForms = queryCharacters.filter((character) => {
    return character !== simplified && character !== traditional;
  });

  await dbRun(
    db,
    `INSERT INTO hanzi_keywords (
      book_order,
      book_chapter,
      keyword,
      simplified,
      freq_rank,
      additional_keywords,
      traditional,
      additional_forms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      null,
      null,
      radicalRow.meaning || null,
      simplified,
      null,
      null,
      traditional,
      serializeList(additionalForms),
    ]
  );
}

insertRadicalsIntoDb("./public/chinese.db");

module.exports = {
  parseRadicalsTable,
  insertRadicalsIntoDb,
};
