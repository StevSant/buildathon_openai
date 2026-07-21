/**
 * HMAC-SHA256 of a cédula with the server-side pepper, hex-encoded. Uses Web Crypto,
 * which is a global in both Node 18+ and Deno, so the same code runs in the Next app
 * and the Edge Functions.
 */
export async function hashCedula(cedula: string, pepper: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(cedula));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
