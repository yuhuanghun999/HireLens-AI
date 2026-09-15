export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const {
    jd,
    inputLanguage = "auto",
    outputLanguage = "auto"
  } = req.body || {};

  if (!jd || typeof jd !== "string") {
    return res.status(400).json({
      error: "Job description is required."
    });
  }

  if (jd.length > 20000) {
    return res.status(413).json({
      error: "Job description is too long."
    });
  }

  const key = process.env.DEEPSEEK_API_KEY;

  if (!key) {
    return res.status(500).json({
      error: "DEEPSEEK_API_KEY is not configured."
    });
  }

  let outputInstruction;

  if (outputLanguage === "zh") {
    outputInstruction = `
ALL textual output must be written in Simplified Chinese.
`;
  } else if (outputLanguage === "en") {
    outputInstruction = `
ALL textual output must be written in English.
`;
  } else {
    outputInstruction = `
Automatically detect the dominant language of the job description.
If Chinese, output Simplified Chinese.
If English, output English.
`;
  }

  const inputInstruction =
    inputLanguage === "zh"
      ? "The job description is primarily Chinese."
      : inputLanguage === "en"
        ? "The job description is primarily English."
        : "The job description may be Chinese, English, or mixed.";

  const prompt = `
Analyze the following job description.

${inputInstruction}

${outputInstruction}

You are an evidence-based recruitment analysis assistant.

Use ONLY information supported by the job description.

Do not invent requirements.

Do not infer:
- age
- gender
- ethnicity
- religion
- disability
- health status
- sexual orientation
- family status
- other protected characteristics

Do not make hiring recommendations.

If information is missing, explicitly identify insufficient evidence.

Return JSON only.

The response MUST follow this exact structure:

{
  "roleTitle": "",
  "roleSummary": "",
  "coreResponsibilities": [],
  "mustHaveRequirements": [],
  "preferredRequirements": [],
  "competencies": [
    {
      "name": "",
      "weight": 0,
      "reason": ""
    }
  ],
  "evidenceSignals": [],
  "insufficientEvidenceAreas": []
}

Competency weights must be whole-number percentages
and must add up to exactly 100.

JOB DESCRIPTION:

${jd}
`;

  try {
    const response = await fetch(
      "https://api.deepseek.com/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`
        },

        body: JSON.stringify({
          model: "deepseek-v4-flash",

          messages: [
            {
              role: "system",
              content: `
You are an evidence-based recruitment analysis assistant.

Return JSON only.

The user expects a valid JSON object matching
the schema provided in the user prompt.

Never make unsupported claims.
`
            },
            {
              role: "user",
              content: prompt
            }
          ],

          response_format: {
            type: "json_object"
          },

          stream: false,

          max_tokens: 4000
        })
      }
    );

    const data = await response.json();

    console.log(
      "DeepSeek response:",
      JSON.stringify(data)
    );

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "DeepSeek request failed.",
        deepseek: data
      });
    }

    const choice = data?.choices?.[0];

    if (!choice) {
      return res.status(500).json({
        error: "DeepSeek returned no choices.",
        deepseek: data
      });
    }

    const content =
      choice?.message?.content;

    /*
     * DeepSeek JSON mode can occasionally return
     * an empty content field.
     *
     * We return the actual API information instead
     * of hiding the problem behind "empty response".
     */

    if (!content) {
      return res.status(500).json({
        error: "DeepSeek returned empty content.",
        finishReason:
          choice?.finish_reason || null,
        reasoningContent:
          choice?.message?.reasoning_content || null,
        deepseek: data
      });
    }

    let result;

    try {
      result = JSON.parse(content);
    } catch (parseError) {

      console.error(
        "JSON parse error:",
        parseError
      );

      return res.status(500).json({
        error: "DeepSeek returned invalid JSON.",
        raw: content
      });
    }

    return res.status(200).json(result);

  } catch (error) {

    console.error(
      "Analyze role error:",
      error
    );

    return res.status(500).json({
      error: "Unable to analyze the role.",
      detail: error.message
    });
  }
}
