/** Compare draft values, not interaction/loading flags. Store the string at load
 * time so later edits cannot mutate the baseline through a shared object. */
export function draftFingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (Array.isArray(item)) {
      return item.length && item.every(v => v && typeof v === "object" && typeof v.id === "string")
        ? [...item].sort((a, b) => a.id.localeCompare(b.id)) : item;
    }
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
    }
    return item;
  });
}
