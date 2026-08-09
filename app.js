const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const KEY="zustandStudioPrototypeV1";

class LocalDemoStorage {
  load(){ try{return JSON.parse(localStorage.getItem(KEY))||this.empty()}catch{return this.empty()} }
  save(data){ localStorage.setItem(KEY,JSON.stringify(data)) }
  clear(){ localStorage.removeItem(KEY) }
  empty(){return {candidates:[], acquisition:{}, interviews:{}, zDrafts:{}}}
}

// Später austauschbar: class NextcloudStorage { load(); save(); ... }
const storage = new LocalDemoStorage();
let data=storage.load();

function persist(){storage.save(data); renderAll()}

function nav(view){
  $$(".view").forEach(x=>x.classList.remove("active"));
  $("#"+view).classList.add("active");
  $$("nav button").forEach(x=>x.classList.toggle("active",x.dataset.view===view));
}
$$("nav button").forEach(b=>b.onclick=()=>nav(b.dataset.view));

$("#makePrompt").onclick=()=>{
  const topic=$("#topic").value.trim()||"[THEMA]";
  const region=$("#region").value.trim();
  const focus=$("#focus").value.trim();
  const language=$("#language").value;
  $("#promptOutput").value=`Suche nicht zuerst nach bekannten Expert:innen, sondern nach interessanten langfristigen Messreihen, Monitoringprogrammen, Datensätzen und wiederholten Untersuchungen zum Thema ${topic}.
Bevorzuge Untersuchungen, die Veränderungen über mindestens mehrere Jahre, besser Jahrzehnte quantitativ zeigen. Suche anschließend nach den Personen, die diese Daten erheben, auswerten oder wissenschaftlich betreuen. Bevorzuge die tatsächlich mit der Messreihe arbeitenden Fachleute gegenüber bloß medienbekannten Personen oder Institutsleitungen.
Prüfe je Kandidat: Was wird gemessen und seit wann? Welche Entwicklung ist erkennbar? Warum ist sie für natürliche Lebensgrundlagen bzw. planetare Grenzen relevant? Welche Ursachen, Folgen, Zusammenhänge und Unsicherheiten lassen sich erklären? Gibt es eine seriöse institutionelle Kontaktmöglichkeit?
Regionale Priorität: ${region}.
Interviewsprache: ${language}. Bei "Deutsch bevorzugt" suche aktiv nach deutschsprachigen Fachleuten mit möglichst vergleichbarer Nähe zu den relevanten Messdaten. Internationale Kandidat:innen dürfen zusätzlich genannt werden, wenn ihre fachliche Eignung außergewöhnlich ist.${focus?`\nZusätzlicher Fokus: ${focus}.`:""}
Wähle maximal fünf wirklich geeignete Personen. Nenne Messreihe/Untersuchung, Zeitraum, wichtigste Veränderung, Rolle der Person, mögliche Kernfrage fürs Interview und offizielle Kontaktquelle. Kennzeichne hohe Medienpräsenz und bevorzuge bei gleicher Eignung Personen, deren konkrete Forschungsarbeit weniger öffentlich sichtbar ist.
Ziel ist ein verständliches 20–30-minütiges Interview für ZUSTAND / TH Lübeck und den Offenen Kanal Lübeck: nicht nur „dass“ sich etwas verändert, sondern wie wir es wissen, warum es geschieht und womit es zusammenhängt.`;
};

function copy(id){navigator.clipboard.writeText($(id).value)}
$("#copyPrompt").onclick=()=>copy("#promptOutput");
$("#copyMail").onclick=()=>copy("#mailOutput");

$("#newCandidate").onclick=()=>$("#candidateForm").classList.remove("hidden");
$("#closeCandidate").onclick=()=>$("#candidateForm").classList.add("hidden");

$("#saveCandidate").onclick=()=>{
  const name=$("#cName").value.trim();
  if(!name)return alert("Bitte einen Namen eintragen.");
  data.candidates.push({
    id:crypto.randomUUID(),
    name,
    institution:$("#cInstitution").value.trim(),
    topic:$("#cTopic").value.trim(),
    period:$("#cPeriod").value.trim(),
    email:$("#cEmail").value.trim(),
    source:$("#cSource").value.trim(),
    why:$("#cWhy").value.trim(),
    question:$("#cQuestion").value.trim()
  });
  ["#cName","#cInstitution","#cTopic","#cPeriod","#cEmail","#cSource","#cWhy","#cQuestion"].forEach(x=>$(x).value="");
  $("#candidateForm").classList.add("hidden");
  persist();
};

// JSON-Import: optional und abwärtskompatibel.
// Die App läuft auch mit einer älteren index.html ohne Import-Button weiter.
const importButton=$("#importCandidates");
const importFile=$("#candidateImportFile");

if(importButton && importFile){
  importButton.onclick=()=>importFile.click();

  importFile.onchange=async e=>{
    const file=e.target.files?.[0];
    if(!file)return;

    try{
      const parsed=JSON.parse(await file.text());
      const incoming=Array.isArray(parsed)?parsed:parsed?.candidates;

      if(!Array.isArray(incoming)){
        throw new Error("Die JSON-Datei enthält keine Kandidatenliste.");
      }

      let added=0;
      let skipped=0;

      for(const raw of incoming){
        const name=String(raw?.name||"").trim();
        if(!name){skipped++; continue}

        const institution=String(raw?.institution||"").trim();
        const duplicate=data.candidates.some(c=>
          String(c.name||"").trim().toLocaleLowerCase()===name.toLocaleLowerCase() &&
          String(c.institution||"").trim().toLocaleLowerCase()===institution.toLocaleLowerCase()
        );

        if(duplicate){skipped++; continue}

        data.candidates.push({
          id:crypto.randomUUID(),
          name,
          institution,
          topic:String(raw?.topic||raw?.measurement||"").trim(),
          period:String(raw?.period||"").trim(),
          email:String(raw?.email||raw?.contact||"").trim(),
          source:String(raw?.source||raw?.sourceUrl||"").trim(),
          why:String(raw?.why||raw?.reason||"").trim(),
          question:String(raw?.question||raw?.coreQuestion||"").trim()
        });
        added++;
      }

      persist();
      nav("candidates");
      alert(`${added} Kandidat${added===1?"":"en"} importiert.${skipped?` ${skipped} Eintrag${skipped===1?"":"e"} übersprungen (Dubletten oder ohne Namen).`:""}`);
    }catch(err){
      alert("Import nicht möglich: "+err.message);
    }finally{
      e.target.value="";
    }
  };
}

function candidateOptions(){
  const opts='<option value="">Bitte auswählen</option>'+data.candidates.map(c=>`<option value="${c.id}">${esc(c.name)}${c.institution?" · "+esc(c.institution):""}</option>`).join("");
  ["#aCandidate","#iCandidate","#zCandidate"].forEach(s=>{
    const old=$(s).value;
    $(s).innerHTML=opts;
    $(s).value=old;
  });
}

function esc(s=""){
  return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}

function renderCandidates(){
  $("#candidateCount").textContent=data.candidates.length;
  $("#candidateList").innerHTML=data.candidates.length
    ? data.candidates.map(c=>`<article class="card candidate"><div><h3>${esc(c.name)}</h3><div class="meta">${esc(c.institution)} ${c.period?"· "+esc(c.period):""}</div><p><b>${esc(c.topic)}</b></p>${c.why?`<p>${esc(c.why)}</p>`:""}<span class="tag">${esc((data.acquisition[c.id]||{}).status||"noch nicht angeschrieben")}</span></div><button class="ghost" onclick="removeCandidate('${c.id}')">Entfernen</button></article>`).join("")
    : '<div class="card"><p>Noch keine Kandidaten. Die erste Recherche kann jetzt beginnen.</p></div>';
}

window.removeCandidate=id=>{
  if(confirm("Kandidaten aus dem lokalen Prototyp entfernen?")){
    data.candidates=data.candidates.filter(c=>c.id!==id);
    delete data.acquisition[id];
    delete data.interviews[id];
    delete data.zDrafts[id];
    persist();
  }
};

function selected(sel){return data.candidates.find(c=>c.id===$(sel).value)}

function makeMail(){
  const c=selected("#aCandidate");
  if(!c){$("#mailOutput").value="";return}

  $("#mailOutput").value=`Betreff: Interviewanfrage – ZUSTAND / TH Lübeck
Guten Tag ${c.name},

für das Projekt „ZUSTAND – Die Vermessung unserer Zukunft“ an der TH Lübeck suche ich Gesprächspartnerinnen und Gesprächspartner, die langfristige Veränderungen unserer natürlichen Lebensgrundlagen anhand eigener Messungen oder belastbarer Daten verständlich einordnen können.

${c.topic?`Ihre Arbeit zu ${c.topic} finde ich dafür besonders interessant.\n\n`:""}Hätten Sie Interesse an einem etwa 20–30-minütigen Gespräch beim Offenen Kanal Lübeck?
Bei Interesse schicke ich Ihnen gern kurz weitere Informationen.

Beste Grüße
Detlef Hau
TH Lübeck`;

  const a=data.acquisition[c.id]||{};
  $("#aStatus").value=a.status||"noch nicht angeschrieben";
  $("#aNote").value=a.note||"";
}

$("#aCandidate").onchange=makeMail;
$("#saveAcquisition").onclick=()=>{
  const c=selected("#aCandidate");
  if(!c)return alert("Bitte Kandidaten auswählen.");
  data.acquisition[c.id]={status:$("#aStatus").value,note:$("#aNote").value};
  persist();
};

function getInterview(c){
  if(!c)return {intro:"",notes:""};
  const saved=data.interviews[c.id];
  // Abwärtskompatibel: alte Version speicherte nur den Leitfaden als String.
  if(typeof saved==="string")return {intro:"",notes:saved};
  return saved||{intro:"",notes:""};
}

$("#iCandidate").onchange=()=>{
  const c=selected("#iCandidate");
  const interview=getInterview(c);
  $("#iIntro").value=interview.intro||"";
  $("#iNotes").value=interview.notes||"";
  stopTraining();
};

$("#saveInterview").onclick=()=>{
  const c=selected("#iCandidate");
  if(!c)return alert("Bitte Kandidaten auswählen.");
  data.interviews[c.id]={
    intro:$("#iIntro").value,
    notes:$("#iNotes").value
  };
  persist();
};

$("#zCandidate").onchange=()=>{
  const c=selected("#zCandidate");
  const z=c?(data.zDrafts[c.id]||{}):{};
  $("#zTitle").value=z.title||"";
  $("#zSummary").value=z.summary||"";
  $("#zSource").value=z.source||(c?c.source:"");
};

$("#saveZ").onclick=()=>{
  const c=selected("#zCandidate");
  if(!c)return alert("Bitte Kandidaten auswählen.");
  data.zDrafts[c.id]={
    title:$("#zTitle").value,
    summary:$("#zSummary").value,
    source:$("#zSource").value
  };
  persist();
};

$("#clearDemo").onclick=()=>{
  if(confirm("Alle lokal im Browser gespeicherten Demo-Daten löschen?")){
    storage.clear();
    data=storage.load();
    renderAll();
    nav("research");
  }
};


// --- Interview-Trainer -------------------------------------------------------
let trainerItems=[];
let trainerIndex=0;
let trainerRound=1;
let trainerRunning=false;
let trainerPaused=false;
let trainerWait=null;
let trainerVoices=[];
let trainerWakeLock=null;

function parseTrainingQuestions(text){
  return String(text||"")
    .split(/\n\s*\n|\n/)
    .map(x=>x.replace(/^\s*(?:[-•]|\d+[.)])\s*/,"").trim())
    .filter(Boolean);
}

function loadTrainerVoices(){
  trainerVoices=speechSynthesis.getVoices();
  const select=$("#trainingVoice");
  if(!select)return;
  const old=select.value;
  const german=trainerVoices.map((v,i)=>({v,i})).filter(x=>/^de/i.test(x.v.lang));
  const list=german.length?german:trainerVoices.map((v,i)=>({v,i}));
  select.innerHTML=list.map(({v,i})=>`<option value="${i}">${esc(v.name)} (${esc(v.lang)})</option>`).join("");
  if([...select.options].some(o=>o.value===old))select.value=old;
}
if("speechSynthesis" in window){
  speechSynthesis.addEventListener?.("voiceschanged",loadTrainerVoices);
  loadTrainerVoices();
}

function trainerVoice(){
  const i=Number($("#trainingVoice")?.value);
  return trainerVoices[i]||trainerVoices.find(v=>/^de/i.test(v.lang))||trainerVoices[0];
}

function trainerSpeak(text){
  return new Promise(resolve=>{
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text);
    const v=trainerVoice();
    if(v)u.voice=v;
    u.lang=v?.lang||"de-DE";
    u.rate=Number($("#trainingRate").value||0.95);
    u.onend=resolve;
    u.onerror=resolve;
    speechSynthesis.speak(u);
  });
}

function trainerDelay(ms){
  return new Promise(resolve=>{trainerWait=setTimeout(resolve,ms)});
}

async function trainerLock(){
  try{if("wakeLock" in navigator)trainerWakeLock=await navigator.wakeLock.request("screen")}catch{}
}
function trainerUnlock(){try{trainerWakeLock?.release()}catch{} trainerWakeLock=null}

function buildTraining(){
  const c=selected("#iCandidate");
  if(!c)return false;
  const intro=$("#iIntro").value.trim();
  const qs=parseTrainingQuestions($("#iNotes").value);
  trainerItems=[];
  if(intro)trainerItems.push({kind:"Anmoderation",text:intro});
  qs.forEach((q,i)=>trainerItems.push({kind:`Frage ${i+1}`,text:q}));
  return trainerItems.length>0;
}

async function trainerLoop(){
  if(!trainerRunning||trainerPaused||!trainerItems.length)return;
  const item=trainerItems[trainerIndex];
  $("#trainingStatus").textContent=item.kind;
  $("#trainingRound").textContent=`Runde ${trainerRound}`;
  $("#trainingText").textContent=item.text;

  // Die Ansage trennt Anmoderation und Fragen akustisch.
  await trainerSpeak(item.kind);
  if(!trainerRunning||trainerPaused)return;
  await trainerDelay(500);
  await trainerSpeak(item.text);
  if(!trainerRunning||trainerPaused)return;

  $("#trainingStatus").textContent=item.kind==="Anmoderation"?"Jetzt Anmoderation laut nachsprechen …":"Jetzt Frage laut sprechen / Antwort üben …";
  await trainerDelay(Number($("#trainingPause").value||10)*1000);
  if(!trainerRunning||trainerPaused)return;

  trainerIndex++;
  if(trainerIndex>=trainerItems.length){
    trainerIndex=0;
    trainerRound++;
  }
  trainerLoop();
}

function startTraining(){
  if(!("speechSynthesis" in window))return alert("Dieser Browser unterstützt die Sprachausgabe leider nicht.");
  const c=selected("#iCandidate");
  if(!c)return alert("Bitte zuerst einen Kandidaten auswählen.");
  // Änderungen vor Trainingsstart automatisch speichern.
  data.interviews[c.id]={intro:$("#iIntro").value,notes:$("#iNotes").value};
  storage.save(data);

  if(!buildTraining())return alert("Bitte Anmoderation oder Fragen eintragen.");
  trainerRunning=true;
  trainerPaused=false;
  trainerIndex=0;
  trainerRound=1;
  $("#trainingPanel").classList.remove("hidden");
  $("#trainingPlay").textContent="▶ Läuft";
  trainerLock();
  trainerLoop();
  $("#trainingPanel").scrollIntoView({behavior:"smooth",block:"start"});
}

function pauseTraining(){
  if(!trainerRunning)return;
  trainerPaused=true;
  trainerRunning=false;
  speechSynthesis.cancel();
  clearTimeout(trainerWait);
  $("#trainingStatus").textContent="Pausiert";
  $("#trainingPlay").textContent="▶ Weiter";
  trainerUnlock();
}

function resumeTraining(){
  if(trainerRunning)return;
  if(!trainerItems.length){startTraining();return}
  trainerRunning=true;
  trainerPaused=false;
  $("#trainingPlay").textContent="▶ Läuft";
  trainerLock();
  trainerLoop();
}

function stopTraining(){
  trainerRunning=false;
  trainerPaused=false;
  speechSynthesis?.cancel();
  clearTimeout(trainerWait);
  trainerUnlock();
  if($("#trainingStatus"))$("#trainingStatus").textContent="Bereit";
  if($("#trainingPlay"))$("#trainingPlay").textContent="▶ Training starten";
}

$("#startTraining").onclick=startTraining;
$("#trainingPlay").onclick=()=>trainerPaused?resumeTraining():trainerRunning?null:startTraining();
$("#trainingPauseBtn").onclick=pauseTraining;
$("#trainingStop").onclick=stopTraining;
$("#closeTraining").onclick=()=>{stopTraining();$("#trainingPanel").classList.add("hidden")};

document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible"&&trainerRunning)trainerLock();
});


function renderAll(){renderCandidates();candidateOptions();makeMail()}
renderAll();
