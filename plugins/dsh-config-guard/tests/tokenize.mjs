// tests/tokenize.mjs
// Token-counting helper. Heuristic, not exact — but consistent across runs.
export function countTokens(payload) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  const chars = text.length;
  // Different content types have different densities; pick the right
  // ratio by content shape so a JSON-heavy call doesn't get undercounted.
  const looksLikeCode = /[{}\[\];]/.test(text) && /[a-zA-Z]/.test(text);
  const looksLikeJson = (text.trim().startsWith('{') || text.trim().startsWith('['));
  let perTok;
  if (looksLikeJson) perTok = 4.5;
  else if (looksLikeCode) perTok = 2.5;
  else perTok = 3.2;
  return {
    chars,
    tokens_est: Math.round(chars / perTok),
    tokens_high: Math.round(chars / 2.5),
    tokens_low: Math.round(chars / 4.5)
  };
}

export function simulateAgentView(result) {
  return JSON.stringify(result, null, 2);
}
