export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { jobDescription } = req.body;

    if (!jobDescription || !jobDescription.trim()) {
      return res.status(400).json({
        error: "Job description is required"
      });
    }

    const response = await fetch(
      "https://api.deepseek.com/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`
        },

        body: JSON.stringify({
          model: "deepseek-flash",

          messages: [
            {
              role: "system",
              content: `
You are HireLens AI, an evidence-based talent assessment assistant.

Analyze the following job description and create a structured Job Intelligence profile.

IMPORTANT RULES:

1. Do not invent information that is not supported by the job description.
2. Separate explicit requirements from reasonable interpretations.
3. Identify the most important competencies.
4. Do not make hiring decisions.
5. If evidence is insufficient, say "Insufficient Evidence".
6. Return valid JSON only.

Return this JSON structure:

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
              `
            },

            {
              role: "user",
              content: `Job Description:

${jobDescription}`
            }
          ],

          response_format: {
            type: "json_object"
          },

          stream: false
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      return res.status(response.status).json({
        error: errorText
      });
    }

    const data = await response.json();

    const result =
      data.choices?.[0]?.message?.content;

    if (!result) {
      return res.status(500).json({
        error: "No result returned from DeepSeek."
      });
    }

    return res.status(200).json({
      result: result
    });

  } catch (error) {

    return res.status(500).json({
      error: error.message
    });

  }
}
