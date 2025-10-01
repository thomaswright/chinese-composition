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

function createEmptyDecomposition() {
  return {
    valueKeyword: null,
    valueBookOrder: null,
    left: null,
    right: null,
    leftKeyword: null,
    rightKeyword: null,
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

function BookOrderNavigator({ navigation, onSelect }) {
  const current = navigation?.current;

  if (!current || current.bookOrder == null) {
    return <div className="w-32 flex-none" aria-hidden="true" />;
  }

  const hasPrevious = Boolean(navigation?.previous?.simplified);
  const hasNext = Boolean(navigation?.next?.simplified);

  return (
    <div className="flex items-center justify-center gap-2 w-32 flex-none">
      <button
        type="button"
        onClick={() => {
          if (hasPrevious) {
            onSelect(navigation.previous.simplified);
          }
        }}
        disabled={!hasPrevious}
        className="w-8 h-8 flex items-center justify-center border rounded disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Previous keyword"
      >
        <LucideChevronLeft className="w-4 h-4" />
      </button>
      <span className="flex-1 text-xs text-gray-600 text-center truncate">
        {current.bookOrder}
      </span>
      <button
        type="button"
        onClick={() => {
          if (hasNext) {
            onSelect(navigation.next.simplified);
          }
        }}
        disabled={!hasNext}
        className="w-8 h-8 flex items-center justify-center border rounded disabled:opacity-40 disabled:cursor-not-allowed"
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
  activeSimplified,
  isVisible,
}) {
  const containerRef = useRef(null);
  const { scrollTop, setScrollTop, handleScroll } =
    useScrollPosition(isVisible);
  const { containerHeight, itemHeight } = useContainerMetrics({
    containerRef,
    isActive: isVisible,
    dependencies: [loading, keywords.length],
  });
  const activeIndex = keywords.findIndex(
    (item) => item.simplified === activeSimplified
  );

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
                const isActive = item.simplified === activeSimplified;

                return (
                  <button
                    key={`${item.simplified ?? ""}-${
                      item.book_order ?? ""
                    }-${actualIndex}`}
                    type="button"
                    onClick={() => onSelect(item.simplified)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50 ${
                      isActive ? "bg-blue-50" : ""
                    }`}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold">
                        {item.simplified}
                      </span>
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

function ViewTabs({ view, onSelect }) {
  const tabButtonClass = (tab) =>
    `px-3 py-1 text-sm border rounded transition-colors ${
      view === tab
        ? "border-blue-500 bg-blue-50 text-blue-700"
        : "border-transparent text-gray-600 hover:border-gray-300"
    }`;

  return (
    <div role="tablist" aria-label="View selection" className="mt-3 flex gap-2">
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
  );
}

function SearchBar({
  query,
  onQueryChange,
  onQuerySubmit,
  bookOrderNav,
  onSelectValue,
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
        className="flex-1 px-3 py-1 border rounded text-lg"
      />
      <BookOrderNavigator navigation={bookOrderNav} onSelect={onSelectValue} />
    </div>
  );
}

function DefinitionView({
  isVisible,
  decomposition,
  query,
  results,
  onSelectValue,
}) {
  if (!isVisible) {
    return null;
  }

  const showDecomposition =
    (decomposition.left || decomposition.right) && decomposition.right !== "*";

  return (
    <div>
      {showDecomposition ? (
        <div className="mt-2 px-3  py-2 text-lg flex flex-row justify-start gap-1 items-center">
          {decomposition.left && (
            <button
              type="button"
              onClick={() => onSelectValue(decomposition.left)}
              className=" text-left text-blue-600 hover:underline flex items-center gap-1 flex-none w-fit"
            >
              <span>{decomposition.left}</span>
              {decomposition.leftKeyword && (
                <span className="text-gray-600">
                  {decomposition.leftKeyword}
                </span>
              )}
            </button>
          )}
          <span>+</span>
          {decomposition.right && (
            <button
              type="button"
              onClick={() => onSelectValue(decomposition.right)}
              className="text-left text-blue-600 hover:underline flex items-center gap-1 flex-none w-fit"
            >
              <span>{decomposition.right}</span>
              {decomposition.rightKeyword && (
                <span className="text-gray-600">
                  {decomposition.rightKeyword}
                </span>
              )}
            </button>
          )}
          <span>=</span>
          {decomposition.right && (
            <button
              type="button"
              onClick={() => onSelectValue(query)}
              className="text-left text-blue-600 hover:underline flex items-center gap-1 flex-none w-fit"
            >
              <span>{query}</span>
              {decomposition.valueKeyword && (
                <span className="text-gray-600">
                  {decomposition.valueKeyword}
                </span>
              )}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2 px-3  py-2 text-gray-400 flex flex-row justify-start gap-1 items-center">
          (no decomposition)
        </div>
      )}

      <div className="space-y-4 mt-3 divide-y border-t max-w-lg">
        {results.map((row) => {
          const englishMeanings = row.english
            ? row.english
                .split("/")
                .map((item) => item.trim())
                .filter(Boolean)
            : [];

          return (
            <div key={row.id ?? row.simplified} className="  p-3 space-y-1">
              <div className="font-semibold text-lg">
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
      className="mt-3 px-3 text-lg text-gray-600 border-t py-3 max-w-lg"
    >
      <div>History</div>
      <div className="flex flex-wrap items-center gap-3">
        {history.map((item) => (
          <div key={item} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="text-blue-600 hover:underline"
            >
              {item}
            </button>
          </div>
        ))}
      </div>
    </nav>
  );
}

function Dashboard({ db }) {
  const [query, setQuery] = useState(() => getQueryFromUrl()); // input value
  const [results, setResults] = useState([]); // query results
  const [error, setError] = useState(null);
  const [decomposition, setDecomposition] = useState(createEmptyDecomposition);
  const [bookOrderNav, setBookOrderNav] = useState(createEmptyBookOrderNav);
  const [view, setView] = useState(() => getViewFromUrl());
  const [allKeywords, setAllKeywords] = useState([]);
  const [loadingKeywords, setLoadingKeywords] = useState(false);
  const [history, setHistory] = useState(() => {
    const initialValue = getQueryFromUrl();
    return initialValue ? [initialValue] : [];
  });

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

    try {
      if (!value) {
        setResults([]);
        setDecomposition(createEmptyDecomposition());
        setBookOrderNav(createEmptyBookOrderNav());
        return;
      }

      setHistory((prevHistory) => pushHistory(prevHistory, value));

      const traditionRows = fetchHanziRows("traditional", value);
      const simplifiedRows = fetchHanziRows("simplified", value);

      const matchedRows = uniqueById(
        [...traditionRows, ...simplifiedRows],
        "id"
      );

      if (!matchedRows.length) {
        setResults([]);
        setDecomposition(createEmptyDecomposition());
        setBookOrderNav(createEmptyBookOrderNav());
        return;
      }

      const decompositionStmt = db.prepare(
        "SELECT left_component, right_component FROM hanzi_decomposition WHERE component = ?"
      );
      const keywordStmt = db.prepare(
        "SELECT keyword, book_order FROM hanzi_keywords WHERE simplified = ?"
      );
      const previousBookOrderStmt = db.prepare(
        "SELECT simplified, book_order FROM hanzi_keywords WHERE book_order < ? ORDER BY book_order DESC LIMIT 1"
      );
      const nextBookOrderStmt = db.prepare(
        "SELECT simplified, book_order FROM hanzi_keywords WHERE book_order > ? ORDER BY book_order ASC LIMIT 1"
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

      const lookupKeyword = (lookupValue) => {
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

      try {
        const { left: leftDecomp, right: rightDecomp } =
          lookupDecomposition(value);

        const leftDecompRows = fetchComponentRows(leftDecomp);
        const rightDecompRows = fetchComponentRows(rightDecomp);
        const keywordData = lookupKeyword(value);
        const keyword = keywordData?.keyword ?? null;
        const leftKeyword = lookupKeyword(leftDecomp)?.keyword ?? null;
        const rightKeyword = lookupKeyword(rightDecomp)?.keyword ?? null;
        const valueBookOrder = keywordData?.bookOrder ?? null;

        const getNeighbor = (stmt, order) => {
          if (typeof order !== "number") return null;

          stmt.bind([order]);

          if (!stmt.step()) {
            stmt.reset();
            return null;
          }

          const { simplified, book_order } = stmt.getAsObject();
          stmt.reset();

          return {
            simplified: simplified || null,
            bookOrder: typeof book_order === "number" ? book_order : null,
          };
        };

        const previousBook = getNeighbor(previousBookOrderStmt, valueBookOrder);
        const nextBook = getNeighbor(nextBookOrderStmt, valueBookOrder);

        const enrichedRows = matchedRows.map((row) => ({
          ...row,
          leftDecomp,
          rightDecomp,
          leftDecompRows,
          rightDecompRows,
          keyword,
          leftKeyword,
          rightKeyword,
        }));

        setDecomposition({
          valueKeyword: keyword,
          valueBookOrder,
          left: leftDecomp,
          right: rightDecomp,
          leftKeyword,
          rightKeyword,
        });
        console.log(keywordData);
        setBookOrderNav({
          current:
            valueBookOrder != null
              ? { simplified: value, bookOrder: valueBookOrder }
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
        "SELECT simplified, keyword, book_order FROM hanzi_keywords ORDER BY (book_order IS NULL), book_order ASC"
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
      setHistory((prevHistory) => pushHistory(prevHistory, nextValue ?? ""));
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

    if (!replace) {
      setHistory((prevHistory) => pushHistory(prevHistory, nextValue ?? ""));
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

  const updateView = (
    nextView,
    { replace = false, queryValue } = {}
  ) => {
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

  const trimmedQuery = (query ?? "").trim();
  const isKeywordView = view === VIEW_KEYWORDS;
  const isDefinitionView = !isKeywordView;

  return (
    <div className="p-3">
      <div className="pb-2 px-3">
        <h1 className="font-black text-gray-500">Character Composition</h1>
        <ViewTabs view={view} onSelect={handleSelectViewTab} />
      </div>

      <SearchBar
        query={query ?? ""}
        onQueryChange={handleQueryChange}
        onQuerySubmit={handleQuerySubmit}
        bookOrderNav={bookOrderNav}
        onSelectValue={handleSelectValue}
      />

      {error && <div style={{ color: "red" }}>{error}</div>}

      <KeywordList
        keywords={allKeywords}
        loading={loadingKeywords}
        onSelect={handleSelectValue}
        activeSimplified={trimmedQuery || null}
        isVisible={isKeywordView}
      />

      <DefinitionView
        isVisible={isDefinitionView}
        decomposition={decomposition}
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
    async function connectDatabase() {
      try {
        const SQL = await initSqlJs({ locateFile: () => wasm });
        const response = await fetch("/chinese.db");
        const buf = await response.arrayBuffer();
        const database = new SQL.Database(new Uint8Array(buf));

        setDb(database);
      } catch (err) {
        setError(err);
      }
    }

    connectDatabase();
  }, []);

  if (error) return <pre>{error.toString()}</pre>;
  else if (!db) return <pre>Loading...</pre>;
  else return <Dashboard db={db} />;
}

export default App;
