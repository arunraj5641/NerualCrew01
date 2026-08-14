/**
 * CIS Audit Dashboard — backend
 *
 * Proxies audit findings to NVIDIA NIM (Nemotron-3-Super-120B) with
 * streaming enabled. The reasoning_content (chain-of-thought) and the
 * final JSON answer are streamed to the browser via SSE so the user
 * sees the AI "thinking" in real time.
 *
 * Events emitted:
 *   thinking  { text: "..." }   — incremental reasoning tokens
 *   chunk     { text: "..." }   — incremental answer tokens
 *   done      { model, executive_summary, risk_score, items, reasoning_preview }
 *   error     { error: "..." }
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY;
const BASE_URL = "https://integrate.api.nvidia.com/v1";
const MODEL = "nvidia/nemotron-3-super-120b-a12b";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const SYSTEM_PROMPT = `You are a senior Linux security auditor specialising in CIS benchmarks.
You will receive a structured CIS-benchmark audit report as JSON containing "summary" and
"findings" fields. For EVERY finding — whether PASS, FAIL, or UNKNOWN — produce a structured
item in your response.

Rules:
- FAIL: provide an exact, runnable remediation command and explain the real-world risk.
- PASS: confirm the control is satisfied with a brief explanation.
- UNKNOWN: explain why it could not be verified and what a sysadmin should check manually.

Respond ONLY with a single valid JSON object (absolutely no markdown fences, no extra prose):
{
  "executive_summary": "3-4 sentence plain-English overview of the host security posture",
  "risk_score": <integer 0-100, where 100 is maximally risky>,
  "items": [
    {
      "rule_id": "<rule_id>",
      "status": "PASS|FAIL|UNKNOWN",
      "severity_hint": "critical|high|medium|low",
      "finding": "plain-English explanation referencing the actual evidence",
      "why_it_matters": "real-world impact (risk for FAIL/UNKNOWN, confirmation for PASS)",
      "fix_command": "exact runnable bash command, or empty string for PASS/UNKNOWN",
      "risk_assessment": "short risk note for FAIL items only, empty string otherwise"
    }
  ]
}
Include ALL findings, preserving every rule_id. Be specific and grounded in the evidence given.
Never invent facts not present in the report.`;

// ── Health ─────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    llmConfigured: Boolean(API_KEY),
    model: MODEL,
    baseUrl: BASE_URL,
  });
});

// ── Analyze (SSE streaming) ─────────────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  const { findings, summary, target, transport, fix_list } = req.body || {};

  if (!Array.isArray(findings) || findings.length === 0) {
    return res.status(400).json({ error: "No findings provided." });
  }
  if (!API_KEY) {
    return res.status(500).json({
      error:
        "Server has no NVIDIA_API_KEY configured. Add it to server/.env and restart.",
    });
  }

  // Establish SSE connection
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const sendEvent = (event, data) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (_) {
      /* client disconnected */
    }
  };

  const payload = {
    target,
    transport,
    summary,
    findings: findings.map((f) => ({
      rule_id: f.rule_id,
      title: f.title,
      status: f.status,
      severity_hint: f.severity_hint,
      evidence: String(f.evidence || "").slice(0, 600),
    })),
    fix_list: (fix_list || []).map((f) => ({
      rule_id: f.rule_id,
      fix_command: f.fix_command,
    })),
  };

  try {
    const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });

    const stream = await client.chat.completions.create({
      model: MODEL,
      temperature: 1,
      top_p: 0.95,
      max_tokens: 16384,
      extra_body: {
        chat_template_kwargs: { enable_thinking: true },
        reasoning_budget: 16384,
      },
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
    });

    let fullContent = "";
    let fullReasoning = "";

    for await (const chunk of stream) {
      if (!chunk.choices?.length) continue;
      const delta = chunk.choices[0].delta;

      const reasoning = delta.reasoning_content;
      const content = delta.content;

      if (reasoning) {
        fullReasoning += reasoning;
        sendEvent("thinking", { text: reasoning });
      }
      if (content != null && content !== "") {
        fullContent += content;
        sendEvent("chunk", { text: content });
      }
    }

    // Parse final JSON answer
    const cleaned = fullContent
      .trim()
      .replace(/^```(json)?/i, "")
      .replace(/```$/m, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.items)) {
      throw new Error("LLM response is missing the required 'items' array.");
    }

    sendEvent("done", {
      model: MODEL,
      reasoning_preview: fullReasoning.slice(0, 1000),
      ...parsed,
    });
  } catch (e) {
    console.error("LLM call failed:", e.message);
    sendEvent("error", { error: `LLM call failed: ${e.message}` });
  }

  res.end();
});

app.listen(PORT, () => {
  console.log(`\n🛡️  CIS Audit Server ready at http://localhost:${PORT}`);
  console.log(`   Model  : ${MODEL}`);
  console.log(`   API key: ${API_KEY ? "✓ configured" : "✗ MISSING — set NVIDIA_API_KEY in server/.env"}`);
});
