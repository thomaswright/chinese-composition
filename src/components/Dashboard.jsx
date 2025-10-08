import { useEffect, useState } from "react";
import logoUrl from "../assets/logo.svg";
import ViewTabs from "./ViewTabs.jsx";
import SearchBar from "./SearchBar.jsx";
import KeywordList from "./KeywordList.jsx";
import DefinitionView from "./DefinitionView.jsx";
import HistoryList from "./HistoryList.jsx";
import Attribution from "./Attribution.jsx";
import {
  DEFAULT_VIEW,
  QUERY_DEBOUNCE_MS,
  QUERY_PARAM,
  VIEW_KEYWORDS,
  applyViewParam,
  createEmptyBookOrderNav,
  createEmptyDecompositionEntry,
  createEmptyDecompositionList,
  getQueryFromUrl,
  getViewFromUrl,
  normalizeView,
  pushHistory,
  uniqueById,
} from "../utils/appUtils.js";

export default function Dashboard({ db, onError }) {
  const [query, setQuery] = useState(() => getQueryFromUrl());
  const [debouncedQuery, setDebouncedQuery] = useState(() => getQueryFromUrl());
  const [results, setResults] = useState([]);
  const [decompositions, setDecompositions] = useState(
    createEmptyDecompositionList
  );
  const [bookOrderNav, setBookOrderNav] = useState(createEmptyBookOrderNav);
  const [view, setView] = useState(() => getViewFromUrl());
  const [keywordScript, setKeywordScript] = useState("simplified");
  const [allKeywords, setAllKeywords] = useState([]);
  const [loadingKeywords, setLoadingKeywords] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(query);
    }, QUERY_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!db) {
      setResults([]);
      setDecompositions(createEmptyDecompositionList());
      setBookOrderNav(createEmptyBookOrderNav());
      return;
    }

    const trimmedValue = (debouncedQuery ?? "").trim();

    if (!trimmedValue) {
      setResults([]);
      setDecompositions(createEmptyDecompositionList());
      setBookOrderNav(createEmptyBookOrderNav());
      return;
    }

    try {
      const { matchedRows, resolvedQueryValue } = resolveQueryMatches(
        db,
        trimmedValue
      );

      if (!matchedRows.length) {
        setResults([]);
        setDecompositions(createEmptyDecompositionList());
        setBookOrderNav(createEmptyBookOrderNav());
        return;
      }

      setHistory((prevHistory) => pushHistory(prevHistory, trimmedValue));

      withDecompositionStatements(db, (statements) => {
        const {
          decompositions: nextDecompositions,
          bookOrderNav: nextNav,
          enrichedRows,
        } = buildDecompositionResult({
          matchedRows,
          resolvedQueryValue,
          statements,
          fetchComponentRows: (value) => fetchComponentRowsForValue(db, value),
        });

        setDecompositions(nextDecompositions);
        setBookOrderNav(nextNav);
        setResults(enrichedRows);
      });
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error(String(err ?? "Unknown error"));
      if (onError) onError(error);
      else console.error(error);
      setBookOrderNav(createEmptyBookOrderNav());
    }
  }, [db, debouncedQuery, onError]);

  useEffect(() => {
    const handlePopState = () => {
      const nextValue = getQueryFromUrl();
      setQuery(nextValue);
      setView(getViewFromUrl());
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!db || allKeywords.length) return;

    setLoadingKeywords(true);

    const rows = [];
    let stmt;

    try {
      stmt = db.prepare(
        `SELECT simplified, keyword, book_order, traditional
         FROM hanzi_keywords
         ORDER BY (book_order IS NULL), book_order ASC`
      );

      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }

      setAllKeywords(rows);
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error(String(err ?? "Unknown error"));
      if (onError) onError(error);
      else console.error(error);
    } finally {
      if (stmt) stmt.free();
      setLoadingKeywords(false);
    }
  }, [db, allKeywords.length, onError]);

  const commitUrl = ({ nextQuery, nextView, replace }) => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);

    if (nextQuery) {
      params.set(QUERY_PARAM, nextQuery);
    } else {
      params.delete(QUERY_PARAM);
    }

    applyViewParam(params, nextView);

    const search = params.toString();
    const newUrl = search
      ? `${window.location.pathname}?${search}`
      : window.location.pathname;

    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (replace || newUrl === currentUrl) {
      window.history.replaceState(null, "", newUrl);
    } else {
      window.history.pushState(null, "", newUrl);
    }
  };

  const updateQuery = (
    nextValue,
    { replace = false, immediate = false } = {}
  ) => {
    setQuery(nextValue);

    if (immediate) {
      setDebouncedQuery(nextValue);
    }

    commitUrl({ nextQuery: nextValue, nextView: view, replace });
  };

  const updateView = (nextView, { replace = false, queryValue } = {}) => {
    const normalizedView = normalizeView(nextView);
    setView(normalizedView);

    commitUrl({
      nextQuery: queryValue ?? query,
      nextView: normalizedView,
      replace,
    });
  };

  const ensureDefinitionView = (options = {}, queryValue) => {
    if (view !== DEFAULT_VIEW) {
      updateView(DEFAULT_VIEW, { ...options, queryValue });
    }
  };

  const handleSelectViewTab = (nextView) => {
    const normalized = normalizeView(nextView);
    if (normalized === view) return;
    updateView(normalized);
  };

  const handleSelectValue = (nextValue) => {
    if (!nextValue) return;

    updateQuery(nextValue, { immediate: true });
    ensureDefinitionView({ replace: true }, nextValue);
  };

  const handleQueryChange = (value) => {
    updateQuery(value, { replace: true });

    if (value.trim()) {
      ensureDefinitionView({ replace: true }, value);
    }
  };

  const handleQuerySubmit = (value) => {
    const trimmed = (value ?? "").trim();
    updateQuery(trimmed, { immediate: true });

    if (trimmed) {
      ensureDefinitionView({}, trimmed);
    }
  };

  const handleSelectKeywordScript = (mode) => {
    setKeywordScript(mode === "traditional" ? "traditional" : "simplified");
  };

  const trimmedQuery = (query ?? "").trim();
  const isKeywordView = view === VIEW_KEYWORDS;
  const isDefinitionView = !isKeywordView;

  return (
    <div className="p-3 flex flex-col max-w-lg">
      <div className="font-black flex items-center gap-1">
        <img src={logoUrl} width={"20"} />
        <span>Chinese Composition</span>
      </div>

      <ViewTabs
        view={view}
        onSelect={handleSelectViewTab}
        keywordScript={keywordScript}
        onSelectKeywordScript={handleSelectKeywordScript}
      />

      <SearchBar
        query={query ?? ""}
        onQueryChange={handleQueryChange}
        onQuerySubmit={handleQuerySubmit}
        bookOrderNav={bookOrderNav}
        onSelectValue={handleSelectValue}
        keywordScript={keywordScript}
      />

      <KeywordList
        keywords={allKeywords}
        loading={loadingKeywords}
        onSelect={handleSelectValue}
        activeValue={trimmedQuery || null}
        isVisible={isKeywordView}
        script={keywordScript}
      />

      <DefinitionView
        isVisible={isDefinitionView}
        decompositions={decompositions}
        query={query}
        results={results}
        onSelectValue={handleSelectValue}
      />

      <HistoryList
        history={history}
        onSelect={handleSelectValue}
        isVisible={isDefinitionView}
      />

      <Attribution />
    </div>
  );
}

function fetchHanziRows(db, column, value) {
  if (!db || !value) return [];
  if (column !== "traditional" && column !== "simplified") {
    throw new Error(`Unsupported column: ${column}`);
  }

  const rows = [];
  const stmt = db.prepare(`SELECT * FROM hanzi WHERE ${column} = ?`);

  try {
    stmt.bind([value]);
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
  } finally {
    stmt.free();
  }

  return rows;
}

function fetchKeywordRowsByKeyword(db, keywordValue) {
  if (!db || !keywordValue) return [];

  const rows = [];
  const stmt = db.prepare(
    `SELECT simplified, keyword, book_order, traditional
     FROM hanzi_keywords
     WHERE keyword LIKE ?
     ORDER BY (keyword = ?) DESC, (book_order IS NULL), book_order ASC`
  );

  try {
    stmt.bind([`%${keywordValue}%`, keywordValue]);
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
  } finally {
    stmt.free();
  }

  return rows;
}

function fetchKeywordRowsByAdditionalForm(db, formValue) {
  if (!db || !formValue) return [];

  const rows = [];
  const stmt = db.prepare(
    `SELECT id, simplified, traditional, keyword, book_order, additional_forms
     FROM hanzi_keywords
     WHERE additional_forms IS NOT NULL
       AND additional_forms LIKE ?`
  );

  try {
    stmt.bind([`%"${formValue}"%`]);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      const parsedAdditionalForms = safeParseArray(row.additional_forms);
      if (parsedAdditionalForms.includes(formValue)) {
        rows.push({
          id: row.id,
          simplified: row.simplified,
          traditional: row.traditional,
          keyword: row.keyword,
          book_order: row.book_order,
          additional_forms: row.additional_forms,
        });
      }
    }
  } finally {
    stmt.free();
  }

  return rows;
}

function fetchKeywordRowsByExactForm(db, value) {
  if (!db || !value) return [];

  const rows = [];
  const stmt = db.prepare(
    `SELECT id, simplified, traditional, keyword, book_order
     FROM hanzi_keywords
     WHERE simplified = ? OR traditional = ?`
  );

  try {
    stmt.bind([value, value]);
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
  } finally {
    stmt.free();
  }

  return rows;
}

function fetchHanziRowsByPartialMatch(db, column, value, limit = 10) {
  if (!db || !value) return [];
  if (column !== "pinyin" && column !== "english") {
    throw new Error(`Unsupported partial match column: ${column}`);
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) return [];

  const rows = [];
  let stmt;

  try {
    if (column === "english") {
      const normalizedSearch = trimmedValue.replace(/\s+/g, " ");
      const lowerSearch = normalizedSearch.toLowerCase();
      const substringPattern = `%${lowerSearch}%`;
      const wordBoundaryNeedle = ` ${lowerSearch} `;
      const normalizedEnglishExpression =
        "LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(' ' || REPLACE(english, '/', ' ') || ' ', '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '))";

      stmt = db.prepare(
        `SELECT * FROM hanzi
         WHERE LOWER(english) LIKE ?
         ORDER BY
           CASE
             WHEN LOWER(english) = ? THEN 0
             WHEN instr(${normalizedEnglishExpression}, ?) > 0 THEN 1
             ELSE 2
           END,
           LENGTH(english) ASC
         LIMIT ?`
      );

      stmt.bind([substringPattern, lowerSearch, wordBoundaryNeedle, limit]);
    } else {
      stmt = db.prepare(
        `SELECT * FROM hanzi
         WHERE ${column} LIKE ?
         LIMIT ?`
      );
      stmt.bind([`%${trimmedValue}%`, limit]);
    }

    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
  } finally {
    if (stmt) stmt.free();
  }

  return rows;
}

function fetchComponentRowsForValue(db, lookupValue) {
  if (!lookupValue) return [];

  return uniqueById(
    [
      ...fetchKeywordRowsByExactForm(db, lookupValue),
      ...fetchKeywordRowsByAdditionalForm(db, lookupValue),
    ],
    "id"
  );
}

function resolveQueryMatches(db, trimmedValue) {
  const directRows = uniqueById(
    [
      ...fetchHanziRows(db, "traditional", trimmedValue),
      ...fetchHanziRows(db, "simplified", trimmedValue),
    ],
    "id"
  );
  if (directRows.length) {
    return { matchedRows: directRows, resolvedQueryValue: trimmedValue };
  }

  const exactResult = resolveFromKeywordRows(
    db,
    fetchKeywordRowsByExactForm(db, trimmedValue),
    trimmedValue,
    { preferExact: true }
  );
  if (exactResult) return exactResult;

  const additionalResult = resolveFromKeywordRows(
    db,
    fetchKeywordRowsByAdditionalForm(db, trimmedValue),
    trimmedValue
  );
  if (additionalResult) return additionalResult;

  const keywordMatches = fetchKeywordRowsByKeyword(db, trimmedValue);
  if (keywordMatches.length) {
    const simplifiedCandidates = keywordMatches
      .map((row) => row.simplified)
      .filter(Boolean);

    const keywordMatchedRows = uniqueById(
      simplifiedCandidates.flatMap((candidate) =>
        fetchHanziRows(db, "simplified", candidate)
      ),
      "id"
    );

    if (keywordMatchedRows.length) {
      return {
        matchedRows: keywordMatchedRows,
        resolvedQueryValue:
          simplifiedCandidates.find((candidate) => candidate) ?? trimmedValue,
      };
    }
  }

  const pinyinMatches = uniqueById(
    fetchHanziRowsByPartialMatch(db, "pinyin", trimmedValue, 10),
    "id"
  );
  if (pinyinMatches.length) {
    return {
      matchedRows: pinyinMatches,
      resolvedQueryValue: pinyinMatches[0]?.simplified ?? trimmedValue,
    };
  }

  const englishMatches = uniqueById(
    fetchHanziRowsByPartialMatch(db, "english", trimmedValue, 10),
    "id"
  );
  if (englishMatches.length) {
    return {
      matchedRows: englishMatches,
      resolvedQueryValue: englishMatches[0]?.simplified ?? trimmedValue,
    };
  }

  return { matchedRows: [], resolvedQueryValue: trimmedValue };
}

function resolveFromKeywordRows(
  db,
  rows,
  lookupValue,
  { preferExact = false } = {}
) {
  if (!rows.length) return null;

  const candidateValues = [];
  const pushCandidate = (candidate) => {
    if (!candidate) return;
    if (!candidateValues.includes(candidate)) {
      candidateValues.push(candidate);
    }
  };

  rows.forEach(({ simplified, traditional }) => {
    pushCandidate(simplified);
    pushCandidate(traditional);
  });
  pushCandidate(lookupValue);

  const matchedRows = uniqueById(
    candidateValues.flatMap((candidate) => [
      ...fetchHanziRows(db, "simplified", candidate),
      ...fetchHanziRows(db, "traditional", candidate),
    ]),
    "id"
  );

  if (!matchedRows.length) return null;

  const resolvedQueryValue = preferExact
    ? candidateValues.find((candidate) => candidate === lookupValue) ??
      candidateValues[0] ??
      lookupValue
    : candidateValues[0] ?? lookupValue;

  return { matchedRows, resolvedQueryValue };
}

function withDecompositionStatements(db, callback) {
  const statements = prepareDecompositionStatements(db);
  try {
    return callback(statements);
  } finally {
    statements.freeAll();
  }
}

function prepareDecompositionStatements(database) {
  const decompositionStmt = database.prepare(
    "SELECT left_component, right_component FROM hanzi_decomposition WHERE component = ?"
  );
  const keywordStmt = database.prepare(
    "SELECT keyword, book_order FROM hanzi_keywords WHERE simplified = ?"
  );
  const previousBookOrderStmt = database.prepare(
    `SELECT simplified, book_order, traditional
       FROM hanzi_keywords
       WHERE book_order < ?
       ORDER BY book_order DESC
       LIMIT 1`
  );
  const nextBookOrderStmt = database.prepare(
    `SELECT simplified, book_order, traditional
       FROM hanzi_keywords
       WHERE book_order > ?
       ORDER BY book_order ASC
       LIMIT 1`
  );

  const freeAll = () => {
    decompositionStmt.free();
    keywordStmt.free();
    previousBookOrderStmt.free();
    nextBookOrderStmt.free();
  };

  return {
    decompositionStmt,
    keywordStmt,
    previousBookOrderStmt,
    nextBookOrderStmt,
    freeAll,
  };
}

function buildDecompositionResult({
  matchedRows,
  resolvedQueryValue,
  statements,
  fetchComponentRows,
}) {
  const lookupDecomposition = (value) => {
    if (!value) return { left: null, right: null };

    const stmt = statements.decompositionStmt;
    stmt.bind([value]);
    if (!stmt.step()) {
      stmt.reset();
      return { left: null, right: null };
    }

    const { left_component, right_component } = stmt.getAsObject();
    stmt.reset();
    return {
      left: left_component || null,
      right: right_component || null,
    };
  };

  const lookupKeywordBySimplified = (value) => {
    if (!value) return null;

    const stmt = statements.keywordStmt;
    stmt.bind([value]);
    if (!stmt.step()) {
      stmt.reset();
      return null;
    }

    const { keyword, book_order } = stmt.getAsObject();
    stmt.reset();
    return {
      keyword: keyword || null,
      bookOrder: normalizeBookOrderValue(book_order),
    };
  };

  const resolveKeywordData = (value, candidateRows = []) => {
    const normalized =
      typeof value === "string"
        ? value.replace(/\*/g, "").trim()
        : value ?? null;
    if (!normalized) return null;

    const rows = ensureKeywordRows(
      Array.isArray(candidateRows) ? candidateRows : [candidateRows],
      normalized,
      fetchComponentRows
    );

    const keywordRow = rows.find((row) => {
      const keyword =
        typeof row?.keyword === "string" ? row.keyword.trim() : "";
      return keyword.length > 0;
    });

    if (keywordRow) {
      const rawOrder =
        keywordRow.bookOrder ?? keywordRow.book_order ?? keywordRow.bookorder;
      return {
        keyword: keywordRow.keyword.trim(),
        bookOrder: normalizeBookOrderValue(rawOrder),
      };
    }

    const fallbackSimplified =
      rows.find((row) => row?.simplified)?.simplified ??
      rows[0]?.simplified ??
      normalized;

    return lookupKeywordBySimplified(fallbackSimplified);
  };

  const buildEntry = (targetValue, rows = []) => {
    if (!targetValue) {
      return {
        entry: createEmptyDecompositionEntry({ value: targetValue ?? null }),
        rows: [],
      };
    }

    let { left, right } = lookupDecomposition(targetValue);

    if (left === "*") {
      left = right && right !== "*" ? right : null;
    }
    if (right === "*") {
      right = left && left !== "*" ? left : null;
    }

    const normalizedLeft = normalizeDecompositionComponent(left);
    const normalizedRight = normalizeDecompositionComponent(right);
    const baseRows = rows.length ? rows : fetchComponentRows(targetValue);

    const components = [normalizedLeft, normalizedRight]
      .filter((component) => component.value)
      .flatMap(({ value, transformed }) => {
        if (!value) return [];

        return Array.from(value)
          .filter((char) => char.trim().length > 0)
          .map((char) => {
            const keywordData = resolveKeywordData(char);
            return {
              value: char,
              keyword: keywordData?.keyword ?? null,
              bookOrder:
                typeof keywordData?.bookOrder === "number"
                  ? keywordData.bookOrder
                  : null,
              transformed,
            };
          });
      });

    const keywordData = resolveKeywordData(targetValue, baseRows);

    return {
      entry: createEmptyDecompositionEntry({
        value: targetValue,
        keyword: keywordData?.keyword ?? null,
        bookOrder: keywordData?.bookOrder ?? null,
        components,
      }),
      rows: baseRows,
    };
  };

  const getNeighbor = (stmt) => (order) => {
    if (typeof order !== "number") return null;

    stmt.bind([order]);
    if (!stmt.step()) {
      stmt.reset();
      return null;
    }

    const { simplified, book_order, traditional } = stmt.getAsObject();
    stmt.reset();
    return {
      simplified: simplified || null,
      traditional: traditional || null,
      bookOrder: normalizeBookOrderValue(book_order),
    };
  };

  const getPreviousBook = getNeighbor(statements.previousBookOrderStmt);
  const getNextBook = getNeighbor(statements.nextBookOrderStmt);

  const { entry: mainEntry } = buildEntry(resolvedQueryValue, matchedRows);
  const {
    valueKeyword: mainKeyword,
    valueBookOrder: mainBookOrder,
    components: mainComponents,
  } = mainEntry;

  const enrichedRows = matchedRows.map((row) => ({
    ...row,
    keyword: mainKeyword,
    decompositionComponents: mainComponents,
  }));

  const characters = Array.from(resolvedQueryValue).filter(
    (char) => char.trim().length > 0
  );
  const decompositionEntries =
    characters.length === 1
      ? [mainEntry]
      : characters.map((char) => buildEntry(char).entry);

  const findRowForValue = (lookupValue) =>
    matchedRows.find(
      (row) => row.simplified === lookupValue || row.traditional === lookupValue
    );

  const currentRow = findRowForValue(resolvedQueryValue);
  const currentSimplified =
    currentRow?.simplified ?? resolvedQueryValue ?? null;
  const currentTraditional = currentRow?.traditional ?? null;

  return {
    decompositions: decompositionEntries.length
      ? decompositionEntries
      : createEmptyDecompositionList(),
    bookOrderNav: {
      current:
        mainBookOrder != null
          ? {
              simplified: currentSimplified,
              traditional: currentTraditional,
              bookOrder: mainBookOrder,
            }
          : null,
      previous: getPreviousBook(mainBookOrder),
      next: getNextBook(mainBookOrder),
    },
    enrichedRows,
  };
}

function normalizeDecompositionComponent(component) {
  if (component === null || component === undefined) {
    return { value: null, transformed: false };
  }

  if (typeof component !== "string") {
    return { value: component ?? null, transformed: false };
  }

  if (component === "*") {
    return { value: null, transformed: false };
  }

  const trimmedComponent = component.trim();
  if (!trimmedComponent) {
    return { value: null, transformed: false };
  }

  if (trimmedComponent.includes("*")) {
    const cleaned = trimmedComponent.replace(/\*/g, "").trim();
    return { value: cleaned || null, transformed: true };
  }

  return { value: trimmedComponent, transformed: false };
}

function ensureKeywordRows(rows, value, fetchComponentRows) {
  const normalizedRows = rows.filter(Boolean);
  const hasKeyword = normalizedRows.some((row) => {
    const keyword = typeof row?.keyword === "string" ? row.keyword.trim() : "";
    return keyword.length > 0;
  });

  if (hasKeyword) return normalizedRows;

  const supplementalRows = fetchComponentRows(value);
  return supplementalRows.length
    ? [...normalizedRows, ...supplementalRows]
    : normalizedRows;
}

function normalizeBookOrderValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeParseArray(jsonValue) {
  if (typeof jsonValue !== "string" || !jsonValue.trim()) return [];
  try {
    const parsed = JSON.parse(jsonValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
