import { Fragment } from "react";
import CharacterButtons from "./CharacterButtons.jsx";
import DecompositionSection from "./DecompositionSection.jsx";

export default function DefinitionView({
  isVisible,
  decompositions,
  query,
  results,
  onSelectValue,
}) {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="mt-2">
      <DecompositionSection
        decompositions={decompositions}
        query={query}
        onSelectValue={onSelectValue}
      />

      <div className="divide-y  divide-gray-300 border-t border-gray-300">
        {results.map((row) => {
          const englishMeanings = row.english
            ? row.english
                .split("/")
                .map((item) => item.trim())
                .filter(Boolean)
            : [];

          return (
            <div key={row.id ?? row.simplified} className=" px-3 py-3">
              <div className="text-lg">
                <CharacterButtons
                  value={row.simplified}
                  onSelect={onSelectValue}
                  idPrefix={`${row.id ?? row.simplified}-simplified`}
                />
                {row.traditional && row.traditional !== row.simplified ? (
                  <Fragment>
                    {" ("}
                    <CharacterButtons
                      value={row.traditional}
                      onSelect={onSelectValue}
                      idPrefix={`${row.id ?? row.simplified}-traditional`}
                    />
                    {")"}
                  </Fragment>
                ) : null}
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
