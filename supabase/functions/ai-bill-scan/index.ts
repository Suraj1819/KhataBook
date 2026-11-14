
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// =====================================================
// CORS CONFIGURATION
// =====================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

// =====================================================
// JSON RESPONSE HELPER
// =====================================================

function jsonResponse(
  data: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

// =====================================================
// OPENAI STRUCTURED OUTPUT SCHEMA
// =====================================================

const responseSchema = {
  type: "object",
  properties: {
    customer_name: {
      type: ["string", "null"],
    },

    mobile: {
      type: ["string", "null"],
    },

    bill_date: {
      type: ["string", "null"],
    },

    bill_number: {
      type: ["string", "null"],
    },

    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item_name: {
            type: "string",
          },

          quantity: {
            type: ["number", "null"],
          },

          unit: {
            type: ["string", "null"],
          },

          rate: {
            type: ["number", "null"],
          },

          gst_percent: {
            type: ["number", "null"],
          },

          total_amount: {
            type: ["number", "null"],
          },

          confidence: {
            type: "number",
          },
        },

        required: [
          "item_name",
          "quantity",
          "unit",
          "rate",
          "gst_percent",
          "total_amount",
          "confidence",
        ],

        additionalProperties: false,
      },
    },

    subtotal: {
      type: ["number", "null"],
    },

    gst_amount: {
      type: ["number", "null"],
    },

    grand_total: {
      type: ["number", "null"],
    },

    amount_paid: {
      type: ["number", "null"],
    },

    amount_due: {
      type: ["number", "null"],
    },

    overall_confidence: {
      type: "number",
    },

    warnings: {
      type: "array",
      items: {
        type: "string",
      },
    },
  },

  required: [
    "customer_name",
    "mobile",
    "bill_date",
    "bill_number",
    "items",
    "subtotal",
    "gst_amount",
    "grand_total",
    "amount_paid",
    "amount_due",
    "overall_confidence",
    "warnings",
  ],

  additionalProperties: false,
};

// =====================================================
// IMAGE TO BASE64
// =====================================================

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";

  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(
      i,
      Math.min(i + chunkSize, bytes.length),
    );

    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

// =====================================================
// BILL EXTRACTION PROMPT
// =====================================================

const extractionPrompt = `
You are an expert Indian shop-bill and invoice reader.

Your task is to accurately extract information from uploaded
Indian retail and hardware shop bills.

The bill may contain:

- Hindi text
- English text
- Hinglish
- Handwritten information
- Printed information
- Hardware product names
- Abbreviated item names
- GST details
- Quantity and rate information
- Discounts
- Payment information

STRICT EXTRACTION RULES:

1. Extract only information visibly supported by the image.

2. Never invent customer names, mobile numbers, dates,
   bill numbers, item names or amounts.

3. Use null for missing or unreadable numeric and customer fields.

4. Read item name, quantity, unit, rate and total amount
   independently.

5. Preserve original item spelling as closely as possible.

6. Do not assume missing quantities, rates or GST percentages.

7. Use YYYY-MM-DD for clearly readable bill dates only.

8. Amounts are in INR unless another currency is clearly indicated.

9. Confidence values must be between 0 and 1.

10. Lower confidence when handwriting or numbers are unclear.

11. Add warnings for unreadable, partially readable or ambiguous
    information.

12. Do not calculate missing values or silently correct
    unclear numbers.

13. Do not confuse subtotal, GST amount and grand total.

14. If an item is partially unreadable, preserve the readable
    portion and lower its confidence.

15. If no items can be identified, return an empty items array.

Return only the requested structured data.
`;

// =====================================================
// MAIN EDGE FUNCTION
// =====================================================

serve(async (req: Request) => {
  // ---------------------------------------------------
  // CORS PREFLIGHT
  // ---------------------------------------------------

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  // ---------------------------------------------------
  // METHOD VALIDATION
  // ---------------------------------------------------

  if (req.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed.",
      },
      405,
    );
  }

  try {
    // -------------------------------------------------
    // OPENAI API KEY
    // -------------------------------------------------

    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!apiKey) {
      console.error("OPENAI_API_KEY is missing.");

      return jsonResponse(
        {
          success: false,
          error: "OpenAI API key is not configured in Supabase.",
        },
        500,
      );
    }

    // -------------------------------------------------
    // READ FORM DATA
    // -------------------------------------------------

    let formData: FormData;

    try {
      formData = await req.formData();
    } catch (error) {
      console.error("FormData parsing failed:", error);

      return jsonResponse(
        {
          success: false,
          error: "Invalid upload request. Please upload the bill again.",
        },
        400,
      );
    }

    const file = formData.get("file");

    // -------------------------------------------------
    // FILE VALIDATION
    // -------------------------------------------------

    if (!(file instanceof File)) {
      return jsonResponse(
        {
          success: false,
          error: "Please upload a valid bill image using the file field.",
        },
        400,
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return jsonResponse(
        {
          success: false,
          error: "Only JPG, PNG and WebP images are supported.",
        },
        400,
      );
    }

    if (file.size === 0) {
      return jsonResponse(
        {
          success: false,
          error: "The uploaded image is empty.",
        },
        400,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return jsonResponse(
        {
          success: false,
          error: "Image must be smaller than 10 MB.",
        },
        413,
      );
    }

    console.log("Bill image received:", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    // -------------------------------------------------
    // CONVERT IMAGE TO BASE64
    // -------------------------------------------------

    const bytes = new Uint8Array(
      await file.arrayBuffer(),
    );

    const base64 = bytesToBase64(bytes);

    const imageUrl =
      `data:${file.type};base64,${base64}`;

    // -------------------------------------------------
    // OPENAI REQUEST
    // -------------------------------------------------

    console.log("Sending bill image to OpenAI...");

    const aiResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          model: "gpt-4.1-mini",

          input: [
            {
              role: "user",

              content: [
                {
                  type: "input_text",
                  text: extractionPrompt,
                },

                {
                  type: "input_image",
                  image_url: imageUrl,
                  detail: "high",
                },
              ],
            },
          ],

          text: {
            format: {
              type: "json_schema",
              name: "indian_bill_extraction",
              strict: true,
              schema: responseSchema,
            },
          },
        }),
      },
    );

    // -------------------------------------------------
    // READ OPENAI RESPONSE
    // -------------------------------------------------

    const rawResponse = await aiResponse.text();

    let result: any;

    try {
      result = JSON.parse(rawResponse);
    } catch {
      console.error("OpenAI returned invalid JSON:", {
        status: aiResponse.status,
        response: rawResponse.slice(0, 2000),
      });

      return jsonResponse(
        {
          success: false,
          error: `OpenAI returned an invalid response. HTTP ${aiResponse.status}.`,
        },
        502,
      );
    }

    // -------------------------------------------------
    // OPENAI API ERROR
    // -------------------------------------------------

    if (!aiResponse.ok) {
      console.error("OpenAI API request failed:", {
        status: aiResponse.status,
        error: result?.error,
      });

      return jsonResponse(
        {
          success: false,
          error:
            result?.error?.message ||
            `OpenAI API request failed. HTTP ${aiResponse.status}.`,
          upstream_status: aiResponse.status,
        },
        502,
      );
    }

    // -------------------------------------------------
    // INCOMPLETE RESPONSE
    // -------------------------------------------------

    if (result.status === "incomplete") {
      console.error("OpenAI returned incomplete response:", result);

      return jsonResponse(
        {
          success: false,
          error:
            result.incomplete_details?.reason ||
            "AI could not complete bill recognition.",
        },
        502,
      );
    }

    // -------------------------------------------------
    // EXTRACT OUTPUT
    // -------------------------------------------------

    const outputItems = result.output || [];

    const contentItems = outputItems.flatMap(
      (item: any) => item.content || [],
    );

    // -------------------------------------------------
    // REFUSAL CHECK
    // -------------------------------------------------

    const refusal = contentItems.find(
      (item: any) => item.type === "refusal",
    );

    if (refusal) {
      console.error("OpenAI refused the request:", refusal);

      return jsonResponse(
        {
          success: false,
          error: "AI could not process this bill image.",
        },
        422,
      );
    }

    // -------------------------------------------------
    // FIND STRUCTURED OUTPUT
    // -------------------------------------------------

    const outputText = contentItems.find(
      (item: any) => item.type === "output_text",
    )?.text;

    if (!outputText) {
      console.error("OpenAI returned empty output:", result);

      return jsonResponse(
        {
          success: false,
          error: "AI returned an empty bill recognition response.",
        },
        502,
      );
    }

    // -------------------------------------------------
    // PARSE STRUCTURED DATA
    // -------------------------------------------------

    let extractedData: any;

    try {
      extractedData = JSON.parse(outputText);
    } catch (error) {
      console.error("Structured output parsing failed:", {
        error,
        output: outputText,
      });

      return jsonResponse(
        {
          success: false,
          error: "AI returned invalid bill data.",
        },
        502,
      );
    }

    // -------------------------------------------------
    // VALIDATE BASIC OUTPUT
    // -------------------------------------------------

    if (
      !extractedData ||
      typeof extractedData !== "object" ||
      !Array.isArray(extractedData.items)
    ) {
      console.error("Unexpected extraction structure:", extractedData);

      return jsonResponse(
        {
          success: false,
          error: "AI returned an unexpected bill data format.",
        },
        502,
      );
    }

    // -------------------------------------------------
    // SUCCESS
    // -------------------------------------------------

    console.log("Bill recognition completed:", {
      itemCount: extractedData.items.length,
      confidence: extractedData.overall_confidence,
    });

    return jsonResponse(
      {
        success: true,
        data: extractedData,
      },
      200,
    );

  } catch (error) {
    // -------------------------------------------------
    // INTERNAL ERROR
    // -------------------------------------------------

    const message =
      error instanceof Error
        ? error.message
        : "Something went wrong.";

    console.error("AI BILL SCAN INTERNAL ERROR:", {
      message,
      error,
    });

    return jsonResponse(
      {
        success: false,
        error: message,
      },
      500,
    );
  }
});
