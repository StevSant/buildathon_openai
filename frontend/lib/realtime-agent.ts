import { config } from "./config";
import { supabase } from "./supabase";
import { ToolError } from "./tool-error";

// The browser bridge for the voice agent "Cerca".
//
// Flow (see ARCHITECTURE §3.3): ask create-realtime-session for an ephemeral client secret,
// open a WebRTC connection straight to OpenAI Realtime (audio never touches our servers),
// and when the model emits a function call, bridge it to the Supabase agent-tools function,
// then feed the result back into the conversation. OpenAI never calls Supabase directly.

export type AssistantStatus =
  | "connecting"
  | "ready"
  | "listening"
  | "speaking"
  | "error"
  | "closed";

export interface AssistantCallbacks {
  onStatus?: (status: AssistantStatus) => void;
  onUserTranscript?: (text: string) => void;
  onAgentTranscript?: (text: string) => void;
  onToolCall?: (toolName: string) => void;
  /** Fires with the raw tool result so the UI can render rich cards, not just text. */
  onToolResult?: (
    toolName: string,
    result: unknown,
    args: Record<string, unknown>,
  ) => void;
  /** Fires when the Realtime session reports an error event over the data channel. */
  onError?: (message: string) => void;
}

export interface AssistantHandle {
  stop: () => void;
  /** Send a typed question into the live conversation (queued until the channel opens). */
  sendText: (text: string) => void;
  /** Open the microphone for one intentional hold-to-talk turn. */
  startVoiceTurn: () => boolean;
  /** Mute and submit the active hold-to-talk turn. */
  finishVoiceTurn: () => boolean;
}

const BRIEF_RESPONSE_INSTRUCTIONS =
  "Responde en español de Ecuador con una o dos frases cortas. Prioriza solo lo más urgente o cercano. No enumeres todos los incidentes: el mapa y las tarjetas ya muestran el resto. No repitas información de respuestas anteriores.";

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("No hay sesión activa");
  return token;
}

// Mint the ephemeral OpenAI client secret via our edge function (authorized by the user JWT).
async function mintClientSecret(
  personaId: string,
  signal: AbortSignal,
): Promise<{
  clientSecret: string;
  model: string;
}> {
  const res = await fetch(`${config.functionsUrl}/create-realtime-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await accessToken()}`,
    },
    body: JSON.stringify({ personaId }),
    signal,
  });
  if (!res.ok) throw new Error(`create-realtime-session falló: ${res.status}`);
  return res.json();
}

// Read the frozen `{ error }` envelope (CONTRACT §4) from a non-2xx response, tolerating a
// missing or malformed body. The message is for diagnostics only — never surfaced verbatim.
async function readErrorEnvelope(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    if (
      typeof body === "object" &&
      body !== null &&
      typeof (body as { error?: unknown }).error === "string"
    ) {
      return (body as { error: string }).error;
    }
  } catch {
    // No JSON body — fall through to null.
  }
  return null;
}

// Execute one tool call against Supabase agent-tools. The user's location is injected here
// (not by the model). user_id is derived server-side from the JWT. A non-2xx response is
// turned into a ToolError that preserves the server envelope and status for classification.
async function runTool(
  toolName: string,
  args: Record<string, unknown>,
  location: { lat: number; long: number },
  signal: AbortSignal,
): Promise<unknown> {
  const res = await fetch(`${config.functionsUrl}/agent-tools`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await accessToken()}`,
    },
    body: JSON.stringify({
      tool: toolName,
      // The bridge injects the user's real location (never the model). agent-tools reads
      // user_lat/user_long (CONTRACT §5); only get_nearby_incidents uses them, extra keys
      // are ignored.
      arguments: { ...args, user_lat: location.lat, user_long: location.long },
    }),
    signal,
  });
  if (!res.ok) {
    throw new ToolError({
      toolName,
      status: res.status,
      serverError: await readErrorEnvelope(res),
    });
  }
  return res.json();
}

// The one Spanish state shown when a tool call fails. Derives from the failure class only.
function toolFailureMessage(err: unknown): string {
  if (err instanceof ToolError) return err.userMessage;
  return "No pude completar esa consulta. Intenta de nuevo.";
}

// Diagnostic log for a failed tool call. Deliberately excludes credentials and the user's
// precise coordinates (they live in runTool, never in `args`); keeps the tool name, status,
// server message, and the arguments needed to tell validation errors apart (CONTRACT §4-5).
function logToolFailure(
  toolName: string,
  args: Record<string, unknown>,
  err: unknown,
): void {
  console.warn("[Cerca] agent-tools call failed", {
    tool: toolName,
    status: err instanceof ToolError ? err.status : null,
    serverError:
      err instanceof ToolError
        ? err.serverError
        : err instanceof Error
          ? err.message
          : "error",
    radius_meters:
      typeof args.radius_meters === "number" ? args.radius_meters : undefined,
    filter_category:
      typeof args.filter_category === "string" ? args.filter_category : undefined,
    incident_id:
      typeof args.incident_id === "string" ? args.incident_id : undefined,
    kind:
      args.kind === "confirm" || args.kind === "dispute" ? args.kind : undefined,
  });
}


export async function startRealtimeSession(
  personaId: string,
  location: { lat: number; long: number },
  callbacks: AssistantCallbacks = {},
  signal?: AbortSignal,
): Promise<AssistantHandle> {
  callbacks.onStatus?.("connecting");

  const requestController = new AbortController();
  const abortRequests = () => requestController.abort(signal?.reason);
  if (signal?.aborted) abortRequests();
  signal?.addEventListener("abort", abortRequests, { once: true });

  let clientSecret: string;
  let model: string;
  try {
    ({ clientSecret, model } = await mintClientSecret(
      personaId,
      requestController.signal,
    ));
  } catch (error) {
    signal?.removeEventListener("abort", abortRequests);
    throw error;
  }

  const pc = new RTCPeerConnection();
  const audioEl = document.createElement("audio");
  audioEl.autoplay = true;
  pc.ontrack = (event) => {
    audioEl.srcObject = event.streams[0];
  };

  // Local microphone → OpenAI.
  let mic: MediaStream;
  try {
    mic = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (error) {
    signal?.removeEventListener("abort", abortRequests);
    pc.close();
    throw error;
  }
  if (requestController.signal.aborted) {
    mic.getTracks().forEach((track) => track.stop());
    signal?.removeEventListener("abort", abortRequests);
    pc.close();
    throw requestController.signal.reason;
  }
  const micTracks = mic.getAudioTracks();
  micTracks.forEach((track) => {
    track.enabled = false;
  });
  micTracks.forEach((track) => pc.addTrack(track, mic));

  const dc = pc.createDataChannel("oai-events");
  let cleanedUp = false;
  let sessionConfigured = false;

  function cleanup(notifyClosed: boolean) {
    if (cleanedUp) return;
    cleanedUp = true;
    requestController.abort();
    signal?.removeEventListener("abort", abortRequests);
    signal?.removeEventListener("abort", abortSession);
    voiceTurnActive = false;
    mic.getTracks().forEach((track) => track.stop());
    audioEl.srcObject = null;
    dc.onclose = null;
    dc.onerror = null;
    pc.onconnectionstatechange = null;
    if (dc.readyState !== "closed") dc.close();
    if (pc.connectionState !== "closed") pc.close();
    if (notifyClosed) callbacks.onStatus?.("closed");
  }

  const abortSession = () => cleanup(true);
  signal?.removeEventListener("abort", abortRequests);
  signal?.addEventListener("abort", abortSession, { once: true });

  // Typed questions (suggestion chips) are serialized: the Realtime API allows only one
  // active response per conversation, so a question queues while a response is generating
  // (or a tool call is being bridged) and flushes one at a time on response.done. Questions
  // tapped before the channel opens also wait here, so a chip can start the session and
  // ask in one gesture.
  const pendingTexts: string[] = [];
  let responseActive = false;
  let outputAudioActive = false;
  let toolCallsInFlight = 0;
  let toolContinuationPending = false;
  let voiceTurnActive = false;

  function disableMicrophone() {
    micTracks.forEach((track) => {
      track.enabled = false;
    });
  }

  function restoreReadyWhenIdle() {
    if (
      !sessionConfigured ||
      responseActive ||
      outputAudioActive ||
      voiceTurnActive ||
      toolCallsInFlight > 0 ||
      toolContinuationPending
    ) {
      return;
    }
    disableMicrophone();
    callbacks.onStatus?.("ready");
  }

  function createBriefResponse() {
    responseActive = true;
    disableMicrophone();
    callbacks.onStatus?.("speaking");
    dc.send(
      JSON.stringify({
        type: "response.create",
        response: { instructions: BRIEF_RESPONSE_INSTRUCTIONS },
      }),
    );
  }

  function startVoiceTurn(): boolean {
    if (
      !sessionConfigured ||
      voiceTurnActive ||
      toolCallsInFlight > 0 ||
      toolContinuationPending ||
      dc.readyState !== "open"
    ) {
      return false;
    }

    dc.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
    if (responseActive) {
      dc.send(JSON.stringify({ type: "response.cancel" }));
    }
    if (outputAudioActive) {
      dc.send(JSON.stringify({ type: "output_audio_buffer.clear" }));
    }

    responseActive = false;
    outputAudioActive = false;
    voiceTurnActive = true;
    micTracks.forEach((track) => {
      if (track.readyState === "live") track.enabled = true;
    });
    callbacks.onStatus?.("listening");
    return true;
  }

  function finishVoiceTurn(): boolean {
    if (!voiceTurnActive) return false;

    voiceTurnActive = false;
    disableMicrophone();
    if (dc.readyState !== "open") return false;

    dc.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    createBriefResponse();
    return true;
  }

  function sendUserText(text: string) {
    dc.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      }),
    );
    createBriefResponse();
  }

  function createToolContinuationWhenReady() {
    if (
      !sessionConfigured ||
      !toolContinuationPending ||
      toolCallsInFlight > 0 ||
      responseActive ||
      outputAudioActive ||
      voiceTurnActive ||
      dc.readyState !== "open"
    ) {
      return;
    }
    toolContinuationPending = false;
    createBriefResponse();
  }

  function flushPendingText() {
    if (
      !sessionConfigured ||
      responseActive ||
      outputAudioActive ||
      voiceTurnActive ||
      toolCallsInFlight > 0 ||
      toolContinuationPending ||
      dc.readyState !== "open"
    ) {
      return;
    }
    const next = pendingTexts.shift();
    if (next !== undefined) sendUserText(next);
  }

  dc.onopen = () => {
    dc.send(
      JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          audio: {
            input: {
              turn_detection: null,
            },
          },
        },
      }),
    );
    // Inject location as a context message (NOT session.update, which would overwrite the
    // server-set persona instructions when the instructions field is included). Exact
    // coordinates are never read aloud.
    dc.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Contexto de ubicación: estoy cerca de lat ${location.lat}, long ${location.long}. No leas las coordenadas en voz alta; úsalas solo para las herramientas.`,
            },
          ],
        },
      }),
    );
  };

  dc.onmessage = async (event) => {
    let msg: {
      type?: string;
      name?: string;
      arguments?: string;
      call_id?: string;
      transcript?: string;
      error?: { message?: string };
      response?: {
        status?: string;
        status_details?: { error?: { message?: string } };
      };
    };
    try {
      const parsed: unknown = JSON.parse(event.data);
      if (typeof parsed !== "object" || parsed === null) return;
      msg = parsed;
    } catch {
      return;
    }

    if (msg.type === "session.updated") {
      sessionConfigured = true;
      callbacks.onStatus?.("ready");
      flushPendingText();
      return;
    }

    if (msg.type === "response.created") {
      responseActive = true;
      if (!voiceTurnActive) {
        disableMicrophone();
        callbacks.onStatus?.("speaking");
      }
      return;
    }
    if (
      msg.type === "output_audio_buffer.started" ||
      msg.type === "response.output_audio.delta"
    ) {
      outputAudioActive = true;
      if (!voiceTurnActive) {
        disableMicrophone();
        callbacks.onStatus?.("speaking");
      }
      return;
    }
    if (msg.type === "output_audio_buffer.stopped") {
      outputAudioActive = false;
      restoreReadyWhenIdle();
      createToolContinuationWhenReady();
      flushPendingText();
      return;
    }
    if (
      msg.type === "response.done" ||
      msg.type === "response.cancelled" ||
      msg.type === "response.failed"
    ) {
      responseActive = false;
      if (
        msg.type === "response.done" &&
        (msg.response?.status === "failed" ||
          msg.response?.status === "incomplete")
      ) {
        callbacks.onError?.(
          msg.response.status_details?.error?.message ??
            "La respuesta de Cerca quedó incompleta",
        );
      }
      createToolContinuationWhenReady();
      restoreReadyWhenIdle();
      flushPendingText();
      return;
    }
    if (msg.type === "error") {
      if (!sessionConfigured) {
        callbacks.onError?.(
          msg.error?.message ?? "No se pudo configurar la sesión de voz",
        );
        cleanup(true);
        return;
      }
      responseActive = false;
      outputAudioActive = false;
      voiceTurnActive = false;
      disableMicrophone();
      restoreReadyWhenIdle();
      callbacks.onError?.(msg.error?.message ?? "error de la sesión de voz");
      flushPendingText();
      return;
    }

    // Surface transcripts for the on-screen conversation. GA sessions emit
    // response.output_audio_transcript.done; the beta name is kept as a fallback.
    if (
      (msg.type === "response.output_audio_transcript.done" ||
        msg.type === "response.audio_transcript.done") &&
      msg.transcript
    ) {
      callbacks.onAgentTranscript?.(msg.transcript);
      return;
    }
    if (
      msg.type === "conversation.item.input_audio_transcription.completed" &&
      msg.transcript
    ) {
      callbacks.onUserTranscript?.(msg.transcript);
      return;
    }

    // Bridge a completed function call to agent-tools, then hand the result back.
    if (
      msg.type === "response.function_call_arguments.done" &&
      msg.name &&
      msg.call_id
    ) {
      callbacks.onToolCall?.(msg.name);
      toolCallsInFlight += 1;
      toolContinuationPending = true;
      let output: unknown;
      let parsedArgs: Record<string, unknown> = {};
      try {
        const parsed: unknown = msg.arguments
          ? JSON.parse(msg.arguments)
          : {};
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          throw new Error("Los argumentos de la herramienta no son válidos");
        }
        parsedArgs = parsed as Record<string, unknown>;
        output = await runTool(
          msg.name,
          parsedArgs,
          location,
          requestController.signal,
        );
        callbacks.onToolResult?.(msg.name, output, parsedArgs);
      } catch (err) {
        // A failed tool call must not continue into a confirmation or a normal answer:
        // report it once, log a redacted diagnostic, and hand the model a plain error
        // output so it does not treat the failure as data (issue #12).
        toolContinuationPending = false;
        logToolFailure(msg.name, parsedArgs, err);
        callbacks.onError?.(toolFailureMessage(err));
        output = {
          error:
            err instanceof ToolError
              ? (err.serverError ?? `HTTP ${err.status}`)
              : "tool_call_failed",
        };
      }
      try {
        dc.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: msg.call_id,
              output: JSON.stringify(output),
            },
          }),
        );
      } finally {
        toolCallsInFlight -= 1;
        // Only a successful call keeps toolContinuationPending; on failure this is a no-op
        // and we simply return to idle instead of speaking a phantom answer.
        createToolContinuationWhenReady();
        restoreReadyWhenIdle();
      }
    }
  };

  dc.onclose = () => cleanup(true);
  dc.onerror = () => {
    callbacks.onError?.("Se cerró la conexión de voz");
    cleanup(true);
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") {
      callbacks.onError?.("Se perdió la conexión de voz");
      cleanup(true);
    } else if (pc.connectionState === "closed") {
      cleanup(true);
    }
  };

  // WebRTC handshake with OpenAI Realtime using the ephemeral client secret.
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpRes = await fetch(`${config.openaiRealtimeUrl}?model=${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        "Content-Type": "application/sdp",
      },
      body: offer.sdp,
      signal: requestController.signal,
    });
    if (!sdpRes.ok) {
      callbacks.onStatus?.("error");
      throw new Error(`Handshake WebRTC con OpenAI falló: ${sdpRes.status}`);
    }
    await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });
  } catch (error) {
    cleanup(false);
    throw error;
  }

  return {
    sendText: (text: string) => {
      if (
        sessionConfigured &&
        dc.readyState === "open" &&
        !responseActive &&
        !outputAudioActive &&
        !voiceTurnActive &&
        toolCallsInFlight === 0 &&
        !toolContinuationPending
      ) {
        sendUserText(text);
      } else {
        pendingTexts.push(text);
      }
    },
    startVoiceTurn,
    finishVoiceTurn,
    stop: () => cleanup(true),
  };
}
