import { NextResponse } from "next/server";
import { vectorStore } from "@/lib/vectorstore";
import { PDFParse } from "pdf-parse";

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    
    let courseId = "";
    let moduleId = "";
    let title = "";
    let content = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      courseId = formData.get("courseId") as string;
      moduleId = (formData.get("moduleId") as string) || "";
      title = formData.get("title") as string;
      
      const file = formData.get("file") as File;
      if (!file) {
        return NextResponse.json({ error: "No file uploaded in form data." }, { status: 400 });
      }

      const fileBuffer = Buffer.from(await file.arrayBuffer());

      if (file.name.toLowerCase().endsWith(".pdf")) {
        console.log(`API Ingest: Parsing PDF file "${file.name}" using PDFParse...`);
        const parser = new PDFParse({ data: fileBuffer });
        const parsed = await parser.getText();
        await parser.destroy();
        content = parsed.text;
        if (!title) title = file.name;
      } else {
        // Plain text file (.txt, .md, etc.)
        console.log(`API Ingest: Reading text file "${file.name}"...`);
        content = fileBuffer.toString("utf-8");
        if (!title) title = file.name;
      }
    } else {
      // Standard JSON request
      const json = await req.json();
      courseId = json.courseId;
      moduleId = json.moduleId || "";
      title = json.title;
      content = json.content;
    }

    if (!courseId || !title || !content || !content.trim()) {
      return NextResponse.json(
        { error: "Missing required fields or document content is empty." },
        { status: 400 }
      );
    }

    console.log(`API Ingest: Ingesting "${title}" for course "${courseId}", module "${moduleId || "general"}" (${content.length} chars)`);

    const result = await vectorStore.ingestDocument({
      courseId,
      moduleId: moduleId || undefined,
      title,
      content,
    });

    return NextResponse.json({
      success: true,
      message: `Successfully ingested document "${title}"`,
      chunkCount: result.chunkCount,
      isChroma: result.isChroma,
      extractedText: content.slice(0, 800), // Return preview of text
    });
  } catch (error: any) {
    console.error("API Ingest: Error in ingestion handler:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process and ingest document contents." },
      { status: 500 }
    );
  }
}
