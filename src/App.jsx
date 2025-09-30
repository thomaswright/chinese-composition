import { useEffect, useState } from "react";
import initSqlJs from "sql.js";
import wasm from "sql.js/dist/sql-wasm.wasm?url";

function uniqueById(arr, key) {
  return [...new Map(arr.map((obj) => [obj[key], obj])).values()];
}

function Dashboard({ db }) {
  const [query, setQuery] = useState(""); // input value
  const [results, setResults] = useState([]); // query results
  const [error, setError] = useState(null);

  const fetchHanziRows = (column, value) => {
    if (!value) return [];

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
    try {
      if (!value) {
        setResults([]);
        return;
      }

      const traditionRows = fetchHanziRows("traditional", value);
      const simplifiedRows = fetchHanziRows("simplified", value);

      const matchedRows = uniqueById(
        [...traditionRows, ...simplifiedRows],
        "id"
      );

      if (!matchedRows.length) {
        setResults([]);
        return;
      }

      const decompositionStmt = db.prepare(
        "SELECT left_component, right_component FROM hanzi_decomposition WHERE component = ?"
      );
      const keywordStmt = db.prepare(
        "SELECT keyword FROM hanzi_keywords WHERE simplified = ?"
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

        const { keyword } = keywordStmt.getAsObject();
        keywordStmt.reset();

        return keyword || null;
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
        const keyword = lookupKeyword(value);
        const leftKeyword = lookupKeyword(leftDecomp);
        const rightKeyword = lookupKeyword(rightDecomp);

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

        setResults(enrichedRows);
      } finally {
        decompositionStmt.free();
        keywordStmt.free();
      }
    } catch (err) {
      setError(err.toString());
    }
  };

  return (
    <div className="App">
      <h1 className="text-amber-500 ">Chinese Composition</h1>

      {/* Search Input */}
      <input
        type="text"
        placeholder="Enter traditional character…"
        value={query}
        onChange={(e) => {
          const val = e.target.value;
          setQuery(val);
          runQuery(val);
        }}
        className="p-2 border rounded"
      />

      {error && <div style={{ color: "red" }}>{error}</div>}

      <div className="space-y-4 mt-4">
        {results.map((row) => {
          return (
            <div
              key={row.id ?? row.simplified}
              className="border p-3 rounded space-y-1"
            >
              <div className="font-semibold text-lg">
                {row.simplified}{" "}
                {row.traditional !== row.simplified
                  ? `(${row.traditional})`
                  : ""}
                {row.keyword && (
                  <span className="ml-2 text-sm font-normal text-amber-600">
                    ({row.keyword})
                  </span>
                )}
              </div>
              {row.pinyin && (
                <div className="text-sm text-gray-600">{row.pinyin}</div>
              )}
              {row.english && <div className="text-sm">{row.english}</div>}

              {(row.leftDecomp || row.rightDecomp) && (
                <div className="pt-2 text-sm">
                  <div className="font-semibold">Components</div>
                  {row.leftDecomp && (
                    <div>
                      Left: {row.leftDecomp}
                      {row.leftKeyword && (
                        <span className="ml-1 text-gray-600">
                          ({row.leftKeyword})
                        </span>
                      )}
                    </div>
                  )}
                  {row.rightDecomp && (
                    <div>
                      Right: {row.rightDecomp}
                      {row.rightKeyword && (
                        <span className="ml-1 text-gray-600">
                          ({row.rightKeyword})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
