/**
 * Keeps catalog invalidation behind the persistence boundary so callers never
 * refetch models using credentials that have not been saved yet.
 */
export async function persistBeforeInvalidatingCatalog<T>(
  provider: string,
  persist: () => T | Promise<T>,
  invalidate: (provider: string) => void,
): Promise<T> {
  const result = await persist();
  invalidate(provider);
  return result;
}
