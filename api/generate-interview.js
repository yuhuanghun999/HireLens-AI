export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const {
    jd = "",
    resume = "",
    roleProfile = null,
    candidateProfile = null,
    inputLanguage = "auto",
    outputLanguage = "auto"
  } = req.body || {};

  if (!candidateProfile) {
    return res.status(400).json({
      error: "Candidate assessment is required."
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
Detect the dominant language of the role and candidate information.
If primarily Chinese, output Simplified Chinese.
If primarily English, output English.
`;
  }

  const roleText = roleProfile
    ? JSON.stringify(roleProfile)
    : "No role profile is available.";

  const candidateText =
    JSON.stringify(candidateProfile);

  const jdText =
    typeof jd === "string"
      ? jd.substring(0, 20000)
      : "";

  const resumeText =
    typeof resume === "string"
      ? resume.substring(0, 20000)
      : "";

  const prompt = `
Generate structured interview questions based on the
candidate assessment and evidence gaps.

${languageInstruction}

You are an evidence-based interview design assistant.

Generate 5 to 7 practical interview questions.

Focus primarily on:

- evidence gaps
- verification areas
- important competencies
- unclear claims
- job-relevant experience

Prefer STAR-style questions.

Questions should encourage the candidate to explain:

Situation
Task
Action
Result

Do not ask about:

- age
- gender
- ethnicity
- religion
- disability
- health
- pregnancy
- marital status
- family plans
- sexual orientation
- other protected characteristics

Do not make a hiring recommendation.

Do not label the candidate as hire or reject.

Do not invent candidate information.

Return JSON only.

Use EXACTLY this structure:

{
  "questions": [
    {
      "question": "",
      "competency": "",
      "whyThisQuestion": "",
      "evidenceGap": "",
      "listenFor": ""
    }
  ]
}

ROLE PROFILE:

${roleText}

CANDIDATE ASSESSMENT:

${candidateText}

JOB DESCRIPTION:

${jdText}

RESUME:

${resumeText}
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
You are an evidence-based interview design assistant.

You MUST return valid JSON.

Do not output Markdown.

Do not output explanations outside the JSON object.

Generate non-discriminatory,
job-relevant interview questions.

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
        "Invalid interview JSON:",
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
      !Array.isArray(result.questions)
    ) {
      return res.status(500).json({
        error:
          "DeepSeek returned no valid interview questions."
      });
    }

    return res.status(200).json(result);

  } catch (error) {

    console.error(
      "Interview generation error:",
      error
    );

    return res.status(500).json({
      error:
        "Unable to generate interview questions.",
      detail:
        error.message
    });
  }
}
