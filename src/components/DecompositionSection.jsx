import { Fragment } from "react";

export default function DecompositionSection({
  decompositions,
  query,
  onSelectValue,
}) {
  if (!decompositions.length) {
    return (
      <div className="px-3 py-3 text-gray-400 flex flex-row justify-start gap-1 items-center">
        no decomposition
      </div>
    );
  }

  return (
    <div className="px-3 py-3 flex flex-col items-center gap-3">
      {decompositions.map((item, index) => {
        const displayValue = item.value ?? query ?? "";
        const key = `${displayValue || "entry"}-${index}`;
        const componentList = Array.isArray(item.components)
          ? item.components.filter((component) => component?.value)
          : [];
        const containsBaseComponent =
          displayValue &&
          componentList.some((component) => component.value === displayValue);
        const showDecomposition =
          componentList.length > 0 && !containsBaseComponent;

        if (!showDecomposition) {
          return (
            <div
              key={key}
              className="flex flex-row justify-start gap-2 items-center"
            >
              {displayValue ? (
                <span className="text-lg leading-tight">{displayValue}</span>
              ) : null}
              {item.valueKeyword && <span>{item.valueKeyword}</span>}
            </div>
          );
        }

        return (
          <div
            key={key}
            className="flex flex-row justify-start gap-3 items-center"
          >
            {componentList.map((component, componentIndex) => {
              const componentKey = `${key}-component-${component.value}-${componentIndex}`;

              return (
                <Fragment key={componentKey}>
                  <button
                    type="button"
                    onClick={() => onSelectValue(component.value)}
                    className="text-left flex flex-col items-center flex-none w-fit px-2 py-1 rounded-md transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-blue-500"
                  >
                    <span className="text-lg leading-tight">
                      {component.value}
                    </span>
                    {component.keyword && <span>{component.keyword}</span>}
                  </button>
                  {componentIndex < componentList.length - 1 ? (
                    <span>+</span>
                  ) : null}
                </Fragment>
              );
            })}
            <span>=</span>
            <button
              type="button"
              onClick={() => onSelectValue(displayValue)}
              className="text-left flex flex-col items-center flex-none w-fit px-2 py-1 rounded-md transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-blue-500"
            >
              <span className="text-lg leading-tight">{displayValue}</span>
              {item.valueKeyword && <span>{item.valueKeyword}</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}
