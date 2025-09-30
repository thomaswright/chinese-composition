import { useEffect, useState } from "react";
import initSqlJs from "sql.js";
import "./App.css";
import wasm from "sql.js/dist/sql-wasm.wasm?url";

function ResultsTable({ columns, values }) {
  return (
    <table>
      <thead>
        <tr>
          {columns.map((columnName, i) => (
            <td key={i}>{columnName}</td>
          ))}
        </tr>
      </thead>

      <tbody>
        {
          // values is an array of arrays representing the results of the query
          values.map((row, i) => (
            <tr key={i}>
              {row.map((value, i) => (
                <td key={i}>{value}</td>
              ))}
            </tr>
          ))
        }
      </tbody>
    </table>
  );
}

function SQLRepl({ db }) {
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);

  useEffect(() => {
    const result = db.exec("SELECT * FROM hanzi where traditional = '乹';");
    if (result.length > 0) {
      const values = result[0].values.map((row) =>
        Object.fromEntries(result[0].columns.map((c, i) => [c, row[i]]))
      );
      setResults(values);
    }
  }, []);

  return (
    <div className="App">
      <h1>Chinese Composition</h1>

      {results !== undefined ? (
        <pre>
          {
            // results contains one object per select statement in the query
            results.map((x, i) => (
              <div>{JSON.stringify(x)}</div>
            ))
          }
        </pre>
      ) : null}
    </div>
  );
}
{
  /* <ResultsTable key={i} columns={columns} values={values} /> */
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
  else return <SQLRepl db={db} />;
}

export default App;
