const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Great-circle distance between two WGS84 points (haversine). Used to derive the
 * viewer→incident distance client-side; `get_incident_details` only returns lng/lat.
 */
export function haversineMeters(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}
