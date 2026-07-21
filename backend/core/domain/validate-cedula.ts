/**
 * Validate an Ecuadorian cédula using the module-10 algorithm. Pure, no I/O.
 *
 * Checks: exactly 10 digits, province code 01–24 or 30, third digit < 6 (natural
 * person), and the module-10 check digit in the last position.
 */
export function validateCedula(cedula: string): boolean {
  if (!/^\d{10}$/.test(cedula)) return false;

  const digits = cedula.split('').map(Number);

  const province = Number(cedula.slice(0, 2));
  const provinceValid = (province >= 1 && province <= 24) || province === 30;
  if (!provinceValid) return false;

  // Third digit identifies the person type; 0–5 marks a natural person.
  if (digits[2] >= 6) return false;

  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let product = digits[i] * coefficients[i];
    if (product >= 10) product -= 9;
    sum += product;
  }

  const remainder = sum % 10;
  const checkDigit = remainder === 0 ? 0 : 10 - remainder;
  return checkDigit === digits[9];
}
