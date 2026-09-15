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

  /*
   * Determine output-language instruction.
   *
   * Important:
   * If the user selects:
   * Input = Auto Detect
   * Output = Same as Input
   *
   * We ask the model to detect the dominant input language
   * instead of incorrectly forcing Chinese or English.
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
Detect the dominant language of the job description.

If the job description is primarily Chinese,
write ALL user-facing textual fields in Simplified Chinese.

If the job description is primarily English,
write ALL user-facing textual fields in English.

If the input is mixed Chinese and English,
use the dominant language of the input unless the user explicitly requested another output language.
`;
  }

  const inputInstruction =
    inputLanguage === "zh"
      ? "The user indicates that the input is primarily Chinese."
      : inputLanguage === "en"
        ? "The user indicates that the input is primarily English."
        : "The input language is not fixed. Automatically understand whether it is Chinese, English, or mixed-language.";

  const prompt = `
You are an evidence-based recruitment analysis assistant.

Your task is to analyze a job description and convert it into a structured role profile.

${inputInstruction}

${outputInstruction}

IMPORTANT RULES:

1. Understand the meaning of the job description regardless of language.

2. Use ONLY information supported by the job description.

3. Do not invent responsibilities, requirements, skills, or qualifications.

4. Do not infer protected characteristics.

5. Do not evaluate:
   - gender
   - age
   - ethnicity
   - religion
   - disability
   - health status
   - sexual orientation
   - family status
   - other protected characteristics

6. Do not make a hiring recommendation.

7. If the job description does not provide enough information for a field,
   clearly indicate insufficient evidence instead of inventing information.

8. Competency weights must be whole-number percentages.

9. Competency weights should add up to exactly 100.

10. Return valid JSON only.

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
You are a professional evidence-based recruitment analysis assistant.

Always return valid JSON.

Never make unsupported claims.

Never make hiring or rejection decisions.

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

          max_tokens: 2400
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
        "JSON parse error:",
        parseError
      );

      return res.status(500).json({
        error:
          "The AI returned invalid JSON."
      });
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
