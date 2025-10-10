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
  const [formData, setFormData] = useState<ParsedResume>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setParsed(null);
    setFormData({});
    setLoading(true);
    setFileName(file.name);

    try {
      const text = await extractTextFromFile(file);
      const p = parseResumeText(text);
      setParsed(p);
      setFormData(p);
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
    const ext = file.name.split(".").pop()?.toLowerCase() || "";

    if (ext === "pdf") {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        const pdfWorker = await import("pdfjs-dist/build/pdf.worker?url");
        (pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorker.default;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await (pdfjsLib as any).getDocument({ data: arrayBuffer }).promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();

          // Group text items by line (improves accuracy for PDFs)
          const lines: Record<number, string[]> = {};
          for (const item of content.items as any[]) {
            const y = Math.round(item.transform[5]); // y-position
            if (!lines[y]) lines[y] = [];
            lines[y].push(item.str);
          }

          // Sort by y descending (PDF top-to-bottom) and join
          const sorted = Object.keys(lines)
            .sort((a, b) => Number(b) - Number(a))
            .map((y) => lines[Number(y)].join(" ").trim())
            .join("\n");

          fullText += `\n${sorted}`;
        }

        // Clean up weird spacing
        return fullText
          .replace(/\s{2,}/g, " ")
          .replace(/\n{2,}/g, "\n")
          .trim();
      } catch (e) {
        console.warn("PDF extraction fallback:", e);
        return await file.text();
      }
    }


    if (ext === "docx") {
      try {
        const mammoth = await import("mammoth");
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
      } catch (e) {
        return await file.text();
      }
    }

    return await file.text();
  }

  function parseResumeText(text: string): ParsedResume {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const joined = lines.join("\n");

    const emailMatch = joined.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = joined.match(/(\+?\d[\d \-().]{6,}\d)/);

    // --------------------------------------------
    // NAME DETECTION
    // --------------------------------------------
    let name: string | undefined;
    const locationIndicators = /(address|location|street|city|country|po box|bahrain|dubai|abu dhabi|qatar|oman|india|riyadh|ksa)/i;

    for (const l of lines.slice(0, 10)) {
      const low = l.toLowerCase();
      if (/^resume|curriculum vitae|cv|profile$/.test(low)) continue;
      if (emailMatch && l.includes(emailMatch[0])) continue;
      if (phoneMatch && l.includes(phoneMatch[0])) continue;
      if (locationIndicators.test(low)) continue;

      const words = l.split(/\s+/);
      if (
        words.length >= 2 &&
        words.length <= 4 &&
        /^[A-Z][a-zA-Z .'-]+$/.test(l) &&
        l !== l.toUpperCase()
      ) {
        name = l.trim();
        break;
      }
    }

    // --------------------------------------------
    // LOCATION DETECTION (clean: remove email/phone)
    // --------------------------------------------
    let location: string | undefined;

    const locationRegex =
      /(Address|Location|Based in|Lives in|Resident of)[:\-]?\s*([A-Za-z ,]+)/i;
    const locMatch = joined.match(locationRegex);

    if (locMatch && locMatch[2]) {
      location = locMatch[2].trim();
    } else {
      // Try to find a line that contains a country or city name
      const cityRegex =
        /\b(Manama|Bahrain|Dubai|Abu Dhabi|Sharjah|Riyadh|Jeddah|Dammam|Qatar|Oman|Kuwait|India|Chennai|Mumbai|Bangalore|Delhi|Hyderabad|Pune|USA|UK|Canada|Singapore)\b/i;
      const lineMatch = lines.find((l) => cityRegex.test(l));
      if (lineMatch) {
        // Remove email & phone if present in the same line
        let cleanLine = lineMatch;
        if (emailMatch) cleanLine = cleanLine.replace(emailMatch[0], "");
        if (phoneMatch) cleanLine = cleanLine.replace(phoneMatch[0], "");
        cleanLine = cleanLine
          .replace(/[,;|]+/g, ",") // normalize separators
          .replace(/\s{2,}/g, " ") // remove double spaces
          .trim();

        // Keep only the part after the last email/phone occurrence
        const placeMatch = cleanLine.match(/[A-Za-z ,]+$/);
        location = placeMatch ? placeMatch[0].trim() : cleanLine;
      }
    }

    // --------------------------------------------
    // SKILLS DETECTION
    // --------------------------------------------
    const skillKeywords = [
      "react",
      "next.js",
      "typescript",
      "javascript",
      "html",
      "css",
      "redux",
      "node",
      "graphql",
      "jest",
      "tailwind",
      "mui",
      "aws",
    ];
    const skillsFound = new Set<string>();
    const lower = joined.toLowerCase();
    for (const k of skillKeywords) {
      if (lower.includes(k)) skillsFound.add(k);
    }

    // --------------------------------------------
    // SUMMARY
    // --------------------------------------------
    const nameIndex = name ? lines.findIndex((l) => l.includes(name!)) : 0;
    const summary = lines.slice(nameIndex + 1, nameIndex + 4).join(" ");

    // --------------------------------------------
    // RETURN
    // --------------------------------------------
    return {
      name,
      email: emailMatch ? emailMatch[0] : undefined,
      phone: phoneMatch ? phoneMatch[0].trim() : undefined,
      summary,
      location,
      skills: Array.from(skillsFound),
    };
  }



  function handleChange(field: keyof ParsedResume, value: any) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function downloadJSON() {
    if (!formData) return;
    const blob = new Blob([JSON.stringify(formData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName || "resume"}.parsed.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">
        📄 Resume Extractor
      </h1>

      <div className="bg-white shadow-lg rounded-xl p-6 border border-gray-200">
        <label className="flex flex-col items-center px-4 py-6 bg-gray-50 text-gray-700 rounded-lg border-2 border-dashed cursor-pointer hover:bg-gray-100">
          <span className="font-medium">Upload Resume (PDF/DOCX/TXT)</span>
          <input type="file" className="hidden" accept=".pdf,.docx,.txt,.md" onChange={onFileChange} />
        </label>

        {loading && <div className="text-blue-600 mt-4">⏳ Parsing resume...</div>}
        {error && <div className="text-red-600 mt-4">⚠️ {error}</div>}

        {parsed && (
          <div className="mt-6 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">{fileName}</span>
              <button
                onClick={downloadJSON}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Download JSON
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <InputField label="Name" value={formData.name} onChange={(v) => handleChange("name", v)} />
              <InputField label="Email" value={formData.email} onChange={(v) => handleChange("email", v)} />
              <InputField label="Phone" value={formData.phone} onChange={(v) => handleChange("phone", v)} />
              <InputField label="Location" value={formData.location} onChange={(v) => handleChange("location", v)} />

              <div className="md:col-span-2">
                <Label>Summary</Label>
                <textarea
                  className="w-full border rounded-lg p-3 text-sm mt-1 focus:ring-2 focus:ring-blue-500"
                  rows={4}
                  value={formData.summary || ""}
                  onChange={(e) => handleChange("summary", e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <Label>Skills (comma separated)</Label>
                <input
                  type="text"
                  className="w-full border rounded-lg p-3 text-sm mt-1 focus:ring-2 focus:ring-blue-500"
                  value={formData.skills?.join(", ") || ""}
                  onChange={(e) =>
                    handleChange("skills", e.target.value.split(",").map((s) => s.trim()))
                  }
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="text"
        className="w-full border rounded-lg p-3 text-sm mt-1 focus:ring-2 focus:ring-blue-500"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold text-gray-700 uppercase">{children}</div>;
}
