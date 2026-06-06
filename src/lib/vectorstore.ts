import { ChromaClient } from "chromadb";
import OpenAI from "openai";

export interface DocumentChunk {
  id: string;
  document: string;
  metadata: {
    courseId: string;
    moduleId?: string;
    title: string;
    [key: string]: any;
  };
  embedding: number[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class VectorStoreManager {
  private chromaClient: ChromaClient | null = null;
  private openai: OpenAI | null = null;
  private hasChromaConnection: boolean = false;
  private memoryDb: DocumentChunk[] = [];

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      console.warn("VectorStoreManager: OPENAI_API_KEY is not defined in environment variables.");
    }

    const chromaUrl = process.env.CHROMADB_URL || "http://localhost:8000";
    try {
      this.chromaClient = new ChromaClient({ path: chromaUrl });
      console.log(`VectorStoreManager: ChromaClient initialized on path: ${chromaUrl}`);
    } catch (err) {
      console.warn("VectorStoreManager: Failed to initialize ChromaClient. Falling back to in-memory store.", err);
    }
  }

  /**
   * Lazily check Chroma connection status and return true if healthy.
   */
  private async checkConnection(): Promise<boolean> {
    if (!this.chromaClient) return false;
    try {
      // Get heartbeat or list collections to test if connection works
      await this.chromaClient.heartbeat();
      this.hasChromaConnection = true;
      return true;
    } catch (err) {
      if (this.hasChromaConnection) {
        console.warn("VectorStoreManager: Connection to ChromaDB lost. Falling back to memory-store.");
      }
      this.hasChromaConnection = false;
      return false;
    }
  }

  /**
   * Generates a 1536-dimensional vector embedding for the input text using OpenAI.
   */
  private async getEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error("OpenAI client not configured. Ensure OPENAI_API_KEY is defined.");
    }
    const response = await this.openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return response.data[0].embedding;
  }

  /**
   * Helper to split raw text into chunks of ~600 characters with 100 character overlap.
   */
  private chunkText(text: string, chunkSize: number = 600, overlap: number = 100): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start += chunkSize - overlap;
    }
    return chunks;
  }

  /**
   * Cleans a string to be a safe Chroma collection name.
   * Chroma collection names must start with a letter/digit, be 3-63 chars, and contain only letters, numbers, _, -
   */
  private cleanCollectionName(courseId: string): string {
    let clean = courseId.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    if (clean.length < 3) clean = `course_${clean}`;
    if (clean.length > 63) clean = clean.slice(0, 63);
    // Ensure it starts and ends with alphanumeric
    if (!/^[a-z0-9]/.test(clean)) clean = `c_${clean}`;
    return clean;
  }

  /**
   * Ingests, embeds, and stores a document under a specific course and module.
   */
  async ingestDocument(params: {
    courseId: string;
    moduleId?: string;
    title: string;
    content: string;
  }): Promise<{ chunkCount: number; isChroma: boolean }> {
    const { courseId, moduleId, title, content } = params;
    const isChromaActive = await this.checkConnection();

    // 1. Chunk document
    const textChunks = this.chunkText(content);
    console.log(`VectorStoreManager: Ingesting "${title}" - Split into ${textChunks.length} chunks.`);

    // 2. Generate embeddings & construct database chunks
    const chunksWithEmbeddings: DocumentChunk[] = [];
    for (let i = 0; i < textChunks.length; i++) {
      const chunkText = textChunks[i];
      const embedding = await this.getEmbedding(chunkText);
      const chunk: DocumentChunk = {
        id: `chunk-${courseId}-${moduleId || "general"}-${Date.now()}-${i}`,
        document: chunkText,
        metadata: {
          courseId,
          moduleId,
          title,
          chunkIndex: i,
        },
        embedding,
      };
      chunksWithEmbeddings.push(chunk);
    }

    // 3. Store in database
    if (isChromaActive && this.chromaClient) {
      try {
        const collectionName = this.cleanCollectionName(courseId);
        const collection = await this.chromaClient.getOrCreateCollection({
          name: collectionName,
        });

        // Add to Chroma
        await collection.add({
          ids: chunksWithEmbeddings.map((c) => c.id),
          embeddings: chunksWithEmbeddings.map((c) => c.embedding),
          metadatas: chunksWithEmbeddings.map((c) => c.metadata),
          documents: chunksWithEmbeddings.map((c) => c.document),
        });

        console.log(`VectorStoreManager: Successfully stored ${chunksWithEmbeddings.length} chunks in Chroma collection: "${collectionName}"`);
      } catch (err) {
        console.error("VectorStoreManager: Chroma add failed. Storing chunks in-memory fallback instead. Error:", err);
        this.memoryDb.push(...chunksWithEmbeddings);
      }
    } else {
      // Memory store fallback
      console.log(`VectorStoreManager: Storing ${chunksWithEmbeddings.length} chunks in memory store fallback.`);
      this.memoryDb.push(...chunksWithEmbeddings);
    }

    return {
      chunkCount: chunksWithEmbeddings.length,
      isChroma: isChromaActive,
    };
  }

  /**
   * Queries the vector store for top matching chunks based on query similarity.
   */
  async querySimilarity(params: {
    courseId: string;
    moduleId?: string;
    queryText: string;
    nResults?: number;
  }): Promise<{ document: string; metadata: any; score: number }[]> {
    const { courseId, moduleId, queryText, nResults = 3 } = params;
    const isChromaActive = await this.checkConnection();

    if (!queryText.trim()) return [];

    console.log(`VectorStoreManager: Querying similarity for: "${queryText.slice(0, 40)}..." (Chroma: ${isChromaActive})`);

    const queryEmbedding = await this.getEmbedding(queryText);

    if (isChromaActive && this.chromaClient) {
      try {
        const collectionName = this.cleanCollectionName(courseId);
        const collection = await this.chromaClient.getCollection({
          name: collectionName,
        });

        // Construct metadata filter
        const whereClause: any = {};
        if (moduleId) {
          whereClause["moduleId"] = moduleId;
        }

        const results = await collection.query({
          queryEmbeddings: [queryEmbedding],
          nResults,
          where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
        });

        const formattedResults: { document: string; metadata: any; score: number }[] = [];
        if (results.documents && results.documents[0]) {
          for (let i = 0; i < results.documents[0].length; i++) {
            const doc = results.documents[0][i];
            const meta = results.metadatas?.[0]?.[i] || {};
            const dist = results.distances?.[0]?.[i] ?? 0;
            // Chroma distances are L2 or cosine distance. Convert distance to a similarity score: 1 - distance
            formattedResults.push({
              document: doc || "",
              metadata: meta,
              score: 1 - dist,
            });
          }
        }

        return formattedResults;
      } catch (err: any) {
        console.warn(`VectorStoreManager: Chroma query collection "${courseId}" failed. Error:`, err.message || err);
        // Fall through to memory fallback
      }
    }

    // In-Memory Search Fallback
    console.log("VectorStoreManager: Performing cosine similarity query in memory db.");
    
    // Filter memory db by course (and module if present)
    const filteredChunks = this.memoryDb.filter((c) => {
      const matchCourse = c.metadata.courseId === courseId;
      const matchModule = moduleId ? c.metadata.moduleId === moduleId : true;
      return matchCourse && matchModule;
    });

    const scoredChunks = filteredChunks.map((chunk) => {
      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      return {
        document: chunk.document,
        metadata: chunk.metadata,
        score,
      };
    });

    // Sort by descending score
    scoredChunks.sort((a, b) => b.score - a.score);
    return scoredChunks.slice(0, nResults);
  }

  /**
   * Resets or deletes vectors for a given course.
   */
  async deleteCourseVectors(courseId: string): Promise<void> {
    const isChromaActive = await this.checkConnection();
    if (isChromaActive && this.chromaClient) {
      try {
        const collectionName = this.cleanCollectionName(courseId);
        await this.chromaClient.deleteCollection({
          name: collectionName,
        });
        console.log(`VectorStoreManager: Deleted Chroma collection "${collectionName}"`);
      } catch (err) {
        console.warn(`VectorStoreManager: Delete collection failed for "${courseId}".`);
      }
    }

    // Clear from memory
    this.memoryDb = this.memoryDb.filter((c) => c.metadata.courseId !== courseId);
  }
}

// Global Singleton Instance
export const vectorStore = new VectorStoreManager();
