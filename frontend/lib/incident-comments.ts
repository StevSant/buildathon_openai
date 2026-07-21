import type { IncidentComment } from "@pulso/core";
import { supabase } from "./supabase";

type IncidentCommentRow = {
  id: string;
  body: string;
  created_at: string;
  author_verified: boolean;
};

// Fetch anonymous comments for one active incident through the restricted public RPC.
export async function getIncidentComments(
  incidentId: string,
): Promise<IncidentComment[]> {
  const { data, error } = await supabase.rpc("get_incident_comments", {
    target_id: incidentId,
  });
  if (error) throw error;
  return (data ?? []) as IncidentComment[];
}

// Create a comment; the server derives author identity from the authenticated session.
export async function addIncidentComment(
  incidentId: string,
  body: string,
): Promise<IncidentComment> {
  const { data, error } = await supabase.rpc("add_incident_comment", {
    target_id: incidentId,
    comment_body: body,
  });
  if (error) throw error;

  const row = ((Array.isArray(data) ? data[0] : data) ?? {}) as Partial<IncidentCommentRow>;
  if (!row.id || !row.body || !row.created_at) {
    throw new Error("No se pudo publicar el comentario.");
  }

  return {
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    author_verified: Boolean(row.author_verified),
  };
}
