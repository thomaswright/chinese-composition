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

  const runQuery = (value) => {
    try {
      if (!value) {
        setResults([]);
        return;
      }

      const traditionRows = [];

      // Prepare the statement and bind the value
      let stmt = db.prepare("SELECT * FROM hanzi WHERE traditional = ?");
      stmt.bind([value]);

      while (stmt.step()) {
        const row = stmt.getAsObject();
        traditionRows.push(row);
      }
      stmt.free();

      const simplifiedRows = [];

      // Prepare the statement and bind the value
      stmt = db.prepare("SELECT * FROM hanzi WHERE simplified = ?");
      stmt.bind([value]);

      while (stmt.step()) {
        const row = stmt.getAsObject();
        traditionRows.push(row);
      }
      stmt.free();

      setResults(uniqueById([...traditionRows, ...simplifiedRows], "id"));
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

      <div className="">
        {results.map((x, i) => (
          <div key={i}>{JSON.stringify(x)}</div>
        ))}
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
