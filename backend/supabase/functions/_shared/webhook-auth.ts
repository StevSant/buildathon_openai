const encoder = new TextEncoder();

/** Compare the database-webhook secret without data-dependent byte comparisons. */
export function hasValidWebhookSecret(req: Request, expected: string): boolean {
  const provided = req.headers.get("x-pulso-webhook-secret") ?? "";
  if (!expected || !provided) return false;

  const expectedBytes = encoder.encode(expected);
  const providedBytes = encoder.encode(provided);
  if (expectedBytes.length !== providedBytes.length) return false;

  let difference = 0;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    difference |= expectedBytes[index] ^ providedBytes[index];
  }
  return difference === 0;
}
