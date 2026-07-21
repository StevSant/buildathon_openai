import { config } from "./config";
import { supabase } from "./supabase";

// The browser bridge for the voice agent "Cerca".
//
// Flow (see ARCHITECTURE §3.3): ask create-realtime-session for an ephemeral client secret,
// open a WebRTC connection straight to OpenAI Realtime (audio never touches our servers),
// and when the model emits a function call, bridge it to the Supabase agent-tools function,
// then feed the result back into the conversation. OpenAI never calls Supabase directly.

export type AssistantStatus = "connecting" | "listening" | "error" | "closed";

export interface AssistantCallbacks {
  onStatus?: (status: AssistantStatus) => void;
  onUserTranscript?: (text: string) => void;
  onAgentTranscript?: (text: string) => void;
  onToolCall?: (toolName: string) => void;
}

export interface AssistantHandle {
  stop: () => void;
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("No hay sesión activa");
  return token;
}

// Mint the ephemeral OpenAI client secret via our edge function (authorized by the user JWT).
async function mintClientSecret(personaId: string): Promise<{
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
  });
  if (!res.ok) throw new Error(`create-realtime-session falló: ${res.status}`);
  return res.json();
}

// Execute one tool call against Supabase agent-tools. The user's location is injected here
// (not by the model). user_id is derived server-side from the JWT.
async function runTool(
  toolName: string,
  args: Record<string, unknown>,
  location: { lat: number; long: number },
): Promise<unknown> {
  const res = await fetch(`${config.functionsUrl}/agent-tools`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await accessToken()}`,
    },
    body: JSON.stringify({
      tool: toolName,
      arguments: { ...args, user_lat: location.lat, user_long: location.long },
    }),
  });
  if (!res.ok) throw new Error(`agent-tools (${toolName}) falló: ${res.status}`);
  return res.json();
}

export async function startRealtimeSession(
  personaId: string,
  location: { lat: number; long: number },
  callbacks: AssistantCallbacks = {},
): Promise<AssistantHandle> {
  callbacks.onStatus?.("connecting");

  const { clientSecret, model } = await mintClientSecret(personaId);

  const pc = new RTCPeerConnection();
  const audioEl = document.createElement("audio");
  audioEl.autoplay = true;
  pc.ontrack = (event) => {
    audioEl.srcObject = event.streams[0];
  };

  // Local microphone → OpenAI.
  const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
  mic.getTracks().forEach((track) => pc.addTrack(track, mic));

  const dc = pc.createDataChannel("oai-events");

  dc.onopen = () => {
    callbacks.onStatus?.("listening");
    // Inject location as a context message (NOT session.update, which would overwrite the
    // server-set persona instructions). Exact coordinates are never read aloud.
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
    };
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    // Surface transcripts for the on-screen conversation.
    if (msg.type === "response.audio_transcript.done" && msg.transcript) {
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
      const args = msg.arguments ? JSON.parse(msg.arguments) : {};
      let output: unknown;
      try {
        output = await runTool(msg.name, args, location);
      } catch (err) {
        output = { error: String(err) };
      }
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
      dc.send(JSON.stringify({ type: "response.create" }));
    }
  };

  // WebRTC handshake with OpenAI Realtime using the ephemeral client secret.
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const sdpRes = await fetch(`${config.openaiRealtimeUrl}?model=${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${clientSecret}`,
      "Content-Type": "application/sdp",
    },
    body: offer.sdp,
  });
  if (!sdpRes.ok) {
    callbacks.onStatus?.("error");
    throw new Error(`Handshake WebRTC con OpenAI falló: ${sdpRes.status}`);
  }
  await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });

  return {
    stop: () => {
      mic.getTracks().forEach((track) => track.stop());
      dc.close();
      pc.close();
      callbacks.onStatus?.("closed");
    },
  };
}
