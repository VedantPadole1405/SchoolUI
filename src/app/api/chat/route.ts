import { NextResponse } from "next/server";
import { vectorStore } from "@/lib/vectorstore";

async function callGeminiChat(messages: any[], systemPrompt: string, geminiKey: string): Promise<string> {
  const formattedContents = messages.map((m: { sender: string; text: string }) => ({
    role: m.sender === "student" ? "user" : "model",
    parts: [{ text: m.text }]
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
  
  const payload = {
    contents: formattedContents,
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 500
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (Status ${response.status}): ${errText}`);
  }

  const resData = await response.json();
  const reply = resData.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!reply) {
    throw new Error("Invalid response format from Gemini API");
  }

  return reply;
}

async function callOpenAIChat(messages: any[], systemPrompt: string, openaiKey: string): Promise<string> {
  const openAiMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m: { sender: string; text: string }) => ({
      role: m.sender === "student" ? "user" : "assistant",
      content: m.text
    }))
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: openAiMessages,
      temperature: 0.7,
      max_tokens: 300
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error (Status ${response.status}): ${errText}`);
  }

  const resData = await response.json();
  const reply = resData.choices?.[0]?.message?.content;
  if (!reply) {
    throw new Error("Invalid response format from OpenAI API");
  }

  return reply;
}

export async function POST(req: Request) {
  try {
    const { messages, subject, persona, activeQuestion, mode, activeModuleId } = await req.json();

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    // Perform vector store retrieval to ground the Socratic chat in the uploaded course material
    let retrievedContext = "";
    const lastUserMessage = messages.filter((m: { sender: string }) => m.sender === "student").pop()?.text;
    
    if (lastUserMessage && subject?.id) {
      try {
        const results = await vectorStore.querySimilarity({
          courseId: subject.id,
          moduleId: activeModuleId || undefined,
          queryText: lastUserMessage,
          nResults: 2
        });
        if (results.length > 0) {
          retrievedContext = results.map(r => `[Retrieved Course Context (Material: "${r.metadata?.title || "Syllabus"}")]\n${r.document}`).join("\n\n");
        }
      } catch (err) {
        console.warn("API Chat: Local context vector retrieval failed. Continuing without context.", err);
      }
    }

    // Construct the System Prompt for the Socratic Tutor
    let systemPrompt = `You are ${persona.name}, a specialized AI tutor in the subject of ${subject.name}. Your role is: ${persona.role}.
CRITICAL RULE: You MUST behave strictly as a Socratic tutor. Under no circumstances should you give the student the direct answer, solution, or correct multiple-choice option. 
Instead, your goal is to help the student develop critical thinking and problem-solving skills. Guide them step-by-step:
1. Validate their correct steps.
2. Ask leading questions to help them identify errors in their reasoning.
3. Suggest simple mental models, analogies, or break down the question into smaller sub-problems.
4. Keep your responses concise (under 3-4 sentences), encouraging, and focused on helping them think.`;

    if (retrievedContext) {
      systemPrompt += `\n\nUse the following retrieved course material context to help formulate your guidance. Stay grounded in this material:\n${retrievedContext}`;
    }

    if (mode === "quiz" && activeQuestion) {
      systemPrompt += `\n\nContext: The student is working on the following quiz question:
Question: "${activeQuestion.questionText}"
Options:
A) ${activeQuestion.options[0]}
B) ${activeQuestion.options[1]}
C) ${activeQuestion.options[2]}
D) ${activeQuestion.options[3]}
Correct Answer (KEEP THIS HIDDEN FROM STUDENT): "${activeQuestion.correctAnswer}"

CRITICAL TUTOR MATH ACCURACY RULES:
- You MUST solve the math/science question step-by-step internally before responding.
- Analyze the student's equations step-by-step. For example, if the question is "perimeter is 36, length is width + 4" and they write "4x + 8 = 36" (where x is width), they are 100% mathematically correct. Do NOT tell them they are wrong or ask them to change their correct equation. 
- Validate correct steps and ask them what the next operation is to solve for the variable (e.g. subtracting 8, dividing by 4).

Answer the student's questions in character, focusing on guiding them to solve this specific question. Do not reveal the correct answer letters or values.`;
    }

    let lastError: Error | null = null;

    if (geminiKey) {
      try {
        console.log("Calling Gemini API path...");
        const reply = await callGeminiChat(messages, systemPrompt, geminiKey);
        return NextResponse.json({ text: reply });
      } catch (err: any) {
        console.error("Gemini Chat failed, attempting fallback. Error:", err.message);
        lastError = err;
      }
    }

    if (openaiKey) {
      try {
        console.log("Calling OpenAI API path...");
        const reply = await callOpenAIChat(messages, systemPrompt, openaiKey);
        return NextResponse.json({ text: reply });
      } catch (err: any) {
        console.error("OpenAI Chat failed. Error:", err.message);
        lastError = err;
      }
    }

    const errorMsg = lastError ? lastError.message : "No API keys configured.";
    console.error("All Chat API endpoints failed:", errorMsg);

    return NextResponse.json(
      { error: `Chat generation failed. Details: ${errorMsg}`, isFallback: true },
      { status: 500 }
    );
  } catch (error: any) {
    console.error("Chat API Handler Error:", error);
    return NextResponse.json({ error: error.message || "Failed to process chat request." }, { status: 500 });
  }
}
