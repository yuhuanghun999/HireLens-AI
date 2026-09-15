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
    } = req.body;


    if (
      !jobDescription ||
      !jobDescription.trim()
    ) {

      return res.status(400).json({
        error: "Job description is required"
      });

    }


    const outputLanguage =
      language === "zh"
        ? "Simplified Chinese"
        : "English";


    const response = await fetch(
      "https://api.deepseek.com/chat/completions",
      {

        method: "POST",

        headers: {

          "Content-Type":
            "application/json",

          "Authorization":
            `Bearer ${process.env.DEEPSEEK_API_KEY}`

        },

        body: JSON.stringify({

          model: "deepseek-flash",

          messages: [

            {

              role: "system",

              content: `

You are HireLens AI, an evidence-based talent assessment assistant.

Your task is to analyze a job description and create a structured Job Intelligence profile.

The user's requested output language is:

${outputLanguage}

IMPORTANT RULES:

1. Do not invent information that is not supported by the job description.

2. Separate explicit requirements from reasonable interpretations.

3. Identify the most important competencies for the role.

4. Do not make hiring, rejection, or employment decisions.

5. Never infer negative conclusions from missing information.

6. If evidence is insufficient, use "Insufficient Evidence" in English or "证据不足" in Chinese.

7. Ignore unnecessary personal characteristics such as gender, age, ethnicity, religion, or other protected characteristics.

8. Competency weights should add up approximately to 100.

9. Keep the analysis practical for an HR professional.

10. Return valid JSON only.

Return exactly this structure:

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

All text values must be written in ${outputLanguage}.

Job Description:

${jobDescription}

              `

            },

            {

              role: "user",

              content:
                "Analyze this job description according to the rules above."

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

      const errorText =
        await response.text();

      return res.status(
        response.status
      ).json({

        error:
          errorText

      });

    }


    const data =
      await response.json();


    const result =
      data.choices?.[0]?.message?.content;


    if (!result) {

      return res.status(500).json({

        error:
          "No result returned from DeepSeek."

      });

    }


    return res.status(200).json({

      result: result

    });


  } catch (error) {

    return res.status(500).json({

      error:
        error.message

    });

  }

}
