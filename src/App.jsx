import { useEffect, useState } from "react";
import initSqlJs from "sql.js";
import wasm from "sql.js/dist/sql-wasm.wasm?url";
import Dashboard from "./components/Dashboard.jsx";

function App() {
  const [db, setDb] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    let databaseInstance = null;

    async function connectDatabase() {
      try {
        const SQL = await initSqlJs({ locateFile: () => wasm });
        const databaseUrl = `${import.meta.env.BASE_URL}/chinese.db`;
        const response = await fetch(databaseUrl);

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
