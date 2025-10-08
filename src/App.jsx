import { Fragment, useEffect, useRef, useState } from "react";
import initSqlJs from "sql.js";
import wasm from "sql.js/dist/sql-wasm.wasm?url";

function uniqueById(arr, key) {
  return [...new Map(arr.map((obj) => [obj[key], obj])).values()];
}

const QUERY_PARAM = "value";
const VIEW_PARAM = "view";
const VIEW_KEYWORDS = "keywords";
const DEFAULT_VIEW = "definition";
const QUERY_DEBOUNCE_MS = 250;

function normalizeView(value) {
  return value === VIEW_KEYWORDS ? VIEW_KEYWORDS : DEFAULT_VIEW;
}

function getQueryFromUrl() {
  if (typeof window === "undefined") return "";

  const params = new URLSearchParams(window.location.search);
  return params.get(QUERY_PARAM) || "";
}

function getViewFromUrl() {
  if (typeof window === "undefined") return DEFAULT_VIEW;

  const params = new URLSearchParams(window.location.search);
  return normalizeView(params.get(VIEW_PARAM));
}

function applyViewParam(params, viewValue) {
  if (normalizeView(viewValue) === VIEW_KEYWORDS) {
    params.set(VIEW_PARAM, VIEW_KEYWORDS);
  } else {
    params.delete(VIEW_PARAM);
  }
}

function createEmptyDecompositionList() {
  return [];
}

function createEmptyDecompositionEntry({
  value,
  keyword = null,
  bookOrder = null,
  components = [],
}) {
  return {
    value,
    valueKeyword: keyword,
    valueBookOrder: bookOrder,
    components,
  };
}

function createEmptyBookOrderNav() {
  return {
    current: null,
    previous: null,
    next: null,
  };
}

function pushHistory(prevHistory, value) {
  const trimmedValue = (value ?? "").trim();
  if (!trimmedValue) return prevHistory;

  const nextHistory = prevHistory.filter((item) => item !== trimmedValue);
  nextHistory.push(trimmedValue);
  return nextHistory.slice(-10);
}

function useContainerMetrics({
  containerRef,
  isActive,
  itemSelector = "button",
  defaultItemHeight = 48,
  dependencies = [],
}) {
  const [containerHeight, setContainerHeight] = useState(0);
  const [itemHeight, setItemHeight] = useState(defaultItemHeight);

  useEffect(() => {
    if (!isActive) return;

    const element = containerRef.current;
    if (!element) return;

    const measure = () => {
      setContainerHeight(element.clientHeight);

      if (!itemSelector) return;

      const sample = element.querySelector(itemSelector);
      if (!sample) return;

      const { height } = sample.getBoundingClientRect();
      if (height) {
        setItemHeight(height);
      }
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [
    containerRef,
    isActive,
    itemSelector,
    defaultItemHeight,
    ...dependencies,
  ]);

  return { containerHeight, itemHeight };
}

function useScrollPosition(isActive) {
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setScrollTop(0);
    }
  }, [isActive]);

  const handleScroll = (event) => {
    setScrollTop(event.currentTarget.scrollTop);
  };

  return { scrollTop, setScrollTop, handleScroll };
}

function useScrollToIndex({
  containerRef,
  isActive,
  index,
  itemHeight,
  containerHeight,
  setScrollTop,
}) {
  useEffect(() => {
    if (!isActive) return;

    const element = containerRef.current;
    if (!element) return;

    if (index < 0 || itemHeight <= 0 || containerHeight <= 0) {
      return;
    }

    const targetScroll = Math.max(
      0,
      index * itemHeight - containerHeight / 2 + itemHeight / 2
    );

    if (Math.abs(element.scrollTop - targetScroll) > 1) {
      element.scrollTop = targetScroll;
      setScrollTop(targetScroll);
    }
  }, [
    containerRef,
    isActive,
    index,
    itemHeight,
    containerHeight,
    setScrollTop,
  ]);
}

function useVirtualList({
  itemCount,
  itemHeight,
  containerHeight,
  scrollTop,
  overscan = 8,
}) {
  const safeHeight = itemHeight > 0 ? itemHeight : 1;
  const totalHeight = itemCount * safeHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / safeHeight) - overscan);
  const endIndex = Math.min(
    itemCount,
    Math.ceil((scrollTop + containerHeight) / safeHeight) + overscan
  );
  const offsetY = startIndex * safeHeight;

  return { totalHeight, startIndex, endIndex, offsetY };
}

function LucideChevronLeft({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function LucideChevronRight({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function BookOrderNavigator({ navigation, onSelect, script }) {
  const current = navigation?.current;

  const resolvedScript =
    script === "traditional" ? "traditional" : "simplified";

  if (!current || current.bookOrder == null) {
    return <div className="w-32 flex-none" aria-hidden="true" />;
  }

  const getNavigationValue = (entry) => {
    if (!entry) return null;
    if (resolvedScript === "traditional" && entry.traditional) {
      return entry.traditional;
    }
    return entry.simplified ?? entry.traditional ?? null;
  };

  const handleNavigate = (entry) => {
    const value = getNavigationValue(entry);
    if (!value) return;
    onSelect(value);
  };

  const hasPrevious = Boolean(getNavigationValue(navigation?.previous));
  const hasNext = Boolean(getNavigationValue(navigation?.next));

  return (
    <div className="flex items-center justify-center gap-2 w-32 flex-none">
      <button
        type="button"
        onClick={() => handleNavigate(navigation?.previous)}
        disabled={!hasPrevious}
        className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Previous keyword"
      >
        <LucideChevronLeft className="w-4 h-4" />
      </button>
      <span className="flex-1 text-xs text-gray-600 text-center truncate">
        {current.bookOrder}
      </span>
      <button
        type="button"
        onClick={() => handleNavigate(navigation?.next)}
        disabled={!hasNext}
        className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Next keyword"
      >
        <LucideChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function KeywordList({
  keywords,
  loading,
  onSelect,
  activeValue,
  isVisible,
  script,
}) {
  const effectiveScript =
    script === "traditional" ? "traditional" : "simplified";
  const containerRef = useRef(null);
  const { scrollTop, setScrollTop, handleScroll } =
    useScrollPosition(isVisible);
  const { containerHeight, itemHeight } = useContainerMetrics({
    containerRef,
    isActive: isVisible,
    dependencies: [loading, keywords.length],
  });
  const activeIndex = keywords.findIndex((item) => {
    if (!activeValue) return false;
    return item.simplified === activeValue || item.traditional === activeValue;
  });

  useScrollToIndex({
    containerRef,
    isActive: isVisible && !loading,
    index: activeIndex,
    itemHeight,
    containerHeight,
    setScrollTop,
  });

  if (!isVisible) {
    return null;
  }

  if (loading) {
    return (
      <div className="mt-3 px-3 py-2 text-gray-600 text-sm border rounded ">
        Loading keywords…
      </div>
    );
  }

  if (!keywords.length) {
    return (
      <div className="mt-3 px-3 py-2 text-gray-600 text-sm border rounded ">
        No keywords found.
      </div>
    );
  }

  const { totalHeight, startIndex, endIndex, offsetY } = useVirtualList({
    itemCount: keywords.length,
    itemHeight,
    containerHeight,
    scrollTop,
  });
  const itemsToRender = keywords.slice(startIndex, endIndex);

  return (
    <div className="mt-3 border rounded border-gray-400 overflow-hidden">
      <div
        ref={containerRef}
        className="max-h-80 overflow-y-auto"
        onScroll={handleScroll}
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          <div
            className="absolute inset-x-0"
            style={{ transform: `translateY(${offsetY}px)` }}
          >
            <div className="divide-y divide-gray-300">
              {itemsToRender.map((item, index) => {
                const actualIndex = startIndex + index;
                const displayCharacter =
                  effectiveScript === "traditional"
                    ? item.traditional || item.simplified
                    : item.simplified || item.traditional;
                const buttonValue = displayCharacter || item.simplified || "";
                const isCurrent =
                  activeValue &&
                  (buttonValue === activeValue ||
                    item.simplified === activeValue ||
                    item.traditional === activeValue);

                return (
                  <button
                    key={`${item.simplified ?? item.traditional ?? ""}-${
                      item.book_order ?? ""
                    }-${actualIndex}-${effectiveScript}`}
                    type="button"
                    onClick={() => {
                      if (buttonValue) {
                        onSelect(buttonValue);
                      }
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50 ${
                      isCurrent ? "bg-blue-50" : ""
                    }`}
                    aria-current={isCurrent ? "true" : undefined}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{displayCharacter}</span>
                      {item.keyword && (
                        <span className="text-sm text-gray-600">
                          {item.keyword}
                        </span>
                      )}
                    </div>
                    {typeof item.book_order === "number" && (
                      <span className="text-xs text-gray-500">
                        #{item.book_order}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewTabs({ view, onSelect, keywordScript, onSelectKeywordScript }) {
  const resolvedKeywordScript =
    keywordScript === "traditional" ? "traditional" : "simplified";
  const tabButtonClass = (tab) =>
    `px-3 py-1 text-sm border rounded transition-colors ${
      view === tab
        ? "border-blue-500 bg-blue-50 text-blue-700"
        : "border-transparent text-gray-600 hover:border-gray-300"
    }`;

  const scriptButtonClass = (mode) =>
    `px-2 py-1 text-sm border rounded transition-colors ${
      resolvedKeywordScript === mode
        ? "border-blue-500 bg-blue-50 text-blue-700"
        : "border-transparent text-gray-600 hover:border-gray-300"
    }`;

  const handleScriptSelect = (mode) => {
    if (!onSelectKeywordScript) return;
    onSelectKeywordScript(mode);
  };

  return (
    <div className="flex items-center gap-3 py-2 justify-between ">
      <div role="tablist" aria-label="View selection" className="flex gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={view === DEFAULT_VIEW}
          className={tabButtonClass(DEFAULT_VIEW)}
          onClick={() => onSelect(DEFAULT_VIEW)}
        >
          Definition
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === VIEW_KEYWORDS}
          className={tabButtonClass(VIEW_KEYWORDS)}
          onClick={() => onSelect(VIEW_KEYWORDS)}
        >
          Keyword List
        </button>
      </div>
      {view === VIEW_KEYWORDS && onSelectKeywordScript ? (
        <div
          role="group"
          aria-label="Keyword list script"
          className="flex gap-1"
        >
          <button
            type="button"
            className={scriptButtonClass("simplified")}
            onClick={() => handleScriptSelect("simplified")}
            aria-pressed={resolvedKeywordScript === "simplified"}
          >
            简
          </button>
          <button
            type="button"
            className={scriptButtonClass("traditional")}
            onClick={() => handleScriptSelect("traditional")}
            aria-pressed={resolvedKeywordScript === "traditional"}
          >
            繁
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SearchBar({
  query,
  onQueryChange,
  onQuerySubmit,
  bookOrderNav,
  onSelectValue,
  keywordScript,
}) {
  return (
    <div className="mt-1 flex items-center gap-3 ">
      <input
        type="text"
        placeholder="Enter character…"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onQuerySubmit(event.currentTarget.value);
          }
        }}
        className="flex-1 px-3 py-1 border border-gray-400 rounded-lg text-lg"
      />
      <BookOrderNavigator
        navigation={bookOrderNav}
        onSelect={onSelectValue}
        script={keywordScript}
      />
    </div>
  );
}

function CharacterButtons({ value, onSelect, idPrefix }) {
  const resolvedValue = value ?? "";
  if (!resolvedValue) return null;

  const handleSelect = (character) => {
    if (!onSelect) return;
    onSelect(character);
  };

  return (
    <span className="inline-flex flex-wrap items-center">
      {Array.from(resolvedValue).map((character, index) => (
        <button
          key={`${idPrefix ?? "char"}-${index}-${character}`}
          type="button"
          onClick={() => handleSelect(character)}
          className="inline-flex items-center justify-center py-1 bg-transparent text-lg leading-tight rounded hover:bg-gray-100 focus-visible:outline focus-visible:outline-blue-400"
        >
          {character}
        </button>
      ))}
    </span>
  );
}

function DefinitionView({
  isVisible,
  decompositions,
  query,
  results,
  onSelectValue,
}) {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="mt-2">
      <DecompositionSection
        decompositions={decompositions}
        query={query}
        onSelectValue={onSelectValue}
      />

      <div className="divide-y  divide-gray-300 border-t border-gray-300">
        {results.map((row) => {
          const englishMeanings = row.english
            ? row.english
                .split("/")
                .map((item) => item.trim())
                .filter(Boolean)
            : [];

          return (
            <div key={row.id ?? row.simplified} className=" px-3 py-3">
              <div className="text-lg">
                <CharacterButtons
                  value={row.simplified}
                  onSelect={onSelectValue}
                  idPrefix={`${row.id ?? row.simplified}-simplified`}
                />
                {row.traditional && row.traditional !== row.simplified ? (
                  <>
                    {" ("}
                    <CharacterButtons
                      value={row.traditional}
                      onSelect={onSelectValue}
                      idPrefix={`${row.id ?? row.simplified}-traditional`}
                    />
                    {")"}
                  </>
                ) : null}
              </div>
              {row.pinyin && (
                <div className="text-sm text-gray-600">{row.pinyin}</div>
              )}
              {englishMeanings.map((meaning, index) => (
                <div
                  key={`${row.id ?? row.simplified}-meaning-${index}`}
                  className="text-sm"
                >
                  {meaning}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryList({ history, onSelect, isVisible }) {
  if (!isVisible || history.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Query history"
      className="mt-3 pt-3 px-3  border-t border-gray-300"
    >
      <div>History</div>
      <div className="flex flex-wrap items-center gap-3">
        {history
          .slice()
          .reverse()
          .map((item) => (
            <div key={item} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSelect(item)}
                className=" px-2 py-1 rounded-md transition-colors hover:bg-gray-100"
              >
                {item}
              </button>
            </div>
          ))}
      </div>
    </nav>
  );
}

function DecompositionSection({ decompositions, query, onSelectValue }) {
  if (!decompositions.length) {
    return (
      <div className="px-3 py-3 text-gray-400 flex flex-row justify-start gap-1 items-center">
        no decomposition
      </div>
    );
  }

  return (
    <div className="px-3 py-3 flex flex-col items-center gap-3 ">
      {decompositions.map((item, index) => {
        const displayValue = item.value ?? query ?? "";
        const key = `${displayValue || "entry"}-${index}`;
        const componentList = Array.isArray(item.components)
          ? item.components.filter((component) => component?.value)
          : [];
        const containsBaseComponent =
          displayValue &&
          componentList.some((component) => component.value === displayValue);
        const showDecomposition =
          componentList.length > 0 && !containsBaseComponent;

        if (!showDecomposition) {
          return (
            <div
              key={key}
              className="flex flex-row justify-start gap-2 items-center"
            >
              {displayValue ? (
                <span className="text-lg leading-tight">{displayValue}</span>
              ) : null}
              {item.valueKeyword && <span>{item.valueKeyword}</span>}
            </div>
          );
        }

        return (
          <div
            key={key}
            className="flex flex-row justify-start gap-3 items-center "
          >
            {componentList.map((component, componentIndex) => {
              const componentKey = `${key}-component-${component.value}-${componentIndex}`;

              return (
                <Fragment key={componentKey}>
                  <button
                    type="button"
                    onClick={() => onSelectValue(component.value)}
                    className="text-left flex flex-col items-center flex-none w-fit px-2 py-1 rounded-md transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-blue-500"
                  >
                    <span className="text-lg leading-tight">
                      {component.value}
                    </span>
                    {component.keyword && <span>{component.keyword}</span>}
                  </button>
                  {componentIndex < componentList.length - 1 ? (
                    <span>+</span>
                  ) : null}
                </Fragment>
              );
            })}
            <span>=</span>
            <button
              type="button"
              onClick={() => onSelectValue(displayValue)}
              className="text-left flex flex-col items-center flex-none w-fit px-2 py-1 rounded-md transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-blue-500"
            >
              <span className="text-lg leading-tight ">{displayValue}</span>
              {item.valueKeyword && <span>{item.valueKeyword}</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Dashboard({ db }) {
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

    const rows = [];
    const stmt = db.prepare(
      `SELECT * FROM hanzi WHERE ${column} LIKE ? LIMIT ?`
    );

    try {
      stmt.bind([`%${value}%`, limit]);

      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
    } finally {
      stmt.free();
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

      const rowsToUse =
        candidateRows !== undefined
          ? candidateRows
          : fetchComponentRows(valueToUse);

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
      <div className="font-black">Chinese Composition</div>
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
    </div>
  );
}

function App() {
  const [db, setDb] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    let databaseInstance = null;

    async function connectDatabase() {
      try {
        const SQL = await initSqlJs({ locateFile: () => wasm });
        const response = await fetch("/chinese.db");

        if (!response.ok) {
          throw new Error(
            `Failed to fetch database: ${response.status} ${response.statusText}`
          );
        }

        const buf = await response.arrayBuffer();
        const nextDatabase = new SQL.Database(new Uint8Array(buf));

        if (!isMounted) {
          nextDatabase.close();
          return;
        }

        databaseInstance = nextDatabase;
        setDb(nextDatabase);
        setError(null);
      } catch (err) {
        if (databaseInstance) {
          databaseInstance.close();
          databaseInstance = null;
        }

        if (isMounted) {
          setDb(null);
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    connectDatabase();

    return () => {
      isMounted = false;

      if (databaseInstance) {
        databaseInstance.close();
        databaseInstance = null;
      }
    };
  }, []);

  if (error) return <pre>{error.toString()}</pre>;
  else if (!db) return <pre>Loading...</pre>;
  else return <Dashboard db={db} />;
}

export default App;
