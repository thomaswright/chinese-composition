import BookOrderNavigator from "./BookOrderNavigator.jsx";

export default function SearchBar({
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
