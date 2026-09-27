const { error } = require("./http.cjs");
async function structuredJSON(
  { instructions, context, schema, name, model },
  { fetchImpl = fetch, env = process.env } = {},
) {
  if (!env.OPENAI_API_KEY)
    throw error(
      503,
      "AI generation is not configured in this environment yet.",
    );
  let response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: model || env.OPENAI_GRAMMAR_MODEL || "gpt-5-mini",
        store: false,
        instructions,
        input: JSON.stringify(context),
        reasoning: { effort: "low" },
        max_output_tokens: 6000,
        text: {
          format: {
            type: "json_schema",
            name,
            strict: true,
            schema,
          },
        },
      }),
    });
  } catch {
    throw error(504, "AI generation took too long. Please retry.");
  }
  if (!response.ok)
    throw error(
      response.status === 429 ? 429 : 502,
      response.status === 429
        ? "AI generation is busy. Please wait a minute and retry."
        : "AI generation is temporarily unavailable. Please retry later.",
    );
  let data;
  try {
    data = await response.json();
  } catch {
    throw error(
      502,
      "AI generation returned an invalid response. Please retry.",
    );
  }
  if (data.status !== "completed")
    throw error(502, "AI generation could not finish. Please retry.");
  const content = (data.output || [])
    .filter((x) => x.type === "message")
    .flatMap((x) => x.content || []);
  if (content.some((x) => x.type === "refusal"))
    throw error(
      422,
      "This request could not be completed. Try changing your input.",
    );
  let result;
  try {
    const raw = content
      .filter((x) => x.type === "output_text")
      .map((x) => x.text)
      .join("");
    if (raw.length > 32000) throw Error();
    result = JSON.parse(raw);
  } catch {
    throw error(
      502,
      "AI generation returned an invalid response. Please retry.",
    );
  }
  return result;
}
module.exports = { structuredJSON };
