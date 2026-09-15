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
      resume,
      language = "en"
    } = req.body || {};

    if (!jobDescription || !roleProfile || !resume) {
      return res.status(400).json({
        error:
          "Job description, role profile and resume are required."
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
You are HireLens AI, an evidence-based candidate assessment assistant.

Your task is to compare a candidate resume against a structured job profile.

Output language:
${outputLanguage}

IMPORTANT PRINCIPLES:

1. Evaluate only job-relevant evidence.
2. Do not evaluate age, gender, ethnicity, religion, disability, nationality or other protected characteristics.
3. Never invent experience or achievements.
4. Do not assume that missing information means the candidate lacks the capability.
5. Missing information must be labeled "Insufficient Evidence".
6. Scores must be based on observable evidence in the resume.
7. Do not make a hiring or rejection recommendation.
8. The result is decision support for human reviewers.
9. Keep explanations concise but useful for HR professionals.
10. You MUST return valid JSON only.

Overall score:
- 0–39: Limited Evidence
- 40–59: Developing Fit
- 60–79: Moderate Fit
- 80–100: Strong Evidence of Fit

Return exactly this JSON structure:

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

The dimension weights should be derived from the role competencies.

Do not add a recommendation such as Hire, Reject, Select or Do Not Select.
`;

    const userPrompt = `
JOB DESCRIPTION:

${jobDescription}

STRUCTURED ROLE PROFILE:

${JSON.stringify(roleProfile, null, 2)}

CANDIDATE RESUME:

${resume}

Analyze the candidate strictly according to the evidence-based rules above.

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
