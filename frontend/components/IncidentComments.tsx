"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { IncidentComment } from "@pulso/core";
import { addIncidentComment, getIncidentComments } from "@/lib";
import Icon from "./Icon";

// Anonymous incident discussion. Names and identifiers intentionally never render here.
export default function IncidentComments({ incidentId }: { incidentId: string }) {
  const [comments, setComments] = useState<IncidentComment[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void getIncidentComments(incidentId)
      .then((rows) => {
        if (active) setComments(rows);
      })
      .catch(() => {
        if (active) setError("No se pudieron cargar los comentarios.");
      });

    return () => {
      active = false;
    };
  }, [incidentId]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const body = draft.trim();
    if (!body || busy) return;

    setBusy(true);
    setError(null);
    try {
      const comment = await addIncidentComment(incidentId, body);
      setComments((current) => [...current, comment]);
      setDraft("");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setError(
        /disabled|row-level security/i.test(message)
          ? "Tu cuenta no puede publicar comentarios."
          : "No se pudo publicar tu comentario. Intenta de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="comments" aria-label="Comentarios del incidente">
      <div className="comments-head">
        <span className="section-label">Comentarios</span>
        <span className="mono">{comments.length}</span>
      </div>

      {comments.length > 0 ? (
        <div className="comments-list">
          {comments.map((comment) => (
            <article key={comment.id} className="comment">
              <span className="comment-mark" aria-hidden="true">
                <Icon name={comment.author_verified ? "ic-check" : "ic-user"} />
              </span>
              <div>
                <p>{comment.body}</p>
                <span className="comment-meta">
                  {comment.author_verified ? "Miembro verificado" : "Miembro de la comunidad"}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="comments-empty">Aún no hay comentarios. Comparte lo que viste.</p>
      )}

      <form className="comment-form" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Escribe un comentario útil para la comunidad"
          maxLength={1000}
          rows={3}
        />
        <div className="comment-form-footer">
          <span>{draft.length}/1000</span>
          <button type="submit" className="btn primary sm" disabled={busy || !draft.trim()}>
            {busy ? "Publicando..." : "Comentar"}
          </button>
        </div>
      </form>

      {error && <p className="comment-error" role="alert">{error}</p>}
    </section>
  );
}
