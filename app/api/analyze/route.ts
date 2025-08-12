import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { ACORD_PROMPT } from '@/lib/prompt';
import { type AcordResponseRelaxed } from '@/lib/schema';

const GROQ_API_KEY = process.env.GROQ_API_KEY!;

export const runtime = 'edge';

// Better error handling with specific error types
class AcordAnalyzerError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'AcordAnalyzerError';
  }
}

// Improved file validation
function validateFiles(files: File[]) {
  if (files.length === 0) {
    throw new AcordAnalyzerError('No files uploaded', 'NO_FILES', 400);
  }

  if (files.length > 5) {
    throw new AcordAnalyzerError('Maximum 5 images allowed', 'TOO_MANY_FILES', 400);
  }

  const validFiles = files.filter(f => ['image/png', 'image/jpeg', 'image/jpg'].includes(f.type));
  if (validFiles.length === 0) {
    throw new AcordAnalyzerError('Only images (PNG/JPEG/JPG) are supported', 'INVALID_FILE_TYPE', 400);
  }

  // Check individual file sizes (max 2MB per file)
  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
  for (const file of validFiles) {
    if (file.size > MAX_FILE_SIZE) {
      throw new AcordAnalyzerError(`File ${file.name} is too large (max 2MB per file)`, 'FILE_TOO_LARGE', 400);
    }
  }

  // Check total size (max 4MB total)
  const totalSize = validFiles.reduce((sum, f) => sum + f.size, 0);
  const MAX_TOTAL_SIZE = 4 * 1024 * 1024; // 4MB
  if (totalSize > MAX_TOTAL_SIZE) {
    throw new AcordAnalyzerError('Total file size exceeds 4MB limit', 'TOTAL_SIZE_EXCEEDED', 400);
  }

  return validFiles;
}

// Improved file to data URL conversion with error handling
async function fileToDataUrl(file: File): Promise<string> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
    const mediaType = file.type || 'application/octet-stream';
    return `data:${mediaType};base64,${base64}`;
  } catch (error) {
    throw new AcordAnalyzerError(`Failed to process file ${file.name}`, 'FILE_PROCESSING_ERROR', 400);
  }
}

// Better JSON parsing with validation
function parseAcordResponse(text: string): AcordResponseRelaxed | null {
  try {
    // Look for JSON in the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Basic validation that it's not just an empty object
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
      return parsed;
    }
    
    return null;
  } catch (parseError) {
    console.error('JSON parsing failed:', parseError);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Parse form data
    const formData = await req.formData();
    const allFiles = [...formData.getAll('file'), ...formData.getAll('files')];
    const inputFiles = (allFiles as unknown[]).filter((f): f is File => f instanceof File);

    // Validate files
    const validFiles = validateFiles(inputFiles);

    // Convert files to data URLs
    const imageDataUrls = await Promise.all(
      validFiles.map(async (file) => {
        try {
          return await fileToDataUrl(file);
        } catch (error) {
          throw new AcordAnalyzerError(
            `Failed to process file ${file.name}`,
            'FILE_CONVERSION_ERROR',
            400
          );
        }
      })
    );

    // Prepare AI request
    const prompt = `${ACORD_PROMPT}\n\nSTRICT OUTPUT RULE: If the document is not an ACORD 25, output exactly: null.`;
    const messages = [
      { role: 'system' as const, content: prompt },
      { role: 'user' as const, content: imageDataUrls.map((u) => ({ type: 'image' as const, image: u })) },
    ];

    // Try multiple models with better error handling
    const groq = createGroq({ apiKey: GROQ_API_KEY });
    const models = [
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'meta-llama/llama-4-maverick-17b-128e-instruct',
    ];

    let lastError: Error | null = null;

    for (const modelName of models) {
      try {
        const { text } = await generateText({
          model: groq(modelName),
          temperature: 0,
          topP: 1,
          maxOutputTokens: 8141,
          messages,
        });

        // Parse and validate response
        const parsedResponse = parseAcordResponse(text);
        
        if (parsedResponse !== null) {
          // Success - return the result
          return NextResponse.json({
            data: parsedResponse,
            success: true,
            model: modelName,
            timestamp: new Date().toISOString(),
            filesProcessed: validFiles.length
          });
        }

        // If we get here, the response was null (not an ACORD form)
        return NextResponse.json({
          data: null,
          success: true,
          message: 'Document does not appear to be an ACORD 25 certificate',
          model: modelName,
          timestamp: new Date().toISOString()
        });

      } catch (err) {
        lastError = err as Error;
        console.error(`Model ${modelName} failed:`, err);
        
        // If this is the last model, throw the error
        if (modelName === models[models.length - 1]) {
          throw new AcordAnalyzerError(
            `AI analysis failed: ${lastError.message}`,
            'AI_ANALYSIS_FAILED',
            500
          );
        }
      }
    }

    // This should never be reached, but just in case
    throw new AcordAnalyzerError('All AI models failed', 'ALL_MODELS_FAILED', 500);

  } catch (error) {
    console.error('API Error:', error);

    if (error instanceof AcordAnalyzerError) {
      return NextResponse.json({
        error: error.message,
        code: error.code,
        success: false,
        timestamp: new Date().toISOString()
      }, { status: error.statusCode });
    }

    // Handle unexpected errors
    return NextResponse.json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      success: false,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}


