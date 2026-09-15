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

  /*
   * The current V4 frontend primarily sends:
   * roleProfile + candidateProfile.
   *
   * JD and resume are optional here because the previous
   * two AI steps have already transformed the relevant
   * information into structured evidence.
   */

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

  /*
   * Determine output language.
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
Automatically determine the dominant language from the
role profile and candidate assessment.

If they are primarily Chinese,
write ALL user-facing textual fields in Simplified Chinese.

If they are primarily English,
write ALL user-facing textual fields in English.

If the content is mixed,
use the dominant language.
`;
  }

  const inputInstruction =
    inputLanguage === "zh"
      ? "The source information is primarily Chinese."
      : inputLanguage === "en"
        ? "The source information is primarily English."
        : "The source information may be Chinese, English, or mixed-language.";

  /*
   * Convert structured objects into readable JSON.
   */

  const roleText = roleProfile
    ? JSON.stringify(roleProfile, null, 2)
    : "No role profile is available.";

  const candidateText = JSON.stringify(
    candidateProfile,
    null,
    2
  );

  /*
   * Optional raw JD / resume.
   *
   * These are included only if the frontend provides them.
   * This gives the backend additional context without
   * making them mandatory.
   */

  const jdText =
    jd && typeof jd === "string"
      ? jd.slice(0, 20000)
      : "Not provided.";

  const resumeText =
    resume && typeof resume === "string"
      ? resume.slice(0, 20000)
      : "Not provided.";

  const prompt = `
You are an evidence-based interview design assistant.

Your task is to generate structured interview questions
for a recruiter based on the role requirements and the
candidate's evidence gaps.

${inputInstruction}

${outputInstruction}

IMPORTANT RULES:

1. Generate 5 to 7 interview questions.

2. Questions should focus primarily on:
   - evidence gaps
   - verification areas
   - important competencies
   - claims that need clarification
   - job-relevant experience

3. Prefer STAR-style questions.

4. Questions should encourage the candidate to describe:
   Situation,
   Task,
   Action,
   Result.

5. Do not ask discriminatory questions.

6. Never ask about:
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

7. Do not make a hiring recommendation.

8. Do not label the candidate as hire/reject.

9. Every question must have a clear competency.

10. Explain why the question is useful.

11. Identify the evidence gap being investigated.

12. Provide practical "listen for" guidance
    so a human interviewer knows what evidence to look for.

13. Do not invent facts about the candidate.

14. If evidence is unavailable, treat it as something
    to verify rather than assuming it is negative.

15. Return valid JSON only.

Use exactly this structure:

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
You are a professional evidence-based interview design assistant.

Always return valid JSON.

Generate practical, non-discriminatory,
job-relevant interview questions.

Focus on evidence gaps rather than assumptions.

Never make hiring decisions.

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

          max_tokens: 2600
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
        "Interview JSON parse error:",
        parseError
      );

      return res.status(500).json({
        error: "The AI returned invalid JSON."
      });
    }

    /*
     * Basic validation.
     */

    if (
      !result.questions ||
      !Array.isArray(result.questions)
    ) {
      return res.status(500).json({
        error:
          "The AI response does not contain valid interview questions."
      });
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error(
      "Generate interview error:",
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
