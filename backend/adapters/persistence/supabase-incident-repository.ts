import { clampSeverity } from '@pulso/core';
import type {
  AlertRecipient,
  Category,
  ConfirmationKind,
  Incident,
  IncidentDetails,
  IncidentRepository,
  IncidentStatus,
  NearbyIncident,
  Severity,
} from '@pulso/core';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase-backed incidents repository. The Supabase client is injected so the same
 * class runs under Node (Next.js, anon key + user JWT) and Deno (Edge Functions,
 * service role). Geospatial reads go through Postgres RPCs.
 */
export class SupabaseIncidentRepository implements IncidentRepository {
  constructor(
    private readonly client: SupabaseClient,
    // Env-injected query bound (MAX_RADIUS_METERS). Community-vote thresholds are
    // private to Postgres so direct clients cannot lower them to forge incident state.
    private readonly options: { maxRadiusMeters?: number } = {},
  ) {}

  async findNearby(input: {
    lat: number;
    long: number;
    radiusMeters?: number;
    category?: Category | null;
  }): Promise<NearbyIncident[]> {
    const radiusMeters =
      input.radiusMeters != null && this.options.maxRadiusMeters != null
        ? Math.min(input.radiusMeters, this.options.maxRadiusMeters)
        : input.radiusMeters;
    const { data, error } = await this.client.rpc('get_nearby_incidents', {
      user_lat: input.lat,
      user_long: input.long,
      radius_meters: radiusMeters,
      filter_category: input.category ?? null,
    });
    if (error) throw new Error(error.message);

    return (data ?? []).map(
      (row: Record<string, any>): NearbyIncident => ({
        id: row.id,
        title: row.title,
        description: row.description ?? null,
        category: row.category,
        severity: clampSeverity(row.severity),
        status: row.status,
        distance_meters: row.distance_meters,
        confirmations: row.confirmations,
        created_at: row.created_at,
        lng: row.lng,
        lat: row.lat,
      }),
    );
  }

  async getDetails(id: string): Promise<IncidentDetails | null> {
    const { data, error } = await this.client.rpc('get_incident_details', { target_id: id });
    if (error) throw new Error(error.message);

    const row = (data ?? [])[0] as Record<string, any> | undefined;
    if (!row) return null;

    return {
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      category: row.category,
      severity: clampSeverity(row.severity),
      status: row.status,
      confirmations: row.confirmations,
      disputes: Number(row.disputes ?? 0),
      reporter_verified: Boolean(row.reporter_verified),
      // Anonymous, viewer-specific eligibility (migration 0007) — never a reporter identity.
      viewer_is_reporter: Boolean(row.viewer_is_reporter),
      can_vote: Boolean(row.can_vote),
      viewer_vote:
        row.viewer_vote === 'confirm' || row.viewer_vote === 'dispute' ? row.viewer_vote : null,
      created_at: row.created_at,
      lng: row.lng,
      lat: row.lat,
      photo_path: row.photo_path ?? null,
    };
  }

  async create(input: {
    reporterId: string;
    title: string;
    description?: string | null;
    category: Category;
    severity: Severity;
    lat: number;
    long: number;
    photoPath?: string | null;
    ttlHours?: number;
  }): Promise<Incident> {
    const expiresAt = input.ttlHours
      ? new Date(Date.now() + input.ttlHours * 3_600_000).toISOString()
      : undefined;
    // PostGIS geography written as EWKT; the column casts text → geography.
    const location = `SRID=4326;POINT(${input.long} ${input.lat})`;

    const { data, error } = await this.client
      .from('incidents')
      .insert({
        reporter_id: input.reporterId,
        title: input.title,
        description: input.description ?? null,
        category: input.category,
        severity: input.severity,
        location,
        photo_path: input.photoPath ?? null,
        ...(expiresAt ? { expires_at: expiresAt } : {}),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const row = data as Record<string, any>;
    return {
      id: row.id,
      reporterId: row.reporter_id ?? null,
      title: row.title,
      description: row.description ?? null,
      category: row.category,
      severity: clampSeverity(row.severity),
      status: row.status,
      // location comes back as an encoded geography; echo the input coordinates.
      lat: input.lat,
      long: input.long,
      photoPath: row.photo_path ?? null,
      confirmations: row.confirmations ?? 0,
      createdAt: row.created_at,
      expiresAt: row.expires_at ?? null,
    };
  }

  async confirm(
    id: string,
    _userId: string,
    kind: ConfirmationKind,
  ): Promise<{ id: string; confirmations: number; status: IncidentStatus }> {
    // The restricted privileged RPC derives identity from auth.uid(), validates the caller,
    // and never trusts a user id or thresholds from arguments.
    const { data, error } = await this.client.rpc('confirm_incident', {
      target_id: id,
      kind,
    });
    if (error) throw new Error(error.message);

    const row = ((data ?? [])[0] ?? {}) as Record<string, any>;
    return {
      id: row.id ?? id,
      confirmations: row.confirmations ?? 0,
      status: row.status,
    };
  }

  async findAlertRecipients(input: { incidentId: string }): Promise<AlertRecipient[]> {
    // Canonical flat matcher: get_alert_matches returns one (user_id, contact_id,
    // phone_e164) row per accepted contact of every user whose alert rule matched
    // (severity ≥ min_severity AND ST_DWithin(incident.location, center, radius)). Group by user.
    const { data, error } = await this.client.rpc('get_alert_matches', {
      target_incident: input.incidentId,
    });
    if (error) throw new Error(error.message);

    const byUser = new Map<string, AlertRecipient>();
    for (const row of (data ?? []) as Array<Record<string, any>>) {
      const recipient: AlertRecipient = byUser.get(row.user_id) ?? {
        userId: row.user_id,
        contacts: [],
      };
      recipient.contacts.push({ id: row.contact_id, phone: row.phone_e164 });
      byUser.set(row.user_id, recipient);
    }
    return [...byUser.values()];
  }
}
