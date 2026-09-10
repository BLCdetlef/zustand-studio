import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [backupPath, transcriptPath, candidateQuery, outputPath] = process.argv.slice(2);
if (!backupPath || !transcriptPath || !candidateQuery || !outputPath) {
  console.error("Aufruf: node scripts/attach-transcript.mjs <backup.json> <transkript.json> <kandidat> <ausgabe.json>");
  process.exit(1);
}

const backup = JSON.parse(await readFile(resolve(backupPath), "utf8"));
const transcript = JSON.parse(await readFile(resolve(transcriptPath), "utf8"));
const studio = backup.data || backup;
const query = candidateQuery.toLocaleLowerCase("de-DE");
const matches = (studio.candidates || []).filter(candidate =>
  String(candidate.name || "").toLocaleLowerCase("de-DE").includes(query),
);
if (matches.length !== 1) {
  throw new Error(`Erwartet wurde genau ein Kandidat für „${candidateQuery}“, gefunden: ${matches.length}.`);
}

const candidate = matches[0];
const previous = studio.interviews?.[candidate.id] || {};
const now = new Date().toISOString();
studio.interviews ||= {};
studio.interviews[candidate.id] = {
  ...previous,
  castopodUrl: "https://podcast.oksh.de/@zustand/episodes/zustand-2-interview-mit-prof-dr-gunther-schall",
  podcastUrl: "https://podcast.oksh.de/audio/@zustand/zustand-2-interview-mit-prof-dr-gunther-schall.mp3",
  transcriptAudioUrl: "https://podcast.oksh.de/audio/@zustand/zustand-2-interview-mit-prof-dr-gunther-schall.mp3",
  transcriptSource: "Groq · whisper-large-v3",
  transcript: String(transcript.text || "").trim(),
  transcriptStatus: "draft",
  transcriptSegments: Array.isArray(transcript.segments) ? transcript.segments : [],
  transcriptUpdatedAt: now,
  transcriptReviewedAt: "",
  transcriptApprovedAt: "",
};
if (backup.data) backup.exportedAt = now;

await writeFile(resolve(outputPath), `${JSON.stringify(backup, null, 2)}\n`, "utf8");
console.log(`Transkript wurde ${candidate.name} als Entwurf zugeordnet: ${resolve(outputPath)}`);
