import LucideChevronLeft from "./LucideChevronLeft.jsx";
import LucideChevronRight from "./LucideChevronRight.jsx";

export default function BookOrderNavigator({ navigation, onSelect, script }) {
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
