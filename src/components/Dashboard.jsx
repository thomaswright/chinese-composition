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

export default function Dashboard({ db }) {
  const [query, setQuery] = useState(() => getQueryFromUrl()); // input value
  const [debouncedQuery, setDebouncedQuery] = useState(() => getQueryFromUrl());
  const [results, setResults] = useState([]); // query results
  const [decompositions, setDecompositions] = useState(
    createEmptyDecompositionList
  );
  const [bookOrderNav, setBookOrderNav] = useState(createEmptyBookOrderNav);
  const [view, setView] = useState(() => getViewFromUrl());
  const [keywordScript, setKeywordScript] = useState("simplified");
  const [allKeywords, setAllKeywords] = useState([]);
  const [loadingKeywords, setLoadingKeywords] = useState(false);
  const [history, setHistory] = useState([]);

  const fetchHanziRows = (column, value) => {
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
  };

  const fetchKeywordRowsByKeyword = (keywordValue) => {
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
  };

  const fetchKeywordRowsByAdditionalForm = (formValue) => {
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
        const rawAdditionalForms = row.additional_forms;

        if (!rawAdditionalForms) continue;

        let parsedAdditionalForms = [];
        try {
          parsedAdditionalForms = JSON.parse(rawAdditionalForms);
        } catch {
          parsedAdditionalForms = [];
        }

        if (Array.isArray(parsedAdditionalForms)) {
          const hasMatch = parsedAdditionalForms.some(
            (entry) => entry === formValue
          );
          if (hasMatch) {
            rows.push({
              id: row.id,
              simplified: row.simplified,
              traditional: row.traditional,
              keyword: row.keyword,
              book_order: row.book_order,
              additional_forms: rawAdditionalForms,
            });
          }
        }
      }
    } finally {
      stmt.free();
    }

    return rows;
  };

  const fetchKeywordRowsByExactForm = (value) => {
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
  };

  const fetchHanziRowsByPartialMatch = (column, value, limit = 10) => {
    if (!db || !value) return [];

    if (column !== "pinyin" && column !== "english") {
      throw new Error(`Unsupported partial match column: ${column}`);
    }

    const trimmedValue = value.trim();
    if (!trimmedValue) return [];

    const rows = [];
    const isEnglishSearch = column === "english";
    let stmt;

    try {
      if (isEnglishSearch) {
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
      if (stmt) {
        stmt.free();
      }
    }

    return rows;
  };

  const resetQueryState = () => {
    setResults([]);
    setDecompositions(createEmptyDecompositionList());
    setBookOrderNav(createEmptyBookOrderNav());
  };

  const resolveMatchedRows = (trimmedValue) => {
    let resolvedQueryValue = trimmedValue;

    const traditionRows = fetchHanziRows("traditional", trimmedValue);
    const simplifiedRows = fetchHanziRows("simplified", trimmedValue);
    let matchedRows = uniqueById([...traditionRows, ...simplifiedRows], "id");

    if (!matchedRows.length) {
      const exactFormMatches = fetchKeywordRowsByExactForm(trimmedValue);

      if (exactFormMatches.length) {
        const candidateValueSet = new Set();
        exactFormMatches.forEach(({ simplified, traditional }) => {
          if (simplified) candidateValueSet.add(simplified);
          if (traditional) candidateValueSet.add(traditional);
        });

        if (!candidateValueSet.has(trimmedValue)) {
          candidateValueSet.add(trimmedValue);
        }

        const candidateValues = Array.from(candidateValueSet);
        const exactFormRows = uniqueById(
          candidateValues.flatMap((candidate) => [
            ...fetchHanziRows("simplified", candidate),
            ...fetchHanziRows("traditional", candidate),
          ]),
          "id"
        );

        if (exactFormRows.length) {
          matchedRows = exactFormRows;
          const canonicalMatch =
            candidateValues.find((candidate) => candidate === trimmedValue) ??
            candidateValues[0] ??
            trimmedValue;
          resolvedQueryValue = canonicalMatch;
        }
      }
    }

    if (!matchedRows.length) {
      const additionalFormMatches =
        fetchKeywordRowsByAdditionalForm(trimmedValue);

      if (additionalFormMatches.length) {
        const candidateValueSet = new Set();
        additionalFormMatches.forEach(({ simplified, traditional }) => {
          if (simplified) candidateValueSet.add(simplified);
          if (traditional) candidateValueSet.add(traditional);
        });

        if (!candidateValueSet.has(trimmedValue)) {
          candidateValueSet.add(trimmedValue);
        }

        const candidateValues = Array.from(candidateValueSet);
        const additionalFormRows = uniqueById(
          candidateValues.flatMap((candidate) => [
            ...fetchHanziRows("simplified", candidate),
            ...fetchHanziRows("traditional", candidate),
          ]),
          "id"
        );

        if (additionalFormRows.length) {
          matchedRows = additionalFormRows;
          const canonicalMatch = candidateValues[0] ?? trimmedValue;
          resolvedQueryValue = canonicalMatch;
        }
      }
    }

    if (!matchedRows.length) {
      const keywordMatches = fetchKeywordRowsByKeyword(trimmedValue);
      const simplifiedCandidates = keywordMatches
        .map((row) => row.simplified)
        .filter(Boolean);
      const keywordMatchedRows = uniqueById(
        simplifiedCandidates.flatMap((candidate) =>
          fetchHanziRows("simplified", candidate)
        ),
        "id"
      );

      if (keywordMatchedRows.length) {
        matchedRows = keywordMatchedRows;
        resolvedQueryValue =
          simplifiedCandidates.find((candidate) => candidate) ?? trimmedValue;
      }
    }

    if (!matchedRows.length) {
      const pinyinMatches = uniqueById(
        fetchHanziRowsByPartialMatch("pinyin", trimmedValue, 10),
        "id"
      );

      if (pinyinMatches.length) {
        matchedRows = pinyinMatches;
        resolvedQueryValue = pinyinMatches[0]?.simplified ?? trimmedValue;
      }
    }

    if (!matchedRows.length) {
      const englishMatches = uniqueById(
        fetchHanziRowsByPartialMatch("english", trimmedValue, 10),
        "id"
      );

      if (englishMatches.length) {
        matchedRows = englishMatches;
        resolvedQueryValue = englishMatches[0]?.simplified ?? trimmedValue;
      }
    }

    return { matchedRows, resolvedQueryValue };
  };

  const prepareDecompositionStatements = (database) => {
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
  };

  const fetchComponentRowsForValue = (lookupValue) => {
    if (!lookupValue) return [];

    const keywordRows = [
      ...fetchKeywordRowsByExactForm(lookupValue),
      ...fetchKeywordRowsByAdditionalForm(lookupValue),
    ];

    return uniqueById(keywordRows, "id");
  };

  const normalizeDecompositionComponent = (component) => {
    if (component === null || component === undefined) {
      return { value: null, transformed: false };
    }

    if (typeof component !== "string") {
      return { value: component ?? null, transformed: false };
    }

    const trimmedComponent = component.trim();

    if (component === "*") {
      return { value: null, transformed: false };
    }

    if (component.includes("*")) {
      const trimmedValue = component.replace(/\*/g, "").trim();

      return {
        value: trimmedValue || null,
        transformed: true,
      };
    }

    if (trimmedComponent.length === 0) {
      return { value: null, transformed: false };
    }

    return { value: trimmedComponent, transformed: false };
  };

  const createLookupDecomposition = (stmt) => (lookupValue) => {
    if (!lookupValue) return { left: null, right: null };

    stmt.bind([lookupValue]);

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

  const createLookupKeywordBySimplified = (stmt) => (lookupValue) => {
    if (!lookupValue) return null;

    stmt.bind([lookupValue]);

    if (!stmt.step()) {
      stmt.reset();
      return null;
    }

    const { keyword, book_order } = stmt.getAsObject();
    stmt.reset();

    return {
      keyword: keyword || null,
      bookOrder: typeof book_order === "number" ? book_order : null,
    };
  };

  const createResolveKeywordDataForValue = ({
    lookupKeywordBySimplified,
    fetchComponentRows,
  }) => {
    const normalizeBookOrderValue = (value) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }

      if (value === null || value === undefined) {
        return null;
      }

      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    return (lookupValue, candidateRows) => {
      const normalizedLookup =
        typeof lookupValue === "string"
          ? lookupValue.replace(/\*/g, "").trim()
          : lookupValue ?? null;
      const valueToUse =
        typeof normalizedLookup === "string" && normalizedLookup.length === 0
          ? null
          : normalizedLookup;

      if (!valueToUse) return null;

      let rowsToUse;
      if (candidateRows !== undefined) {
        rowsToUse = Array.isArray(candidateRows)
          ? [...candidateRows]
          : [candidateRows];
      } else {
        rowsToUse = fetchComponentRows(valueToUse);
      }

      const rowsContainKeyword = rowsToUse.some((row) => {
        if (!row) return false;

        const candidateKeyword =
          typeof row.keyword === "string" ? row.keyword.trim() : "";

        return candidateKeyword.length > 0;
      });

      if (!rowsContainKeyword) {
        const supplementalRows = fetchComponentRows(valueToUse);
        if (supplementalRows.length) {
          rowsToUse = [...rowsToUse, ...supplementalRows];
        }
      }

      const keywordRow = rowsToUse.find((row) => {
        if (!row) return false;

        const candidateKeyword =
          typeof row.keyword === "string" ? row.keyword.trim() : "";

        return candidateKeyword.length > 0;
      });

      if (keywordRow) {
        const rawBookOrder =
          keywordRow.bookOrder ?? keywordRow.book_order ?? null;

        return {
          keyword: keywordRow.keyword.trim(),
          bookOrder: normalizeBookOrderValue(rawBookOrder),
        };
      }

      const simplifiedCandidate =
        rowsToUse.find((row) => row.simplified)?.simplified ??
        rowsToUse[0]?.simplified ??
        null;

      const simplifiedValue = simplifiedCandidate ?? valueToUse;

      return lookupKeywordBySimplified(simplifiedValue);
    };
  };

  const createDecompositionEntryBuilder = ({
    lookupDecomposition,
    fetchComponentRows,
    resolveKeywordDataForValue,
  }) => {
    const collectComponentEntries = (componentValue, transformed) => {
      if (!componentValue || typeof componentValue !== "string") {
        return [];
      }

      const characters = Array.from(componentValue).filter(
        (char) => char.trim().length > 0
      );

      return characters.map((char) => {
        const charKeywordData = resolveKeywordDataForValue(char);

        return {
          value: char,
          keyword: charKeywordData?.keyword ?? null,
          bookOrder:
            typeof charKeywordData?.bookOrder === "number"
              ? charKeywordData.bookOrder
              : null,
          transformed,
        };
      });
    };

    return (targetValue, { rows = [] } = {}) => {
      if (!targetValue) {
        return {
          entry: createEmptyDecompositionEntry({
            value: targetValue ?? null,
          }),
          rows: [],
        };
      }

      const { left: entryLeft, right: entryRight } =
        lookupDecomposition(targetValue);

      let resolvedLeft = entryLeft;
      let resolvedRight = entryRight;

      if (resolvedLeft === "*") {
        resolvedLeft =
          resolvedRight && resolvedRight !== "*" ? resolvedRight : null;
      }

      if (resolvedRight === "*") {
        resolvedRight =
          resolvedLeft && resolvedLeft !== "*" ? resolvedLeft : null;
      }

      const normalizedLeft = normalizeDecompositionComponent(resolvedLeft);
      const normalizedRight = normalizeDecompositionComponent(resolvedRight);

      const baseRows = rows.length > 0 ? rows : fetchComponentRows(targetValue);
      const componentSources = [normalizedLeft, normalizedRight].filter(
        (component) => component.value
      );

      const components = componentSources.flatMap(({ value, transformed }) =>
        collectComponentEntries(value, transformed)
      );

      const keywordData = resolveKeywordDataForValue(targetValue, baseRows);

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
  };

  const createNeighborGetter = (stmt) => (order) => {
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
      bookOrder: typeof book_order === "number" ? book_order : null,
    };
  };

  const createDecompositionHelpers = ({
    decompositionStmt,
    keywordStmt,
    previousBookOrderStmt,
    nextBookOrderStmt,
  }) => {
    const lookupDecomposition = createLookupDecomposition(decompositionStmt);
    const lookupKeywordBySimplified =
      createLookupKeywordBySimplified(keywordStmt);
    const fetchComponentRows = fetchComponentRowsForValue;
    const resolveKeywordDataForValue = createResolveKeywordDataForValue({
      lookupKeywordBySimplified,
      fetchComponentRows,
    });

    return {
      buildDecompositionEntry: createDecompositionEntryBuilder({
        lookupDecomposition,
        fetchComponentRows,
        resolveKeywordDataForValue,
      }),
      getPreviousBook: createNeighborGetter(previousBookOrderStmt),
      getNextBook: createNeighborGetter(nextBookOrderStmt),
    };
  };

  const buildDecompositionResult = ({
    matchedRows,
    resolvedQueryValue,
    statements,
  }) => {
    const { buildDecompositionEntry, getPreviousBook, getNextBook } =
      createDecompositionHelpers(statements);

    const { entry: mainEntry } = buildDecompositionEntry(resolvedQueryValue, {
      rows: matchedRows,
    });
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
        : characters.map((char) => buildDecompositionEntry(char).entry);

    const findRowForValue = (lookupValue) =>
      matchedRows.find(
        (row) =>
          row.simplified === lookupValue || row.traditional === lookupValue
      );

    const currentRow = findRowForValue(resolvedQueryValue);
    const currentSimplified =
      currentRow?.simplified ?? resolvedQueryValue ?? null;
    const currentTraditional = currentRow?.traditional ?? null;

    const previousBook = getPreviousBook(mainBookOrder);
    const nextBook = getNextBook(mainBookOrder);

    const decompositions = decompositionEntries.length
      ? decompositionEntries
      : createEmptyDecompositionList();

    return {
      decompositions,
      bookOrderNav: {
        current:
          mainBookOrder != null
            ? {
                simplified: currentSimplified,
                traditional: currentTraditional,
                bookOrder: mainBookOrder,
              }
            : null,
        previous: previousBook,
        next: nextBook,
      },
      enrichedRows,
    };
  };

  const runQuery = (value) => {
    if (!db) return;

    const trimmedValue = (value ?? "").trim();

    try {
      if (!trimmedValue) {
        resetQueryState();
        return;
      }

      const { matchedRows, resolvedQueryValue } =
        resolveMatchedRows(trimmedValue);

      if (!matchedRows.length) {
        resetQueryState();
        return;
      }

      setHistory((prevHistory) => pushHistory(prevHistory, trimmedValue));

      const statements = prepareDecompositionStatements(db);

      try {
        const { decompositions, bookOrderNav, enrichedRows } =
          buildDecompositionResult({
            matchedRows,
            resolvedQueryValue,
            statements,
          });

        setDecompositions(decompositions);
        setBookOrderNav(bookOrderNav);
        setResults(enrichedRows);
      } finally {
        statements.freeAll();
      }
    } catch (err) {
      setError(err.toString());
      setBookOrderNav(createEmptyBookOrderNav());
    }
  };

  const loadAllKeywords = () => {
    if (!db) return;

    setLoadingKeywords(true);

    let stmt;
    const rows = [];

    try {
      stmt = db.prepare(
        `SELECT simplified,  keyword, book_order, traditional
        FROM hanzi_keywords
        ORDER BY (book_order IS NULL), book_order ASC`
      );

      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }

      setAllKeywords(rows);
    } catch (err) {
      setError(err.toString());
    } finally {
      if (stmt) stmt.free();
      setLoadingKeywords(false);
    }
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(query);
    }, QUERY_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    runQuery(debouncedQuery);
  }, [db, debouncedQuery]);

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

    loadAllKeywords();
  }, [db, allKeywords.length]);

  const updateQuery = (
    nextValue,
    { replace = false, immediate = false } = {}
  ) => {
    setQuery(nextValue);

    if (immediate) {
      setDebouncedQuery(nextValue);
    }

    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);

    if (nextValue) {
      params.set(QUERY_PARAM, nextValue);
    } else {
      params.delete(QUERY_PARAM);
    }

    applyViewParam(params, view);

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

  const updateView = (nextView, { replace = false, queryValue } = {}) => {
    const normalizedView = normalizeView(nextView);
    setView(normalizedView);

    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);

    const effectiveQuery = queryValue ?? query;

    if (effectiveQuery) {
      params.set(QUERY_PARAM, effectiveQuery);
    } else {
      params.delete(QUERY_PARAM);
    }

    applyViewParam(params, normalizedView);

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

  const handleSelectViewTab = (nextView) => {
    const normalized = normalizeView(nextView);
    if (normalized === view) return;
    updateView(normalized);
  };

  const ensureDefinitionView = (options = {}, queryValue) => {
    if (view !== DEFAULT_VIEW) {
      updateView(DEFAULT_VIEW, { ...options, queryValue });
    }
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
    if (mode === "traditional") {
      setKeywordScript("traditional");
    } else {
      setKeywordScript("simplified");
    }
  };

  const trimmedQuery = (query ?? "").trim();
  const isKeywordView = view === VIEW_KEYWORDS;
  const isDefinitionView = !isKeywordView;

  return (
    <div className="p-3 flex flex-col max-w-lg">
      <div className="font-black flex items-center gap-1">
        <img src={logoUrl} width={"20"} className="" />

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

