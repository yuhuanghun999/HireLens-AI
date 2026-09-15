export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    const {
      jobDescription,
      language = "en"
    } = req.body || {};

    if (!jobDescription || !jobDescription.trim()) {
      return res.status(400).json({
        error: "Job description is required."
      });
    }

    if (jobDescription.length > 20000) {
      return res.status(400).json({
        error: "Job description is too long."
      });
    }

    const outputLanguage =
      language === "zh"
        ? "Simplified Chinese"
        : "English";

    const systemPrompt = `
You are HireLens AI, an evidence-based talent assessment assistant.

Your task is to analyze a job description and create a structured Job Intelligence profile.

Output language:
${outputLanguage}

IMPORTANT RULES:

1. Use only information supported by the job description.
2. Do not invent requirements.
3. Separate explicit requirements from reasonable interpretations.
4. Identify practical competencies for the role.
5. Competency weights must add up approximately to 100.
6. Do not make hiring, rejection, or employment decisions.
7. Never infer negative conclusions from missing information.
8. Missing information must be described as "Insufficient Evidence" or the equivalent in the requested language.
9. Ignore protected characteristics such as gender, age, ethnicity, religion, disability or other sensitive personal characteristics.
10. Keep the output practical for HR professionals.
11. You MUST return valid JSON only.

Return JSON using exactly this structure:

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
              content:
                `Analyze the following job description and return JSON only:

${jobDescription}`
            }
          ],

          response_format: {
            type: "json_object"
          },

          max_tokens: 5000,

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
