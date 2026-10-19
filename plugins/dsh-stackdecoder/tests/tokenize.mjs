/**
 * Token estimator — cheap heuristic for "how many tokens would this string
 * use in an LLM context". Not accurate to within 10%, but consistent enough
 * to compare two outputs.
 *
 * Heuristic: 1 token ≈ chars/3.2 for English, chars/2.5 for code, chars/4.5
 * for dense JSON. We return the English estimate + high/low bounds.
 */
export function countTokens(text) {
  if (typeof text !== "string") text = String(text);
  const chars = text.length;
  // Detect content kind:
  //   - has `{` or `[` and lots of newlines → JSON
  //   - has `\n  if` or `\nfunction` → code
  //   - otherwise → English
  let tokens_est, tokens_high, tokens_low;
  const isJson = /[\{\[]/.test(text) && /\n/.test(text) && /[":]/.test(text);
  const isCode = /\n\s*(function|const|let|var|if|return|class|import|export)\b/.test(text);
  if (isJson) {
    tokens_est = Math.round(chars / 4.5);
    tokens_high = Math.round(chars / 4.0);
    tokens_low = Math.round(chars / 5.5);
  } else if (isCode) {
    tokens_est = Math.round(chars / 2.5);
    tokens_high = Math.round(chars / 2.0);
    tokens_low = Math.round(chars / 3.2);
  } else {
    tokens_est = Math.round(chars / 3.2);
    tokens_high = Math.round(chars / 2.5);
    tokens_low = Math.round(chars / 4.5);
  }
  return { chars, tokens_est, tokens_high, tokens_low };
}

/** Compact what-the-agent-would-see view (stringified JSON, trimmed). */
export function simulateAgentView(obj) {
  return JSON.stringify(obj, null, 2);
}
