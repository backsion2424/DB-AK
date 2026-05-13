
export function safeStringify(obj: any, indent: number = 0): string {
  const cache = new WeakSet();
  try {
    return JSON.stringify(
      obj,
      (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (cache.has(value)) {
            return '[Circular]';
          }
          // Special handling for DOM elements which are often circular
          // Use duck typing to handle elements from different frames/contexts
          if (
            (typeof Node !== 'undefined' && value instanceof Node) || 
            (value.nodeType && typeof value.nodeName === 'string')
          ) {
            return `[DOM Element: ${value.nodeName}]`;
          }
          cache.add(value);
        }
        return value;
      },
      indent
    );
  } catch (err) {
    return `[Stringify Error: ${err instanceof Error ? err.message : String(err)}]`;
  }
}
