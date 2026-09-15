export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const {
    jd,
    resume,
    roleProfile = null,
    inputLanguage = "auto",
    outputLanguage = "auto"
  } = req.body || {};

  if (!jd || typeof jd !== "string") {
    return res.status(400).json({
      error: "Job description is required."
    });
  }

  if (!resume || typeof resume !== "string") {
    return res.status(400).json({
      error: "Resume is required."
    });
  }

  if (jd.length > 20000 || resume.length > 20000) {
    return res.status(413).json({
      error: "Input is too long."
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
ALL textual output must be written in Simplified Chinese.
`;
  } else if (outputLanguage === "en") {
    languageInstruction = `
ALL textual output must be written in English.
`;
  } else {
    languageInstruction = `
Detect the dominant language of the input.
If primarily Chinese, output Simplified Chinese.
If primarily English, output English.
`;
  }

  const roleText = roleProfile
    ? JSON.stringify(roleProfile)
    : "No pre-analyzed role profile is available.";

  const prompt = `
Assess the candidate against the job description.

${languageInstruction}

You are an evidence-based recruitment assessment assistant.

Use ONLY evidence supported by the job description and resume.

Do not invent experience, skills, qualifications, or achievements.

Do not infer:

- age
- gender
- ethnicity
- nationality
- religion
- disability
- health status
- sexual orientation
- family status
- pregnancy
- other protected characteristics

Do not make a hiring or rejection recommendation.

If evidence is missing, identify it as an evidence gap.
Do not treat missing evidence as automatically negative.

Return JSON only.

Use EXACTLY this structure:

{
  "candidateName": "",
  "overallScore": 0,
  "fitLabel": "",
  "summary": "",
  "dimensions": [
    {
      "name": "",
      "weight": 0,
      "score": 0,
      "evidence": ""
    }
  ],
  "strengths": [],
  "evidenceGaps": [],
  "verificationAreas": []
}

Rules:

- overallScore must be an integer from 0 to 100.
- dimension score must be from 0 to 100.
- dimension weights must be integers.
- dimension weights must add up to exactly 100.
- Scores must reflect job-relevant evidence only.
- Keep evidence specific.
- Do not make a final hiring decision.

ROLE PROFILE:

${roleText}

JOB DESCRIPTION:

${jd}

RESUME:

${resume}
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
You are an evidence-based candidate assessment assistant.

You MUST return valid JSON.

Do not output Markdown.

Do not output explanations outside the JSON object.

Use only job-relevant evidence.

Never infer protected characteristics.

Never make a hiring or rejection decision.

Follow the requested output language.
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
        "Invalid candidate JSON:",
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

    if (
      !Array.isArray(result.dimensions)
    ) {
      result.dimensions = [];
    }

    if (
      !Array.isArray(result.strengths)
    ) {
      result.strengths = [];
    }

    if (
      !Array.isArray(result.evidenceGaps)
    ) {
      result.evidenceGaps = [];
    }

    if (
      !Array.isArray(result.verificationAreas)
    ) {
      result.verificationAreas = [];
    }

    return res.status(200).json(result);

  } catch (error) {

    console.error(
      "Candidate assessment error:",
      error
    );

    return res.status(500).json({
      error:
        "Unable to assess the candidate.",
      detail:
        error.message
    });
  }
}
