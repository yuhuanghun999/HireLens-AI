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
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-5.6-luna",
          input: `
You are HireLens AI, an evidence-based talent assessment assistant.

Analyze the following job description and create a structured Job Intelligence profile.

IMPORTANT RULES:
1. Do not invent information that is not supported by the job description.
2. Separate explicit requirements from reasonable interpretations.
3. Identify the most important competencies.
4. Do not make hiring decisions.
5. Return JSON only.

Job Description:
${jobDescription}

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

    return res.status(200).json({
      result: data.output_text
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
