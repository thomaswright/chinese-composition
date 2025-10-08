export default function CharacterButtons({ value, onSelect, idPrefix }) {
  const resolvedValue = value ?? "";
  if (!resolvedValue) return null;

  const handleSelect = (character) => {
    if (!onSelect) return;
    onSelect(character);
  };

  return (
    <span className="inline-flex flex-wrap items-center">
      {Array.from(resolvedValue).map((character, index) => (
        <button
          key={`${idPrefix ?? "char"}-${index}-${character}`}
          type="button"
          onClick={() => handleSelect(character)}
          className="inline-flex items-center justify-center py-1 bg-transparent text-lg leading-tight rounded hover:bg-gray-100 focus-visible:outline focus-visible:outline-blue-400"
        >
          {character}
        </button>
      ))}
    </span>
  );
}
