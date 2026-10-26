/**
 * Collect only the text that an MCP config contributes to an agent context.
 * Nothing here executes commands; the JSON is already parsed by the caller.
 *
 * Counted:
 *   - tools / tool subtrees (serialized, including names and schemas)
 *   - command / args strings
 *   - description strings
 */
export function extractMcpText(document) {
  if (document === null || typeof document !== 'object') return '';

  const chunks = [];
  visit(document);
  return chunks.join('\n');

  function visit(node) {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node === null || typeof node !== 'object') return;

    for (const [key, value] of Object.entries(node)) {
      const lower = key.toLowerCase();

      if (lower === 'tools' || lower === 'tool') {
        collect(value);
      } else if (lower === 'command' || lower === 'args') {
        collectCommand(value);
      } else if (lower === 'description') {
        if (typeof value === 'string') chunks.push(value);
        else if (value !== null && typeof value === 'object') collect(value);
      } else {
        visit(value);
      }
    }
  }

  function collect(value) {
    if (typeof value === 'string') {
      chunks.push(value);
    } else if (value !== null && typeof value === 'object') {
      chunks.push(JSON.stringify(value));
    }
  }

  function collectCommand(value) {
    if (typeof value === 'string') {
      chunks.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') chunks.push(item);
      }
    } else {
      collect(value);
    }
  }
}
