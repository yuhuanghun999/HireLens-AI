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

  let languageInstruction = "";

  if (outputLanguage === "zh") {
    languageInstruction = `
Output ALL text values in Simplified Chinese.
`;
  } else if (outputLanguage === "en") {
    languageInstruction = `
Output ALL text values in English.
`;
  } else {
    languageInstruction = `
Detect the dominant language of the job description.
If Chinese, output Simplified Chinese.
If English, output English.
`;
  }

  const prompt = `
Analyze this job description.

${languageInstruction}

Return JSON only.

Use exactly this JSON structure:

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

Rules:

- Use only information explicitly supported by the job description.
- Do not invent requirements.
- Do not infer candidate characteristics.
- Do not use age, gender, ethnicity, religion, disability,
  health status, sexual orientation, family status,
  or other protected characteristics.
- Do not make a hiring recommendation.
- Competency weights must be integers.
- Competency weights must add up to 100.
- Return valid JSON.

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
          model: "deepseek-flash",

          messages: [
            {
              role: "system",
              content: `
You are an evidence-based recruitment analysis assistant.

You MUST output valid JSON.

The output must follow the exact JSON structure
provided by the user.

Do not add markdown.
Do not add explanations outside the JSON object.
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

          max_tokens: 8000
        })
      }
    );

    const data = await response.json();

    console.log(
      "DeepSeek status:",
      response.status
    );

    console.log(
      "DeepSeek finish reason:",
      data?.choices?.[0]?.finish_reason
    );

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "DeepSeek request failed."
      });
    }

    const choice = data?.choices?.[0];

    if (!choice) {
      return res.status(500).json({
        error: "DeepSeek returned no choices.",
        details: data
      });
    }

    const content =
      choice?.message?.content;

    const finishReason =
      choice?.finish_reason;

    /*
     * If the model stopped because it reached
     * the token limit, the JSON may have been cut off.
     */

    if (finishReason === "length") {
      return res.status(500).json({
        error:
          "DeepSeek output was truncated.",
        finishReason
      });
    }

    if (!content || !content.trim()) {
      return res.status(500).json({
        error:
          "DeepSeek returned empty content.",
        finishReason
      });
    }

    let result;

    try {
      result = JSON.parse(content);
    } catch (error) {

      console.error(
        "Invalid JSON returned by DeepSeek:",
        content
      );

      return res.status(500).json({
        error:
          "DeepSeek returned invalid JSON.",
        finishReason,
        raw:
          content.substring(0, 3000)
      });
    }

    /*
     * Basic structure validation.
     */

    if (
      !result ||
      typeof result !== "object"
    ) {
      return res.status(500).json({
        error:
          "DeepSeek returned an invalid object."
      });
    }

    if (
      !Array.isArray(
        result.coreResponsibilities
      )
    ) {
      result.coreResponsibilities = [];
    }

    if (
      !Array.isArray(
        result.mustHaveRequirements
      )
    ) {
      result.mustHaveRequirements = [];
    }

    if (
      !Array.isArray(
        result.preferredRequirements
      )
    ) {
      result.preferredRequirements = [];
    }

    if (
      !Array.isArray(
        result.competencies
      )
    ) {
      result.competencies = [];
    }

    if (
      !Array.isArray(
        result.evidenceSignals
      )
    ) {
      result.evidenceSignals = [];
    }

    if (
      !Array.isArray(
        result.insufficientEvidenceAreas
      )
    ) {
      result.insufficientEvidenceAreas = [];
    }

    return res.status(200).json(result);

  } catch (error) {

    console.error(
      "Analyze role error:",
      error
    );

    return res.status(500).json({
      error:
        "Unable to analyze the role.",
      detail:
        error.message
    });
  }
}
