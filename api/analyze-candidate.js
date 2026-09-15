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

  /*
   * Output language
   */

  let outputInstruction = "";

  if (outputLanguage === "zh") {
    outputInstruction = `
Write ALL user-facing textual fields in Simplified Chinese.
Do not output English explanations.
`;
  } else if (outputLanguage === "en") {
    outputInstruction = `
Write ALL user-facing textual fields in English.
Do not output Chinese explanations.
`;
  } else {
    outputInstruction = `
Automatically detect the dominant language of the input.

If the input is primarily Chinese,
write ALL user-facing textual fields in Simplified Chinese.

If the input is primarily English,
write ALL user-facing textual fields in English.

If the input contains both Chinese and English,
use the dominant language unless another output language is explicitly requested.
`;
  }

  /*
   * Input language
   */

  const inputInstruction =
    inputLanguage === "zh"
      ? "The user indicates that the input is primarily Chinese."
      : inputLanguage === "en"
        ? "The user indicates that the input is primarily English."
        : "The input may be Chinese, English, or mixed-language. Automatically understand the language.";

  /*
   * Existing role profile
   */

  const roleText = roleProfile
    ? JSON.stringify(roleProfile)
    : "No previously analyzed role profile is available.";

  const prompt = `
You are an evidence-based candidate assessment assistant.

Your task is to assess a candidate against a job description.

${inputInstruction}

${outputInstruction}

IMPORTANT RULES:

1. Assess ONLY job-relevant evidence.

2. Compare the candidate's resume against the actual requirements
   contained in the job description.

3. Do not invent experience, skills, education, achievements,
   responsibilities, or qualifications.

4. Do not infer information that is not explicitly supported.

5. Do NOT use or infer:
   - gender
   - age
   - ethnicity
   - nationality
   - religion
   - disability
   - health status
   - sexual orientation
   - family status
   - pregnancy
   - other protected characteristics

6. Do not make a final hiring recommendation.

7. Do not say:
   - Hire
   - Reject
   - Strong hire
   - Strong reject

8. If evidence is missing, say "Insufficient Evidence"
   in the requested output language.

9. Missing evidence must NOT automatically be treated as negative evidence.

10. Scores should reflect job-relevant evidence only.

11. Overall score must be an integer from 0 to 100.

12. Competency weights must be whole-number percentages.

13. Competency weights should add up to exactly 100.

14. Evidence must be specific and traceable to the resume
    or job description.

15. Return valid JSON only.

Use exactly this structure:

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
You are a professional evidence-based recruitment assessment assistant.

Always return valid JSON.

Use only job-relevant evidence.

Never infer protected characteristics.

Never make a hiring or rejection decision.

When evidence is missing, explicitly identify the evidence gap.

Follow the requested output language exactly.
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

          max_tokens: 2800
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "DeepSeek request failed."
      });
    }

    const content =
      data?.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(500).json({
        error: "DeepSeek returned an empty response."
      });
    }

    let result;

    try {
      result = JSON.parse(content);
    } catch (parseError) {
      console.error(
        "Candidate JSON parse error:",
        parseError
      );

      return res.status(500).json({
        error: "The AI returned invalid JSON."
      });
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error(
      "Analyze candidate error:",
      error
    );

    return res.status(500).json({
      error: "Unable to assess the candidate.",
      detail: error.message
    });
  }
}
