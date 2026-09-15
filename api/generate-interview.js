export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    const {
      jobDescription,
      roleProfile,
      candidateProfile,
      resume,
      language = "en"
    } = req.body || {};

    if (
      !jobDescription ||
      !roleProfile ||
      !candidateProfile ||
      !resume
    ) {
      return res.status(400).json({
        error:
          "Job description, role profile, candidate profile and resume are required."
      });
    }

    if (jobDescription.length > 20000) {
      return res.status(400).json({
        error: "Job description is too long."
      });
    }

    if (resume.length > 30000) {
      return res.status(400).json({
        error: "Resume is too long."
      });
    }

    const outputLanguage =
      language === "zh"
        ? "Simplified Chinese"
        : "English";

    const systemPrompt = `
You are HireLens AI, an evidence-based structured interview assistant.

Your task is to generate structured interview questions based on:
1. The job description.
2. The structured role profile.
3. The candidate assessment.
4. Evidence gaps that need verification.

Output language:
${outputLanguage}

IMPORTANT RULES:

1. Generate 5 to 7 questions.
2. Questions must be directly related to job competencies.
3. Prioritize evidence gaps and verification areas.
4. Use behavioral / STAR-style questions where appropriate.
5. Do not ask about age, gender, ethnicity, religion, disability, family status, pregnancy, marital status or other protected characteristics.
6. Do not make a hiring recommendation.
7. Do not repeat unsupported assumptions about the candidate.
8. Questions should allow the interviewer to collect observable evidence.
9. "listenFor" should describe evidence the interviewer should listen for.
10. You MUST return valid JSON only.

Return exactly this structure:

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
`;

    const userPrompt = `
JOB DESCRIPTION:

${jobDescription}

ROLE PROFILE:

${JSON.stringify(roleProfile, null, 2)}

CANDIDATE ASSESSMENT:

${JSON.stringify(candidateProfile, null, 2)}

CANDIDATE RESUME:

${resume}

Generate 5 to 7 structured interview questions.

Prioritize areas where evidence is incomplete or needs verification.

Return JSON only.
`;

    const response = await fetch(
      "https://api.deepseek.com/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization":
            `Bearer ${process.env.DEEPSEEK_API_KEY}`
        },

        body: JSON.stringify({

          model: "deepseek-flash",

          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: userPrompt
            }
          ],

          response_format: {
            type: "json_object"
          },

          max_tokens: 6000,

          stream: false

        })
      }
    );

    if (!response.ok) {

      const errorText =
        await response.text();

      return res.status(response.status).json({
        error: errorText
      });

    }

    const data =
      await response.json();

    const result =
      data.choices?.[0]?.message?.content;

    if (!result) {

      return res.status(500).json({
        error: "No result returned from DeepSeek."
      });

    }

    return res.status(200).json({
      result
    });

  } catch (error) {

    return res.status(500).json({
      error: error.message
    });

  }

}
