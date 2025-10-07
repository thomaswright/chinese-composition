import { useEffect, useRef, useState } from "react";
import initSqlJs from "sql.js";
import wasm from "sql.js/dist/sql-wasm.wasm?url";

function uniqueById(arr, key) {
  return [...new Map(arr.map((obj) => [obj[key], obj])).values()];
}

const QUERY_PARAM = "value";
const VIEW_PARAM = "view";
const VIEW_KEYWORDS = "keywords";
const DEFAULT_VIEW = "definition";

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
  left = null,
  right = null,
  leftKeyword = null,
  rightKeyword = null,
}) {
  return {
    value,
    valueKeyword: keyword,
    valueBookOrder: bookOrder,
    left,
    right,
    leftKeyword,
    rightKeyword,
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
      <div className="mt-3 px-3 py-2 text-gray-600 text-sm border rounded max-w-lg">
        Loading keywords…
      </div>
    );
  }

  if (!keywords.length) {
    return (
      <div className="mt-3 px-3 py-2 text-gray-600 text-sm border rounded max-w-lg">
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
    <div className="mt-3 border rounded max-w-lg overflow-hidden">
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
            <div className="divide-y">
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
    <div className="flex items-center gap-3 py-2 justify-between max-w-lg">
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
    <div className="mt-1 flex items-center gap-3 max-w-lg">
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

      <div className="divide-y max-w-lg divide-gray-300 border-t border-gray-300">
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
                {row.simplified}{" "}
                {row.traditional !== row.simplified
                  ? `(${row.traditional})`
                  : ""}
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
      className="mt-3 pt-3 px-3 max-w-lg border-t border-gray-300"
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
    <div className="px-3 py-3 flex flex-col items-start gap-3">
      {decompositions.map((item, index) => {
        const displayValue = item.value ?? query ?? "";
        const key = `${displayValue || "entry"}-${index}`;
        const showDecomposition =
          (item.left || item.right) && item.right !== "*";

        if (!showDecomposition) {
          return (
            <div
              key={key}
              className="text-gray-400 flex flex-row justify-start gap-2 items-center"
            >
              {displayValue ? (
                <span className="text-lg leading-tight">{displayValue}</span>
              ) : null}
              <span>no decomposition</span>
            </div>
          );
        }

        return (
          <div
            key={key}
            className="flex flex-row justify-start gap-3 items-center"
          >
            {item.left && (
              <button
                type="button"
                onClick={() => onSelectValue(item.left)}
                className="text-left flex flex-col items-center flex-none w-fit px-2 py-1 rounded-md transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                <span className="text-lg leading-tight">{item.left}</span>
                {item.leftKeyword && <span>{item.leftKeyword}</span>}
              </button>
            )}
            <span>+</span>
            {item.right && (
              <button
                type="button"
                onClick={() => onSelectValue(item.right)}
                className="text-left flex flex-col items-center flex-none w-fit px-2 py-1 rounded-md transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                <span className="text-lg leading-tight">{item.right}</span>
                {item.rightKeyword && <span>{item.rightKeyword}</span>}
              </button>
            )}
            <span>=</span>
            <button
              type="button"
              onClick={() => onSelectValue(displayValue)}
              className="text-left flex flex-col items-center flex-none w-fit px-2 py-1 rounded-md transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
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

  const runQuery = (value) => {
    if (!db) return;

    const trimmedValue = (value ?? "").trim();

    try {
      if (!trimmedValue) {
        setResults([]);
        setDecompositions(createEmptyDecompositionList());
        setBookOrderNav(createEmptyBookOrderNav());
        return;
      }

      const traditionRows = fetchHanziRows("traditional", trimmedValue);
      const simplifiedRows = fetchHanziRows("simplified", trimmedValue);

      const matchedRows = uniqueById(
        [...traditionRows, ...simplifiedRows],
        "id"
      );

      if (!matchedRows.length) {
        setResults([]);
        setDecompositions(createEmptyDecompositionList());
        setBookOrderNav(createEmptyBookOrderNav());
        return;
      }

      setHistory((prevHistory) => pushHistory(prevHistory, trimmedValue));

      const decompositionStmt = db.prepare(
        "SELECT left_component, right_component FROM hanzi_decomposition WHERE component = ?"
      );
      const keywordStmt = db.prepare(
        "SELECT keyword, book_order FROM hanzi_keywords WHERE simplified = ?"
      );
      const previousBookOrderStmt = db.prepare(
        `SELECT simplified, book_order, traditional
         FROM hanzi_keywords
         WHERE book_order < ?
         ORDER BY book_order DESC
         LIMIT 1`
      );

      const nextBookOrderStmt = db.prepare(
        `SELECT simplified, book_order, traditional
         FROM hanzi_keywords
         WHERE book_order > ?
         ORDER BY book_order ASC
         LIMIT 1`
      );

      const lookupDecomposition = (lookupValue) => {
        if (!lookupValue) return { left: null, right: null };

        decompositionStmt.bind([lookupValue]);

        if (!decompositionStmt.step()) {
          decompositionStmt.reset();
          return { left: null, right: null };
        }

        const { left_component, right_component } =
          decompositionStmt.getAsObject();
        decompositionStmt.reset();

        return {
          left: left_component || null,
          right: right_component || null,
        };
      };

      const lookupKeywordBySimplified = (lookupValue) => {
        if (!lookupValue) return null;

        keywordStmt.bind([lookupValue]);

        if (!keywordStmt.step()) {
          keywordStmt.reset();
          return null;
        }

        const { keyword, book_order } = keywordStmt.getAsObject();
        keywordStmt.reset();

        return {
          keyword: keyword || null,
          bookOrder: typeof book_order === "number" ? book_order : null,
        };
      };

      const fetchComponentRows = (lookupValue) => {
        if (!lookupValue) return [];

        return uniqueById(
          [
            ...fetchHanziRows("traditional", lookupValue),
            ...fetchHanziRows("simplified", lookupValue),
          ],
          "id"
        );
      };

      const resolveKeywordDataForValue = (lookupValue, candidateRows) => {
        if (!lookupValue) return null;

        const rowsToUse =
          candidateRows !== undefined
            ? candidateRows
            : fetchComponentRows(lookupValue);
        const simplifiedCandidate =
          rowsToUse.find((row) => row.simplified)?.simplified ??
          rowsToUse[0]?.simplified ??
          null;

        const simplifiedValue = simplifiedCandidate ?? lookupValue;

        return lookupKeywordBySimplified(simplifiedValue);
      };

      try {
        const buildDecompositionEntry = (targetValue, { rows = [] } = {}) => {
          if (!targetValue) {
            return {
              entry: createEmptyDecompositionEntry({
                value: targetValue ?? null,
              }),
              rows: [],
              leftRows: [],
              rightRows: [],
            };
          }

          const { left: entryLeft, right: entryRight } =
            lookupDecomposition(targetValue);

          const baseRows =
            rows.length > 0 ? rows : fetchComponentRows(targetValue);
          const leftRows = fetchComponentRows(entryLeft);
          const rightRows = fetchComponentRows(entryRight);

          const keywordData = resolveKeywordDataForValue(targetValue, baseRows);
          const leftKeywordData = resolveKeywordDataForValue(
            entryLeft,
            leftRows
          );
          const rightKeywordData = resolveKeywordDataForValue(
            entryRight,
            rightRows
          );

          return {
            entry: createEmptyDecompositionEntry({
              value: targetValue,
              keyword: keywordData?.keyword ?? null,
              bookOrder: keywordData?.bookOrder ?? null,
              left: entryLeft,
              right: entryRight,
              leftKeyword: leftKeywordData?.keyword ?? null,
              rightKeyword: rightKeywordData?.keyword ?? null,
            }),
            rows: baseRows,
            leftRows,
            rightRows,
          };
        };

        const {
          entry: mainEntry,
          leftRows: mainLeftRows,
          rightRows: mainRightRows,
        } = buildDecompositionEntry(trimmedValue, { rows: matchedRows });
        const {
          left: mainLeft,
          right: mainRight,
          valueKeyword: mainKeyword,
          valueBookOrder: mainBookOrder,
          leftKeyword: mainLeftKeyword,
          rightKeyword: mainRightKeyword,
        } = mainEntry;

        const leftDecompRows = mainLeftRows;
        const rightDecompRows = mainRightRows;

        const getNeighbor = (stmt, order) => {
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

        const previousBook = getNeighbor(previousBookOrderStmt, mainBookOrder);
        const nextBook = getNeighbor(nextBookOrderStmt, mainBookOrder);

        const enrichedRows = matchedRows.map((row) => ({
          ...row,
          leftDecomp: mainLeft,
          rightDecomp: mainRight,
          leftDecompRows,
          rightDecompRows,
          keyword: mainKeyword,
          leftKeyword: mainLeftKeyword,
          rightKeyword: mainRightKeyword,
        }));

        const characters = Array.from(trimmedValue).filter(
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

        const currentRow = findRowForValue(trimmedValue);
        const currentSimplified = currentRow?.simplified ?? trimmedValue ?? null;
        const currentTraditional = currentRow?.traditional ?? null;

        setDecompositions(
          decompositionEntries.length
            ? decompositionEntries
            : createEmptyDecompositionList()
        );
        setBookOrderNav({
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
        });
        setResults(enrichedRows);
      } finally {
        decompositionStmt.free();
        keywordStmt.free();
        previousBookOrderStmt.free();
        nextBookOrderStmt.free();
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
    runQuery(query);
  }, [db, query]);

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

  const updateQuery = (nextValue, { replace = false } = {}) => {
    setQuery(nextValue);

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

    updateQuery(nextValue);

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
    updateQuery(trimmed);

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
    <div className="p-3 flex flex-col">
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
