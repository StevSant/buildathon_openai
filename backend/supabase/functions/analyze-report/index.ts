import OpenAI from "openai";
import { OpenAIVisionAnalyzer, FakeAnalyzer } from "@pulso/adapters";
import { makeAnalyzeReport } from "@pulso/core";
import { corsHeaders } from "../_shared/cors.ts";
import { getEnv } from "../_shared/env.ts";
import { userFromJwt } from "../_shared/auth.ts";

// Composition root: authorize → pick analyzer → run makeAnalyzeReport.
// Uses OpenAI vision when OPENAI_API_KEY is set; FakeAnalyzer keeps local dev offline.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const env = getEnv();
    await userFromJwt(req); // authorize (user id isn't needed by the analyze use-case)
    // CONTRACT §4: the request body is { photo_path } (snake_case).
    const { photo_path: photoPath } = await req.json();

    const analyzer = env.openaiApiKey
      ? new OpenAIVisionAnalyzer(
          new OpenAI({ apiKey: env.openaiApiKey, baseURL: env.openaiBaseUrl }),
          env.openaiVisionModel,
        )
      : new FakeAnalyzer();

    // The report-photos bucket is public-read for the demo, so build the URL to fetch.
    const imageUrl = `${env.supabaseUrl}/storage/v1/object/public/report-photos/${photoPath}`;

    const analyzeReport = makeAnalyzeReport({ analyzer });
    const result = await analyzeReport({ imageUrl });

    return Response.json(result, { headers: corsHeaders });
  } catch (err) {
    // CONTRACT §4: non-2xx responses always use the { error } envelope.
    const message = err instanceof Error ? err.message : "error";
    const status = message === "unauthorized" ? 401 : 400;
    return Response.json({ error: message }, { status, headers: corsHeaders });
  }
});
