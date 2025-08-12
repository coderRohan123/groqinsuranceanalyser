'use client';

import { useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X, Loader2 } from 'lucide-react';

type AnalysisResponse = Record<string, unknown> | null;

const MAX_IMAGES = 5;
const MAX_TOTAL_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB

export default function GroqAnalyzePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileSummary, setFileSummary] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [json, setJson] = useState<AnalysisResponse>(null);

  const reset = () => {
    setJson(null);
    setError(null);
    setFileSummary('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Convert first 5 pages of a PDF to JPEG images (client-side) using PDF.js
  const convertPdfToImages = async (file: File): Promise<File[]> => {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';

    let arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const maxPages = Math.min(5, pdf.numPages);
    const imageFiles: File[] = [];

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });
      const maxDimension = 1600;
      const scale = Math.min(1.5, maxDimension / Math.max(baseViewport.width, baseViewport.height));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      let blob: Blob | undefined = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8);
      }) || undefined;
      if (blob) {
        const imageFile = new File([blob], `${file.name.replace(/\.pdf$/i, '')}_page_${pageNum}.jpg`, {
          type: 'image/jpeg',
        });
        imageFiles.push(imageFile);
      }

      // Clean up canvas memory after each page
      canvas.width = 0;
      canvas.height = 0;
      
      // Clean up page object
      page.cleanup();
      
      // Clean up blob to free memory
      blob = undefined;
    }

    // Clean up PDF document and array buffer
    pdf.destroy();
    (arrayBuffer as unknown) = null;
    
    return imageFiles;
  };

  const validateImagesTotalSize = (files: File[]) => {
    const total = files.reduce((sum, f) => sum + f.size, 0);
    return total <= MAX_TOTAL_IMAGE_BYTES;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    setError(null);
    setJson(null);
    if (!files || files.length === 0) {
      setFileSummary('');
      return;
    }

    const list = Array.from(files);
    const hasPdf = list.some((f) => f.type === 'application/pdf');
    if (hasPdf) {
      // Only one PDF allowed
      const firstPdf = list.find((f) => f.type === 'application/pdf')!;
      const dt = new DataTransfer();
      dt.items.add(firstPdf);
      if (fileInputRef.current) fileInputRef.current.files = dt.files;
      setFileSummary(`PDF selected: ${firstPdf.name}`);
      return;
    }

    const images = list.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) {
      setError('Please upload either a single PDF or up to 5 images (PNG/JPEG/JPG).');
      setFileSummary('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const limited = images.slice(0, MAX_IMAGES);
    if (!validateImagesTotalSize(limited)) {
      setError('Total size of selected images must be 4 MB or less.');
      setFileSummary('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const dt = new DataTransfer();
    limited.forEach((f) => dt.items.add(f));
    if (fileInputRef.current) fileInputRef.current.files = dt.files;
    setFileSummary(`${limited.length} image(s) selected`);
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
    const dropped = event.dataTransfer.files;
    if (!dropped || dropped.length === 0) return;
    const dt = new DataTransfer();
    Array.from(dropped).forEach((f) => dt.items.add(f));
    if (fileInputRef.current) {
      fileInputRef.current.files = dt.files;
      // Reuse validation path
      handleFileChange({ target: fileInputRef.current } as unknown as React.ChangeEvent<HTMLInputElement>);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setJson(null);

    const fileList = fileInputRef.current?.files;
    if (!fileList || fileList.length === 0) {
      throw new Error('Please upload a PDF or images.');
    }

    const files = Array.from(fileList);
    const pdf = files.find((f) => f.type === 'application/pdf');
    const formData = new FormData();

    if (pdf) {
      const images = await convertPdfToImages(pdf);
      images.forEach((img) => formData.append('file', img));
    } else {
      const images = files.filter((f) => f.type.startsWith('image/')).slice(0, MAX_IMAGES);
      if (!validateImagesTotalSize(images)) {
        throw new Error('Total size of selected images must be 4 MB or less.');
      }
      images.forEach((img) => formData.append('file', img));
    }

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const result: { data?: AnalysisResponse; error?: string } = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || 'Analyze failed');
      setJson(result.data ?? null);
      if (result.data === null) setError('This does not appear to be an ACORD 25 certificate.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Card className="p-8 shadow-xl border border-slate-700 bg-slate-900/90 text-slate-100">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-emerald-400">
              Groq ACORD 25 Analyzer
            </h1>
            <p className="mt-2 text-slate-300">Upload a single PDF (auto-converted to images) or up to 5 images (≤ 4 MB total).</p>
          </div>

          <form onSubmit={handleSubmit} encType="multipart/form-data" className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="file" className="text-sm font-medium text-slate-200">
                Upload a PDF or up to 5 images (PNG/JPEG)
              </Label>
              <label
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                htmlFor="file"
                className={[
                  'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 cursor-pointer transition',
                  isDragOver ? 'border-emerald-400 bg-slate-800/70' : 'border-slate-600 hover:bg-slate-800/50',
                ].join(' ')}
              >
                <Upload className="h-6 w-6 text-emerald-400" />
                <div className="text-center">
                  <p className="text-slate-200 font-medium">Drag & drop a PDF or images here</p>
                  <p className="text-slate-400 text-sm">or click to browse</p>
                </div>
                <Input
                  ref={fileInputRef}
                  id="file"
                  name="file"
                  type="file"
                  accept={'image/png,image/jpeg,application/pdf'}
                  multiple
                  required
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {fileSummary && (
                <div className="flex items-center justify-between rounded-md bg-slate-800/70 border border-slate-700 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-300 text-sm truncate">Selected: {fileSummary}</p>
                    {fileInputRef.current?.files && (
                      <p className="text-slate-400 text-xs mt-1">
                        Total size: {formatFileSize(
                          Array.from(fileInputRef.current.files).reduce((sum, f) => sum + f.size, 0)
                        )}
                      </p>
                    )}
                  </div>
                  <Button type="button" className="h-8 px-2 text-slate-300 hover:text-white ml-2" onClick={reset} aria-label="Clear file">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <Button type="submit" disabled={loading || !fileSummary} className="w-full bg-emerald-600 hover:bg-emerald-700">
              {loading ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</span>
              ) : (
                'Analyze with Groq'
              )}
            </Button>
          </form>

          {loading && (
            <div className="mt-6 text-center">
              <div className="animate-pulse flex flex-col items-center">
                <div className="h-4 bg-slate-700 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-slate-700 rounded w-1/2"></div>
              </div>
              <p className="mt-4 text-slate-300">
                Analyzing your document. This may take a moment...
              </p>
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 bg-red-900/30 border border-red-700 rounded-md">
              <p className="text-red-300 font-medium">Error</p>
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}

          {json && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold mb-3 text-slate-100">Analysis Results</h2>
              <pre className="bg-slate-950 text-slate-100 p-4 rounded-md overflow-auto text-sm whitespace-pre-wrap border border-slate-800 shadow-inner max-h-[60vh]">
                {JSON.stringify(json, null, 2)}
              </pre>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}


