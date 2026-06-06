import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import OpenAI from "openai";
import { vectorStore } from "./vectorstore";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 1. Define the LangGraph State Schema
export const QuizStateAnnotation = Annotation.Root({
  subject: Annotation<string>({
    reducer: (curr, next) => next ?? curr,
    default: () => "math",
  }),
  level: Annotation<number>({
    reducer: (curr, next) => next ?? curr,
    default: () => 1,
  }),
  notes: Annotation<string>({
    reducer: (curr, next) => next ?? curr,
    default: () => "",
  }),
  searchQuery: Annotation<string>({
    reducer: (curr, next) => next ?? curr,
    default: () => "",
  }),
  moduleId: Annotation<string | undefined>({
    reducer: (curr, next) => next ?? curr,
    default: () => undefined,
  }),
  exclude: Annotation<string[]>({
    reducer: (curr, next) => next ?? curr,
    default: () => [],
  }),
  // Retrieved local vector store contexts
  retrievedContexts: Annotation<string[]>({
    reducer: (curr, next) => [...curr, ...next],
    default: () => [],
  }),
  // Retrieved external search contexts
  externalContexts: Annotation<string[]>({
    reducer: (curr, next) => [...curr, ...next],
    default: () => [],
  }),
  // Output question details
  questionText: Annotation<string | undefined>({
    reducer: (curr, next) => next ?? curr,
    default: () => undefined,
  }),
  correctAnswer: Annotation<string | undefined>({
    reducer: (curr, next) => next ?? curr,
    default: () => undefined,
  }),
  options: Annotation<string[]>({
    reducer: (curr, next) => next ?? curr,
    default: () => [],
  }),
  conceptHint: Annotation<string | undefined>({
    reducer: (curr, next) => next ?? curr,
    default: () => undefined,
  }),
  formulaReminder: Annotation<string | undefined>({
    reducer: (curr, next) => next ?? curr,
    default: () => undefined,
  }),
  smallClue: Annotation<string | undefined>({
    reducer: (curr, next) => next ?? curr,
    default: () => undefined,
  }),
  derivation: Annotation<string | undefined>({
    reducer: (curr, next) => next ?? curr,
    default: () => undefined,
  }),
  // Routing and Validation controls
  isValid: Annotation<boolean>({
    reducer: (curr, next) => next ?? curr,
    default: () => false,
  }),
  validationFeedback: Annotation<string | undefined>({
    reducer: (curr, next) => next ?? curr,
    default: () => undefined,
  }),
  retryCount: Annotation<number>({
    reducer: (curr, next) => curr + next,
    default: () => 0,
  }),
});

// Helper for Free External Search via Wikipedia REST APIs
async function fetchWikipediaSummary(query: string): Promise<string[]> {
  try {
    const cleanQuery = encodeURIComponent(query.trim());
    console.log(`LangGraph Search: Querying Wikipedia open search for "${query}"`);
    
    // 1. Search for matching articles
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${cleanQuery}&limit=2&namespace=0&format=json&origin=*`;
    const response = await fetch(searchUrl);
    if (!response.ok) return [];
    
    const results = await response.json();
    const titles: string[] = results[1] || [];
    
    const summaries: string[] = [];
    for (const title of titles) {
      // 2. Fetch the summary/extract of the top articles
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const summaryResp = await fetch(summaryUrl);
      if (summaryResp.ok) {
        const summaryData = await summaryResp.json();
        if (summaryData.extract) {
          summaries.push(`Wikipedia [${title}]: ${summaryData.extract}`);
        }
      }
    }
    return summaries;
  } catch (err) {
    console.error("LangGraph Search: Wikipedia fetch failed. Error:", err);
    return [];
  }
}

// Helper for Free snippet retrieval via DuckDuckGo HTML scraping
async function fetchDuckDuckGoSnippets(query: string): Promise<string[]> {
  try {
    const cleanQuery = encodeURIComponent(query.trim());
    const url = `https://html.duckduckgo.com/html/?q=${cleanQuery}`;
    console.log(`LangGraph Search: Querying DuckDuckGo HTML for "${query}"`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) return [];
    const html = await response.text();
    
    // Regex extract class result__snippet
    const snippets: string[] = [];
    const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = snippetRegex.exec(html)) !== null && snippets.length < 3) {
      const cleanSnippet = match[1]
        .replace(/<[^>]*>/g, "") // Strip html tags
        .replace(/\s+/g, " ")     // Standardize whitespace
        .trim();
      if (cleanSnippet) {
        snippets.push(`Web search snippet: "${cleanSnippet}"`);
      }
    }
    return snippets;
  } catch (err) {
    console.error("LangGraph Search: DuckDuckGo HTML query failed. Error:", err);
    return [];
  }
}

// 2. Node Implementations

/**
 * Node: retrieveLocalContext
 * Queries local vector index (Chroma or in-memory) for syllabus materials.
 */
const retrieveLocalContextNode = async (state: typeof QuizStateAnnotation.State) => {
  const query = state.searchQuery || state.subject;
  if (!query) return { retrievedContexts: [] };

  try {
    const docs = await vectorStore.querySimilarity({
      courseId: state.subject,
      moduleId: state.moduleId,
      queryText: query,
      nResults: 3,
    });

    const contexts = docs.map(
      (d) => `Syllabus material [File: ${d.metadata.title}]: ${d.document}`
    );

    return { retrievedContexts: contexts };
  } catch (err) {
    console.error("LangGraph Node: Local context retrieval failed. Error:", err);
    return { retrievedContexts: [] };
  }
};

/**
 * Node: retrieveExternalContext
 * Performs search engine queries using free resources to extract relevant educational facts.
 */
const retrieveExternalContextNode = async (state: typeof QuizStateAnnotation.State) => {
  const query = state.searchQuery || state.subject;
  if (!query) return { externalContexts: [] };

  console.log(`LangGraph Node: Searching external web for topic: "${query}"`);
  
  // Parallel search retrieval
  const [wikiResults, ddgResults] = await Promise.all([
    fetchWikipediaSummary(query),
    fetchDuckDuckGoSnippets(query)
  ]);

  const external = [...wikiResults, ...ddgResults];
  return { externalContexts: external };
};

/**
 * Node: generateQuestion
 * Calls OpenAI to formulate the quiz question using combined context details.
 */
const generateQuestionNode = async (state: typeof QuizStateAnnotation.State) => {
  const localContext = state.retrievedContexts.join("\n\n");
  const webContext = state.externalContexts.join("\n\n");

  const prompt = `You are a curriculum design specialist for adaptive learning exams like the GMAT and GRE.
Generate exactly ONE multiple choice question for the subject: "${state.subject}"${state.searchQuery ? ` (Focus topic: "${state.searchQuery}")` : ""} at difficulty Level ${state.level}.

Difficulty level criteria:
- Level 1: Basic concept recall or direct definition.
- Level 2: Core application of formulas, rules, or intermediate problems.
- Level 3: Advanced scenario, multi-step calculation, critical deduction, or edge cases.

Syllabus context (ChromaDB):
${localContext || "No course materials uploaded yet. Generate standard curriculum question."}

External web search context:
${webContext || "No web results found."}

${state.exclude && state.exclude.length > 0 ? `CRITICAL: Avoid repeating or duplicating these questions:\n${JSON.stringify(state.exclude)}` : ""}

${state.validationFeedback ? `CRITICAL CORRECTION FEEDBACK FROM PREVIOUS RUN:\n${state.validationFeedback}\nImprove the question based on this feedback.` : ""}

CRITICAL MATHEMATICAL CORRECTNESS INSTRUCTIONS:
- You MUST solve the question step-by-step internally and write down the exact step-by-step derivation.
- The correct answer MUST be mathematically indisputable. Double check your arithmetic. If the calculation evaluates to 29, the correct answer must be exactly 29. Do not round numbers, do not make close approximations.
- Evaluate every single polynomial term individually in your derivation steps before adding/subtracting them. Write down each intermediate term's value.

For options and Socratic hints generation:
- Construct an array of exactly 4 options. One option MUST be the correct answer exactly. The other 3 options must be realistic distractors.
- Provide:
  1. A Socratic concept explanation clue (conceptHint) (DO NOT give the answer).
  2. A Socratic formula/rule reminder (formulaReminder) (DO NOT give the answer).
  3. A Socratic small clue pointing to the next step of the problem (smallClue) (DO NOT give the answer).

Return your output as a raw JSON string matching this structure (do not add any markdown ticks, comments, or backticks):
{
  "questionText": "...",
  "correctAnswer": "...",
  "options": ["...", "...", "...", "..."],
  "conceptHint": "...",
  "formulaReminder": "...",
  "smallClue": "...",
  "derivation": "..."
}
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a curriculum designer that outputs raw JSON objects." },
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
    });

    const text = response.choices[0].message.content;
    if (!text) throw new Error("OpenAI returned empty response");

    const parsed = JSON.parse(text.trim());
    return {
      questionText: parsed.questionText,
      correctAnswer: parsed.correctAnswer,
      options: parsed.options,
      conceptHint: parsed.conceptHint,
      formulaReminder: parsed.formulaReminder,
      smallClue: parsed.smallClue,
      derivation: parsed.derivation,
    };
  } catch (err: any) {
    console.error("LangGraph Node: Question generation LLM call failed. Error:", err);
    throw err;
  }
};

/**
 * Node: validateQuestion
 * Evaluates the generated question for mathematical correctness and curriculum relevance.
 */
const validateQuestionNode = async (state: typeof QuizStateAnnotation.State) => {
  const prompt = `You are a curriculum validation auditor.
Verify the generated multiple-choice question for mathematical accuracy, clarity, and relevance to the topic of: "${state.subject}".

Question Details:
Question: "${state.questionText}"
Correct Answer: "${state.correctAnswer}"
Options: ${JSON.stringify(state.options)}
Derivation steps: "${state.derivation}"

Audit criteria:
1. Is the question mathematically sound? Does the step-by-step derivation evaluation strictly yield the declared correct answer?
2. Is the correct answer exactly present in the list of options?
3. Are the options distinct and clear?
4. Are the Socratic hints helpful and do they hide the final answer?

Return a raw JSON object matching this structure:
{
  "isValid": true/false,
  "feedback": "Write down clear feedback detailing any arithmetic error or correction needed. If valid, leave blank."
}
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a curriculum validation agent. Output raw JSON objects." },
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
    });

    const text = response.choices[0].message.content;
    if (!text) throw new Error("OpenAI returned empty response during validation");

    const parsed = JSON.parse(text.trim());
    console.log(`LangGraph Node: Validation audit completed. IsValid = ${parsed.isValid}. Feedback: ${parsed.feedback || "None"}`);

    return {
      isValid: parsed.isValid,
      validationFeedback: parsed.feedback || undefined,
      retryCount: 1, // Increments retry count state
    };
  } catch (err) {
    console.error("LangGraph Node: Question validation failed. Skipping validation...", err);
    return {
      isValid: true,
      validationFeedback: undefined,
      retryCount: 1,
    };
  }
};

// 3. Assemble and Compile the Graph

const checkValidationRoute = (state: typeof QuizStateAnnotation.State) => {
  if (state.isValid || state.retryCount >= 2) {
    console.log("LangGraph Routing: Question is validated or max retries reached. Transitioning to END.");
    return END;
  }
  console.log(`LangGraph Routing: Validation failed. Retry count is ${state.retryCount}. Re-routing to generateQuestionNode.`);
  return "generateQuestion";
};

const graphWorkflow = new StateGraph(QuizStateAnnotation)
  .addNode("retrieveLocal", retrieveLocalContextNode)
  .addNode("retrieveExternal", retrieveExternalContextNode)
  .addNode("generateQuestion", generateQuestionNode)
  .addNode("validateQuestion", validateQuestionNode)
  
  // Entry point
  .addEdge(START, "retrieveLocal")
  .addEdge("retrieveLocal", "retrieveExternal")
  .addEdge("retrieveExternal", "generateQuestion")
  .addEdge("generateQuestion", "validateQuestion")
  
  // Conditional routing from validation
  .addConditionalEdges("validateQuestion", checkValidationRoute);

export const quizGraph = graphWorkflow.compile();
