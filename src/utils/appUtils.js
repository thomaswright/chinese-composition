export function uniqueById(arr, key) {
  return [...new Map(arr.map((obj) => [obj[key], obj])).values()];
}

export const QUERY_PARAM = "value";
export const VIEW_PARAM = "view";
export const VIEW_KEYWORDS = "keywords";
export const DEFAULT_VIEW = "definition";
export const QUERY_DEBOUNCE_MS = 800;

export function normalizeView(value) {
  return value === VIEW_KEYWORDS ? VIEW_KEYWORDS : DEFAULT_VIEW;
}

export function getQueryFromUrl() {
  if (typeof window === "undefined") return "";

  const params = new URLSearchParams(window.location.search);
  return params.get(QUERY_PARAM) || "";
}

export function getViewFromUrl() {
  if (typeof window === "undefined") return DEFAULT_VIEW;

  const params = new URLSearchParams(window.location.search);
  return normalizeView(params.get(VIEW_PARAM));
}

export function applyViewParam(params, viewValue) {
  if (normalizeView(viewValue) === VIEW_KEYWORDS) {
    params.set(VIEW_PARAM, VIEW_KEYWORDS);
  } else {
    params.delete(VIEW_PARAM);
  }
}

export function createEmptyDecompositionList() {
  return [];
}

export function createEmptyDecompositionEntry({
  value,
  keyword = null,
  bookOrder = null,
  components = [],
}) {
  return {
    value,
    valueKeyword: keyword,
    valueBookOrder: bookOrder,
    components,
  };
}

export function createEmptyBookOrderNav() {
  return {
    current: null,
    previous: null,
    next: null,
  };
}

export function pushHistory(prevHistory, value) {
  const trimmedValue = (value ?? "").trim();
  if (!trimmedValue) return prevHistory;

  const nextHistory = prevHistory.filter((item) => item !== trimmedValue);
  nextHistory.push(trimmedValue);
  return nextHistory.slice(-10);
}
