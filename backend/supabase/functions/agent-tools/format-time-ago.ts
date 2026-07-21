/**
 * Relative Spanish age phrase for the agent to speak verbatim
 * ("hace un momento", "hace 20 minutos", "hace 3 horas", "hace 2 días").
 */
export function formatTimeAgo(isoDate: string, now: Date = new Date()): string {
  const then = new Date(isoDate).getTime();
  if (!Number.isFinite(then)) return "hace un momento";
  const seconds = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (seconds < 60) return "hace un momento";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "hace 1 minuto" : `hace ${minutes} minutos`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "hace 1 hora" : `hace ${hours} horas`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
}
