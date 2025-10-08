import { DEFAULT_VIEW, VIEW_KEYWORDS } from "../utils/appUtils.js";

export default function ViewTabs({
  view,
  onSelect,
  keywordScript,
  onSelectKeywordScript,
}) {
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
    <div className="flex items-center gap-3 py-2 justify-between ">
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
