import { useCallback, useEffect, useState } from "react";
import initSqlJs from "sql.js";
import wasm from "sql.js/dist/sql-wasm.wasm?url";

function uniqueById(arr, key) {
  return [...new Map(arr.map((obj) => [obj[key], obj])).values()];
}

const QUERY_PARAM = "value";

function getQueryFromUrl() {
  if (typeof window === "undefined") return "";

  const params = new URLSearchParams(window.location.search);
  return params.get(QUERY_PARAM) || "";
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
    return null;
  }

  const hasPrevious = Boolean(navigation?.previous?.simplified);
  const hasNext = Boolean(navigation?.next?.simplified);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          if (hasPrevious) {
            onSelect(navigation.previous.simplified);
          }
        }}
        disabled={!hasPrevious}
        className="px-2 py-1 border rounded text-lg leading-none disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <LucideChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm text-gray-600 whitespace-nowrap">
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
        className="px-2 py-1 border rounded text-lg leading-none disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <LucideChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function Dashboard({ db }) {
  const [query, setQuery] = useState(() => getQueryFromUrl()); // input value
  const [results, setResults] = useState([]); // query results
  const [error, setError] = useState(null);
  const [decomposition, setDecomposition] = useState(createEmptyDecomposition);
  const [bookOrderNav, setBookOrderNav] = useState(createEmptyBookOrderNav);
  const [history, setHistory] = useState(() => {
    const initialValue = getQueryFromUrl();
    return initialValue ? [initialValue] : [];
  });

  const fetchHanziRows = useCallback(
    (column, value) => {
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
    },
    [db]
  );

  const recordHistory = useCallback((value) => {
    if (!value) return;

    const trimmedValue = value.trim();
    if (!trimmedValue) return;

    setHistory((prevHistory) => {
      const nextHistory = prevHistory.filter((item) => item !== trimmedValue);
      nextHistory.push(trimmedValue);
      return nextHistory.slice(-10);
    });
  }, []);

  const runQuery = useCallback(
    (value) => {
      if (!db) return;

      try {
        if (!value) {
          setResults([]);
          setDecomposition(createEmptyDecomposition());
          setBookOrderNav(createEmptyBookOrderNav());
          return;
        }

        recordHistory(value);

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

          const previousBook = getNeighbor(
            previousBookOrderStmt,
            valueBookOrder
          );
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
    },
    [db, fetchHanziRows, recordHistory]
  );

  useEffect(() => {
    runQuery(query);
  }, [query, runQuery]);

  useEffect(() => {
    const handlePopState = () => {
      const nextValue = getQueryFromUrl();
      setQuery(nextValue);
      recordHistory(nextValue ?? "");
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [recordHistory]);

  const updateQuery = useCallback(
    (nextValue, { replace = false } = {}) => {
      setQuery(nextValue);

      if (!replace) {
        recordHistory(nextValue ?? "");
      }

      if (typeof window === "undefined") return;

      const params = new URLSearchParams(window.location.search);

      if (nextValue) {
        params.set(QUERY_PARAM, nextValue);
      } else {
        params.delete(QUERY_PARAM);
      }

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
    },
    [recordHistory]
  );

  const handleSelectValue = (nextValue) => {
    if (!nextValue) return;

    updateQuery(nextValue);
  };

  return (
    <div className="p-3">
      <h1 className="pb-2 px-3 font-black text-gray-500">
        Character Composition
      </h1>

      <div className="mt-1 flex items-center gap-3 max-w-lg">
        <input
          type="text"
          placeholder="Enter character…"
          value={query}
          onChange={(e) => {
            const val = e.target.value;
            updateQuery(val, { replace: true });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const val = e.currentTarget.value.trim();
              updateQuery(val);
            }
          }}
          className="flex-1 px-3 py-1 border rounded text-lg"
        />
        <BookOrderNavigator
          navigation={bookOrderNav}
          onSelect={handleSelectValue}
        />
      </div>

      {error && <div style={{ color: "red" }}>{error}</div>}

      {(decomposition.left || decomposition.right) &&
      decomposition.right !== "*" ? (
        <div className="mt-2 px-3  py-2 text-lg flex flex-row justify-start gap-1 items-center">
          {decomposition.left && (
            <button
              type="button"
              onClick={() => handleSelectValue(decomposition.left)}
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
          {<span>+</span>}
          {decomposition.right && (
            <button
              type="button"
              onClick={() => handleSelectValue(decomposition.right)}
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
          {<span>=</span>}
          {decomposition.right && (
            <button
              type="button"
              onClick={() => handleSelectValue(query)}
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
        <div className="mt-2 px-3  py-2 text-lg flex flex-row justify-start gap-1 items-center">
          No Decomposition
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
      {history.length > 0 && (
        <nav
          aria-label="Query history"
          className="mt-3 px-3 text-lg text-gray-600 border-t py-3 max-w-lg"
        >
          <div>History</div>
          <div className="flex flex-wrap items-center gap-3">
            {history.map((item, index) => {
              return (
                <div key={item} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectValue(item)}
                    className="text-blue-600 hover:underline"
                  >
                    {item}
                  </button>
                </div>
              );
            })}
          </div>
        </nav>
      )}
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
