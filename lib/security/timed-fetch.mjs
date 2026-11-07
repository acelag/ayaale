/** @param {typeof fetch} [fetchImpl] @param {number} [timeoutMs] @returns {typeof fetch} */
export function createTimedFetch(fetchImpl = fetch, timeoutMs = 15_000) {
  return (input, init) =>
    fetchImpl(input, {
      ...init,
      cache: "no-store",
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
    });
}
