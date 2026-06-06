import { NextResponse } from "next/server";
import { quizGraph } from "@/lib/langgraph";

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export async function POST(req: Request) {
  try {
    const { notes, level, subject, exclude, moduleId, searchQuery } = await req.json();

    console.log(`API Quiz: Generating question for subject "${subject}", Module "${moduleId || "general"}" (Query: "${searchQuery || "none"}") (Level ${level}) via LangGraph...`);

    // Ensure LANGCHAIN environment variables are configured in the process at runtime
    process.env.LANGCHAIN_TRACING_V2 = "true";

    const result = await quizGraph.invoke({
      subject,
      level: Number(level || 1),
      notes: notes || "",
      moduleId: moduleId || undefined,
      exclude: exclude || [],
      searchQuery: searchQuery || "",
    });

    if (!result.questionText || !result.correctAnswer) {
      throw new Error("LangGraph did not generate a valid question.");
    }

    const question = {
      questionText: result.questionText,
      correctAnswer: result.correctAnswer,
      options: Array.isArray(result.options) ? shuffleArray(result.options) : [],
      conceptHint: result.conceptHint || "Think about the core concepts of this subject.",
      formulaReminder: result.formulaReminder || "Recall the relevant rules and formulas.",
      smallClue: result.smallClue || "Break the problem down step-by-step.",
      derivation: result.derivation || "",
    };

    return NextResponse.json({ question });
  } catch (error: any) {
    console.error("API Quiz: Error during LangGraph quiz generation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate quiz question." },
      { status: 500 }
    );
  }
}
