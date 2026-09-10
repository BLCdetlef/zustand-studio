import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const DEFAULT_AUDIO_URL =
  "https://podcast.oksh.de/audio/@zustand/zustand-1-vorstellung-der-sendung-mit-chatgpt.mp3";

async function loadLocalEnvironment() {
  try {
    const contents = await readFile(resolve(".env.local"), "utf8");
    const trimmedContents = contents.trim();
    if (trimmedContents && !trimmedContents.includes("=") && !trimmedContents.includes("\n")) {
      process.env.GROQ_API_KEY ||= trimmedContents;
      return;
    }
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

await loadLocalEnvironment();

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey || apiKey === "hier_den_groq_api_schluessel_eintragen") {
  console.error(
    "GROQ_API_KEY fehlt. Kopiere .env.local.example nach .env.local und trage dort den Schlüssel ein.",
  );
  process.exit(1);
}

const audioUrl = process.argv[2] || DEFAULT_AUDIO_URL;
const model = process.argv[3] || "whisper-large-v3";

async function inspectMediaUrl(initialUrl) {
  let currentUrl = initialUrl;
  for (let redirect = 0; redirect < 5; redirect++) {
    const response = await fetch(currentUrl, { method: "HEAD", redirect: "manual" });
    if (response.status < 300 || response.status >= 400) {
      return {
        url: currentUrl,
        size: Number(response.headers.get("content-length")) || 0,
        contentType: response.headers.get("content-type") || "audio/mpeg",
      };
    }
    const location = response.headers.get("location");
    if (!location) return { url: currentUrl, size: 0, contentType: "audio/mpeg" };
    currentUrl = new URL(location, currentUrl).href;
  }
  throw new Error("Die Audio-URL wurde mehr als fünfmal weitergeleitet.");
}

async function sendToGroq({ url, bytes, filename = "audio.mp3", contentType = "audio/mpeg" }) {
  const form = new FormData();
  if (url) form.append("url", url);
  else form.append("file", new Blob([bytes], { type: contentType }), filename);
  form.append("model", model);
  form.append("language", "de");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Groq antwortet mit HTTP ${response.status}: ${details}`);
  }
  return response.json();
}

console.log(`Transkription wird gestartet: ${audioUrl}`);
const media = await inspectMediaUrl(audioUrl);
const GROQ_FREE_LIMIT = 25 * 1024 * 1024;
const CHUNK_SIZE = 20 * 1024 * 1024;
let transcript;

if (!media.size || media.size <= GROQ_FREE_LIMIT) {
  transcript = await sendToGroq({ url: media.url });
} else {
  const parts=[];
  let timeOffset=0;
  const count=Math.ceil(media.size/CHUNK_SIZE);
  console.log(`Audiodatei ist ${(media.size/1024/1024).toFixed(1)} MB groß; Verarbeitung in ${count} Speicherabschnitten.`);
  for(let index=0;index<count;index++){
    const start=index*CHUNK_SIZE;
    const end=Math.min(media.size-1,start+CHUNK_SIZE-1);
    console.log(`Abschnitt ${index+1}/${count} wird übertragen.`);
    const chunkResponse=await fetch(media.url,{headers:{Range:`bytes=${start}-${end}`}});
    if(chunkResponse.status!==206)throw new Error("Der Podcastserver unterstützt keine abschnittsweise Audioübertragung.");
    const bytes=await chunkResponse.arrayBuffer();
    const part=await sendToGroq({bytes,filename:`audio-part-${index+1}.mp3`,contentType:media.contentType});
    const segments=Array.isArray(part.segments)?part.segments.map(segment=>({
      ...segment,start:(Number(segment.start)||0)+timeOffset,end:(Number(segment.end)||0)+timeOffset
    })):[];
    parts.push({...part,segments});
    timeOffset+=Number(part.duration)||0;
  }
  transcript={
    task:parts[0]?.task||"transcribe",
    language:parts[0]?.language||"German",
    duration:timeOffset,
    text:parts.map(part=>String(part.text||"").trim()).filter(Boolean).join(" "),
    segments:parts.flatMap(part=>part.segments||[]),
    chunkCount:parts.length
  };
}

const sourceName = basename(new URL(audioUrl).pathname).replace(/\.[^.]+$/, "");
const outputDirectory = resolve("transcripts");
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(
    resolve(outputDirectory, `${sourceName}.json`),
    `${JSON.stringify(transcript, null, 2)}\n`,
    "utf8",
  ),
  writeFile(resolve(outputDirectory, `${sourceName}.txt`), `${transcript.text.trim()}\n`, "utf8"),
]);

console.log(`Fertig. Dateien liegen in: ${outputDirectory}`);
