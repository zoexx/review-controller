// The review stage. The compiled prompt is the deterministic product; this stage
// is the one model call that turns it into findings. Defaults to dry-run so the
// pipeline runs end-to-end (and stays golden-testable) without an API key or spend.
// Set --run AND ANTHROPIC_API_KEY to actually invoke the model.

export interface ReviewOptions {
  run?: boolean;
  model?: string;
  apiKey?: string;
  maxTokens?: number;
}

export interface ReviewResult {
  mode: string;
  prompt?: string;
  model?: string;
  findings?: string;
}

export async function runReview(prompt: string, opts: ReviewOptions = {}): Promise<ReviewResult> {
  const {
    run = false,
    model = process.env.REVIEW_MODEL || 'claude-opus-4-8',
    apiKey = process.env.ANTHROPIC_API_KEY,
    maxTokens = 4096,
  } = opts;

  if (!run) return { mode: 'dry-run', prompt };
  if (!apiKey) return { mode: 'dry-run (no ANTHROPIC_API_KEY)', prompt };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const findings = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  return { mode: 'review', model, findings };
}
