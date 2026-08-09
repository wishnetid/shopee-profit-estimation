function parsePositiveInteger(value, fallback, field) {
  if (value === null || value === undefined || value === '') return { value: fallback, error: null };
  const text = String(value);
  if (!/^\d+$/.test(text) || Number(text) <= 0 || !Number.isSafeInteger(Number(text))) {
    return { value: fallback, error: `${field} must be a positive integer.` };
  }
  return { value: Number(text), error: null };
}

function parsePagination(pageValue, limitValue) {
  const page = parsePositiveInteger(pageValue, 1, 'page');
  if (page.error) return { page: 1, limit: 50, error: page.error };
  const limit = parsePositiveInteger(limitValue, 50, 'limit');
  if (limit.error) return { page: page.value, limit: 50, error: limit.error };

  const normalizedLimit = limit.value > 100 ? 100 : Math.max(5, limit.value);
  const offset = (page.value - 1) * normalizedLimit;
  if (!Number.isSafeInteger(offset)) {
    return { page: page.value, limit: normalizedLimit, error: 'page and limit produce an unsafe offset.' };
  }
  return { page: page.value, limit: normalizedLimit, error: null };
}

module.exports = { parsePagination, parsePositiveInteger };
module.exports.default = { parsePagination, parsePositiveInteger };
