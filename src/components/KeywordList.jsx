import { useEffect, useRef, useState } from "react";

function useContainerMetrics({
  containerRef,
  isActive,
  itemSelector = "button",
  defaultItemHeight = 48,
  dependencies = [],
}) {
  const [containerHeight, setContainerHeight] = useState(0);
  const [itemHeight, setItemHeight] = useState(defaultItemHeight);

  useEffect(() => {
    if (!isActive) return;

    const element = containerRef.current;
    if (!element) return;

    const measure = () => {
      setContainerHeight(element.clientHeight);

      if (!itemSelector) return;

      const sample = element.querySelector(itemSelector);
      if (!sample) return;

      const { height } = sample.getBoundingClientRect();
      if (height) {
        setItemHeight(height);
      }
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [
    containerRef,
    isActive,
    itemSelector,
    defaultItemHeight,
    ...dependencies,
  ]);

  return { containerHeight, itemHeight };
}

function useScrollPosition(isActive) {
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setScrollTop(0);
    }
  }, [isActive]);

  const handleScroll = (event) => {
    setScrollTop(event.currentTarget.scrollTop);
  };

  return { scrollTop, setScrollTop, handleScroll };
}

function useScrollToIndex({
  containerRef,
  isActive,
  index,
  itemHeight,
  containerHeight,
  setScrollTop,
}) {
  useEffect(() => {
    if (!isActive) return;

    const element = containerRef.current;
    if (!element) return;

    if (index < 0 || itemHeight <= 0 || containerHeight <= 0) {
      return;
    }

    const targetScroll = Math.max(
      0,
      index * itemHeight - containerHeight / 2 + itemHeight / 2
    );

    if (Math.abs(element.scrollTop - targetScroll) > 1) {
      element.scrollTop = targetScroll;
      setScrollTop(targetScroll);
    }
  }, [
    containerRef,
    isActive,
    index,
    itemHeight,
    containerHeight,
    setScrollTop,
  ]);
}

function useVirtualList({
  itemCount,
  itemHeight,
  containerHeight,
  scrollTop,
  overscan = 8,
}) {
  const safeHeight = itemHeight > 0 ? itemHeight : 1;
  const totalHeight = itemCount * safeHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / safeHeight) - overscan);
  const endIndex = Math.min(
    itemCount,
    Math.ceil((scrollTop + containerHeight) / safeHeight) + overscan
  );
  const offsetY = startIndex * safeHeight;

  return { totalHeight, startIndex, endIndex, offsetY };
}

export default function KeywordList({
  keywords,
  loading,
  onSelect,
  activeValue,
  isVisible,
  script,
}) {
  const effectiveScript =
    script === "traditional" ? "traditional" : "simplified";
  const containerRef = useRef(null);
  const { scrollTop, setScrollTop, handleScroll } =
    useScrollPosition(isVisible);
  const { containerHeight, itemHeight } = useContainerMetrics({
    containerRef,
    isActive: isVisible,
    dependencies: [loading, keywords.length],
  });
  const activeIndex = keywords.findIndex((item) => {
    if (!activeValue) return false;
    return item.simplified === activeValue || item.traditional === activeValue;
  });

  useScrollToIndex({
    containerRef,
    isActive: isVisible && !loading,
    index: activeIndex,
    itemHeight,
    containerHeight,
    setScrollTop,
  });

  if (!isVisible) {
    return null;
  }

  if (loading) {
    return (
      <div className="mt-3 px-3 py-2 text-gray-600 text-sm border rounded ">
        Loading keywords…
      </div>
    );
  }

  if (!keywords.length) {
    return (
      <div className="mt-3 px-3 py-2 text-gray-600 text-sm border rounded ">
        No keywords found.
      </div>
    );
  }

  const { totalHeight, startIndex, endIndex, offsetY } = useVirtualList({
    itemCount: keywords.length,
    itemHeight,
    containerHeight,
    scrollTop,
  });
  const itemsToRender = keywords.slice(startIndex, endIndex);

  return (
    <div className="mt-3 border rounded border-gray-400 overflow-hidden">
      <div
        ref={containerRef}
        className="max-h-80 overflow-y-auto"
        onScroll={handleScroll}
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          <div
            className="absolute inset-x-0"
            style={{ transform: `translateY(${offsetY}px)` }}
          >
            <div className="divide-y divide-gray-300">
              {itemsToRender.map((item, index) => {
                const actualIndex = startIndex + index;
                const displayCharacter =
                  effectiveScript === "traditional"
                    ? item.traditional || item.simplified
                    : item.simplified || item.traditional;
                const buttonValue = displayCharacter || item.simplified || "";
                const isCurrent =
                  activeValue &&
                  (buttonValue === activeValue ||
                    item.simplified === activeValue ||
                    item.traditional === activeValue);

                return (
                  <button
                    key={`${item.simplified ?? item.traditional ?? ""}-${
                      item.book_order ?? ""
                    }-${actualIndex}-${effectiveScript}`}
                    type="button"
                    onClick={() => {
                      if (buttonValue) {
                        onSelect(buttonValue);
                      }
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50 ${
                      isCurrent ? "bg-blue-50" : ""
                    }`}
                    aria-current={isCurrent ? "true" : undefined}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{displayCharacter}</span>
                      {item.keyword && (
                        <span className="text-sm text-gray-600">
                          {item.keyword}
                        </span>
                      )}
                    </div>
                    {typeof item.book_order === "number" && (
                      <span className="text-xs text-gray-500">
                        #{item.book_order}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
