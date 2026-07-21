/**
 * Accept only an explicitly verified identity response. Checking the body as well as
 * the HTTP status keeps signup fail-closed against older handlers that returned 200
 * with `{ verified: false }`.
 */
export async function readVerifiedIdentityResponse(response: Response): Promise<void> {
  const body = (await response.json().catch(() => ({}))) as {
    verified?: boolean;
    error?: string;
    reason?: string;
  };

  if (!response.ok || body.verified !== true) {
    throw new Error(body.error ?? body.reason ?? "No pudimos verificar tu cédula");
  }
}
