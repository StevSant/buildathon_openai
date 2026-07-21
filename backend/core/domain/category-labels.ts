import type { Category } from './category';

/** Spanish display label for each incident category (UI + agent presentation). */
export const CATEGORY_LABELS: Record<Category, string> = {
  road_closure: 'Cierre vial',
  accident: 'Accidente',
  flood: 'Inundación',
  fire: 'Incendio',
  public_event: 'Evento público',
  other: 'Otro',
};
