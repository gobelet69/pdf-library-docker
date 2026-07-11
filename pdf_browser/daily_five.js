(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PdfDailyFive = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const DAILY_LIMIT = 5;

  function todayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function isUnread(pdf) {
    return !Boolean(pdf?.metadata?.read);
  }

  function sortCandidates(pdfs) {
    return [...(pdfs || [])]
      .filter((pdf) => pdf?.path && isUnread(pdf))
      .sort((left, right) => String(left.path).localeCompare(String(right.path), undefined, {
        sensitivity: "base",
        numeric: true,
      }));
  }

  function seededRandom(seed) {
    let value = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
      value ^= seed.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return function next() {
      value += 0x6D2B79F5;
      let nextValue = value;
      nextValue = Math.imul(nextValue ^ (nextValue >>> 15), nextValue | 1);
      nextValue ^= nextValue + Math.imul(nextValue ^ (nextValue >>> 7), nextValue | 61);
      return ((nextValue ^ (nextValue >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomDailyCandidates(candidates, date) {
    const random = seededRandom(date);
    const shuffled = [...candidates];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }

  function serializeState(state) {
    return {
      date: state.date,
      paths: state.queue.map((pdf) => pdf.path),
      skipped: [...state.skipped],
      selected: state.selected,
    };
  }

  function buildDailyFiveState(pdfs, savedState, date = todayKey()) {
    const candidates = sortCandidates(pdfs);
    const allByPath = new Map((pdfs || []).filter((pdf) => pdf?.path).map((pdf) => [pdf.path, pdf]));
    const unreadByPath = new Map(candidates.map((pdf) => [pdf.path, pdf]));
    const sameDate = savedState?.date === date;
    const skipped = sameDate && Array.isArray(savedState.skipped) ? [...new Set(savedState.skipped)] : [];
    const savedPaths = sameDate && Array.isArray(savedState.paths)
      ? savedState.paths
      : randomDailyCandidates(candidates, date).slice(0, DAILY_LIMIT).map((pdf) => pdf.path);
    const queue = [];
    const used = new Set();

    savedPaths.forEach((path) => {
      const pdf = sameDate ? allByPath.get(path) : unreadByPath.get(path);
      if (!pdf || used.has(path) || skipped.includes(path)) return;
      queue.push(pdf);
      used.add(path);
    });

    let selected = sameDate ? Number(savedState.selected || 0) : 0;
    if (!Number.isFinite(selected) || selected < 0) selected = 0;
    if (queue.length) selected %= queue.length;
    else selected = 0;

    return { date, queue, skipped, selected };
  }

  function rotateDailyFive(state, direction) {
    const queueLength = state.queue.length;
    if (!queueLength) return { ...state, selected: 0 };
    const selected = (state.selected + direction + queueLength) % queueLength;
    return { ...state, selected };
  }

  function removeDailyFivePath(state, path) {
    const queue = state.queue.filter((pdf) => pdf.path !== path);
    const selected = queue.length ? Math.min(state.selected, queue.length - 1) : 0;
    return { ...state, queue, selected };
  }

  function skipDailyFivePath(state, path) {
    const skipped = [...new Set([...state.skipped, path])];
    return removeDailyFivePath({ ...state, skipped }, path);
  }

  function readingProgressLevel(count) {
    return Math.max(0, Math.min(DAILY_LIMIT, Number(count || 0)));
  }

  function addDays(date, amount) {
    const copy = new Date(date.getTime());
    copy.setDate(copy.getDate() + amount);
    return copy;
  }

  function buildReadingHistoryDays(history, endDate = todayKey(), totalDays = 105) {
    const end = new Date(`${endDate}T12:00:00`);
    const days = [];
    for (let offset = totalDays - 1; offset >= 0; offset -= 1) {
      const date = todayKey(addDays(end, -offset));
      const count = Math.max(0, Number(history?.[date] || 0));
      days.push({ date, count, level: readingProgressLevel(count) });
    }
    return days;
  }

  return {
    DAILY_LIMIT,
    todayKey,
    buildDailyFiveState,
    rotateDailyFive,
    skipDailyFivePath,
    removeDailyFivePath,
    readingProgressLevel,
    buildReadingHistoryDays,
    serializeState,
  };
});
