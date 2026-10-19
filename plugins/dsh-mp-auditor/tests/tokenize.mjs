// tests/tokenize.mjs
export function countTokens(payload) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  const chars = text.length;
  const looksLikeJson = (text.trim().startsWith('{') || text.trim().startsWith('['));
  const perTok = looksLikeJson ? 4.5 : 3.2;
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
