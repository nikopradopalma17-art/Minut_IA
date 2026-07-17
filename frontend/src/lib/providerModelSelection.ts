export async function resolveAvailableBuiltinModel(
  getAvailableModel: () => Promise<string | null>,
): Promise<string | null> {
  const model = await getAvailableModel();
  return typeof model === 'string' && model.trim() ? model : null;
}
