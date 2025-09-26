import React, { useState, type JSX } from "react";

type ParsedResume = {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  skills?: string[];
};

export default function ResumeExtractor(): JSX.Element {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setParsed(null);
    setLoading(true);
    setFileName(file.name);

    try {
      const text = await extractTextFromFile(file);
      const p = parseResumeText(text);
      setParsed(p);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0];
    if (f) await handleFile(f);
  }

  async function extractTextFromFile(file: File): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (ext === 'pdf') {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        const pdfWorker = await import("pdfjs-dist/build/pdf.worker?url");
        (pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorker.default;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await (pdfjsLib as any).getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = (content.items as any[]).map((it: any) => (it.str ? it.str : '')).join(' ');
          fullText += `\n\n${pageText}`;
        }
        return fullText;
      } catch (e) {
        console.warn('pdfjs not available or failed — returning fallback', e);
        return await file.text();
      }
    }

    if (ext === 'docx') {
      try {
        const mammoth = await import('mammoth');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
      } catch (e) {
        console.warn('mammoth not available, falling back to text', e);
        return await file.text();
      }
    }

    return await file.text();
  }

  function parseResumeText(text: string): ParsedResume {
    const lines = text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    const joined = lines.join('\n');

    const emailMatch = joined.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = joined.match(/(\+?\d[\d \-().]{6,}\d)/);

    let name: string | undefined;
    for (const l of lines.slice(0, 6)) {
      const low = l.toLowerCase();
      if (/^resume|curriculum vitae|cv|profile$/.test(low)) continue;
      if (emailMatch && l.includes(emailMatch[0])) continue;
      if (phoneMatch && l.includes(phoneMatch[0])) continue;
      const words = l.split(/\s+/);
      if (words.length >= 1 && words.length <= 4 && /^[A-Za-z .'-]+$/.test(l)) {
        name = l;
        break;
      }
    }

    const skillKeywords = [
      'react', 'reactjs', 'next.js', 'nextjs', 'typescript', 'javascript', 'html', 'css', 'scss', 'sass', 'redux', 'mobx', 'node', 'nodejs', 'graphql', 'rest', 'api', 'jest', 'testing', 'webpack', 'vite', 'storybook', 'tailwind', 'mui', 'material-ui', 'aws'
    ];
    const skillsFound = new Set<string>();
    const lower = joined.toLowerCase();
    for (const k of skillKeywords) {
      if (lower.includes(k)) skillsFound.add(k);
    }

    let summary: string | undefined;
    if (name) {
      const idx = lines.findIndex(l => l === name);
      if (idx >= 0) {
        const next = lines.slice(idx + 1, idx + 4).join(' ');
        summary = next;
      }
    } else if (lines.length > 0) {
      summary = lines.slice(0, 3).join(' ');
    }

    const locMatch = joined.match(/\b([A-Za-z ]+,?\s*(?:[A-Za-z]{2,}|[A-Za-z]{2,} \d{5}))\b/);

    return {
      name,
      email: emailMatch ? emailMatch[0] : undefined,
      phone: phoneMatch ? phoneMatch[0].trim() : undefined,
      location: locMatch ? locMatch[0] : undefined,
      summary,
      skills: Array.from(skillsFound),
    };
  }

  function downloadJSON() {
    if (!parsed) return;
    const blob = new Blob([JSON.stringify(parsed, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName || 'resume'}.parsed.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">Resume Extractor (React + TypeScript)</h1>

      <label className="block mb-4">
        <span className="sr-only">Upload resume</span>
        <input type="file" accept=".pdf,.docx,.txt,.md" onChange={onFileChange} />
      </label>

      <div className="mb-4">
        <div className="text-sm text-gray-600">Supported formats: PDF, DOCX (mammoth), plain text.</div>
      </div>

      {loading && <div className="mb-4">Parsing... please wait ⏳</div>}
      {error && <div className="mb-4 text-red-600">Error: {error}</div>}

      {parsed && (
        <div className="bg-white shadow rounded p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="text-lg font-medium">Parsed Result</div>
              <div className="text-sm text-gray-500">{fileName}</div>
            </div>
            <div className="space-x-2">
              <button onClick={downloadJSON} className="px-3 py-1 border rounded">Download JSON</button>
              <button onClick={() => navigator.clipboard?.writeText(JSON.stringify(parsed, null, 2))} className="px-3 py-1 border rounded">Copy</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Name" value={parsed.name} />
            <Field label="Email" value={parsed.email} />
            <Field label="Phone" value={parsed.phone} />
            <Field label="Location" value={parsed.location} />
            <div className="md:col-span-2">
              <Label>Summary</Label>
              <pre className="whitespace-pre-wrap bg-gray-50 rounded p-2 text-sm">{parsed.summary || '—'}</pre>
            </div>
            <div className="md:col-span-2">
              <Label>Skills</Label>
              {parsed.skills && parsed.skills.length > 0 ? (
                <div className="flex flex-wrap gap-5 mt-2">
                  {parsed.skills.map(s => (
                    <span key={s} className="px-2 py-1 border rounded text-sm">{s}</span>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500 mt-2">No skills detected</div>
              )}
            </div>
          </div>
        </div>
      )}

      {!parsed && !loading && (
        <div className="text-sm text-gray-500 mt-4">Upload a resume to extract basic fields like name, email, phone, skills and more.</div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 text-sm">{value || '—'}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold text-gray-600">{children}</div>;
}
