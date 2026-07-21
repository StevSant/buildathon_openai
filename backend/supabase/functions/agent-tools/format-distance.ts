/**
 * Humanized Spanish distance phrase for the agent to speak verbatim
 * ("a menos de 100 metros", "a unos 450 metros", "a 1,2 km").
 */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "a una distancia desconocida";
  if (meters < 100) return "a menos de 100 metros";
  if (meters < 1000) return `a unos ${Math.round(meters / 50) * 50} metros`;
  const km = meters / 1000;
  const label =
    km < 10 ? (Math.round(km * 10) / 10).toString().replace(".", ",") : String(Math.round(km));
  return `a ${label} km`;
}
