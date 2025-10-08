export default function HistoryList({ history, onSelect, isVisible }) {
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
