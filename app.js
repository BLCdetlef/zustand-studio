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
$$("nav button").forEach(b=>b.onclick=()=>{
  nav(b.dataset.view);
  if(b.dataset.view==="interview"){
    showInterviewForSelectedCandidate(false);
  }
});

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
    const el=$(s);
    const old=el.value;
    el.innerHTML=opts;
    if(old && data.candidates.some(c=>c.id===old)){
      el.value=old;
    }else{
      el.value="";
    }
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

function makeInterviewDraft(c){
  if(!c)return {intro:"",notes:""};

  const name=c.name||"mein Gast";
  const institution=c.institution||"";
  let intro="";
  let questions=[];

  if(/melvin\s+lippe/i.test(name)){
    intro=`Heute geht es um die Frage, wie wir Veränderungen des globalen Waldbestands überhaupt verlässlich messen können. Mein Gast ist Dr. Melvin Lippe vom Thünen-Institut für Waldwirtschaft in Hamburg. Er arbeitet mit globalen Wald- und Fernerkundungsdaten und untersucht unter anderem, wie unterschiedliche satellitenbasierte Waldkarten zu bewerten sind. Mich interessiert deshalb nicht nur, wie viel Wald verloren geht, sondern zunächst: Woher wissen wir das eigentlich?`;
    questions=[
      "Herr Lippe, bevor wir über Waldverlust sprechen: Woher wissen wir überhaupt, wie viel Wald es auf der Erde gibt?",
      "Sie vergleichen unterschiedliche globale Wald- und Baumbedeckungsdatensätze. Was misst ein Satellit dabei tatsächlich – und was wird erst durch Auswertung und Klassifikation daraus?",
      "Warum können zwei seriöse globale Waldkarten für dieselbe Region zu unterschiedlichen Ergebnissen kommen?",
      "Wie unterscheiden sich satellitengestützte Messreihen von den Waldmeldungen der Nationalstaaten an die FAO?",
      "Wenn ein Staat eine stabile Waldfläche meldet, Satellitendaten aber deutliche Verluste der Baumbedeckung zeigen: Müssen sich diese Aussagen widersprechen?",
      "Wie weit können wir mit vergleichbaren Satellitendaten heute zurückblicken, und was verändert sich dadurch an unserem Bild der globalen Waldentwicklung?",
      "Welche Rolle spielen Walddefinition, räumliche Auflösung und die Unterscheidung zwischen Entwaldung, Degradation und vorübergehendem Verlust der Baumbedeckung?",
      "Welche Ursachen für Waldverlust lassen sich aus den Daten selbst erkennen – etwa Landwirtschaft, Feuer oder Holznutzung – und wo braucht man zusätzliche Informationen?",
      "Warum ist diese Entwicklung nicht nur eine Frage des Klimas, sondern auch von Wasserhaushalt, Biodiversität und anderen natürlichen Lebensgrundlagen?",
      "Wo liegen aus Ihrer Sicht die größten Unsicherheiten, wenn heute weltweit Zahlen zum Waldverlust veröffentlicht werden?",
      "Wenn Sie sich eine einzige Verbesserung im globalen Waldmonitoring wünschen könnten: Welche wäre das?"
    ];
  } else if(/michael\s+köhl/i.test(name)){
    intro=`Heute möchte ich genauer verstehen, wie globale Waldzahlen eigentlich entstehen. Mein Gast ist Professor Michael Köhl von der Universität Hamburg. Er hat über viele Jahre zu Waldinventuren, internationaler Waldberichterstattung und Fernerkundung gearbeitet. Damit kann er zwei Welten miteinander verbinden: Messungen direkt im Wald und den Blick aus dem Weltraum.`;
    questions=[
      "Herr Köhl, wenn wir sagen, die Erde habe eine bestimmte Zahl von Milliarden Hektar Wald: Wie kommt eine solche Zahl überhaupt zustande?",
      "Wie funktioniert eine klassische Waldinventur – was wird draußen im Wald tatsächlich gemessen?",
      "Was kann eine solche Inventur erfassen, was ein Satellit nicht erkennen kann?",
      "Und umgekehrt: Was können Satelliten heute besser als nationale Inventuren?",
      "Die FAO führt die Angaben vieler Staaten zu einer globalen Waldstatistik zusammen. Wie vergleichbar sind diese nationalen Daten wirklich?",
      "Wie hat sich die Qualität der globalen Waldbeobachtung seit den frühen FAO-Erhebungen beziehungsweise seit 1990 verändert?",
      "Was ist methodisch schwieriger zu erfassen: vollständige Entwaldung oder die schleichende Degradation eines Waldes?",
      "Kann die globale Waldfläche relativ stabil aussehen, obwohl sich der ökologische Zustand der Wälder gleichzeitig verschlechtert?",
      "Welche Bedeutung haben Waldveränderungen für Kohlenstoffspeicherung, Wasserhaushalt und Biodiversität?",
      "Wie groß sind die Unsicherheiten der Zahlen – und werden diese Unsicherheiten in Medien und Öffentlichkeit ausreichend sichtbar?",
      "Welche Zahl oder Entwicklung würden Sie einem Publikum besonders gern zeigen, damit es den Zustand der Wälder besser versteht?"
    ];
  } else if(/martin\s+herold/i.test(name)){
    intro=`Mein heutiger Gast ist Professor Martin Herold vom GFZ Helmholtz-Zentrum für Geoforschung in Potsdam. Er beschäftigt sich mit Fernerkundung und der Beobachtung von Veränderungen der Landoberfläche. Beim Wald bedeutet das: Satelliten liefern über Jahre und Jahrzehnte immer wieder Messungen derselben Gebiete. Wir wollen verstehen, was diese Messungen tatsächlich zeigen – und wo ihre Grenzen liegen.`;
    questions=[
      "Herr Herold, wenn ein Satellit über einen Wald fliegt: Was misst sein Sensor eigentlich ganz konkret?",
      "Wie wird aus reflektiertem Licht oder einem Radarsignal anschließend die Aussage: Hier steht Wald oder hier ist Wald verloren gegangen?",
      "Warum ist die lange Landsat-Messreihe für unser Wissen über globale Waldveränderungen so wichtig?",
      "Was haben wir durch Satelliten über Entwaldung gelernt, das wir allein aus nationalen Statistiken nicht hätten wissen können?",
      "Wo stimmen Satellitenbeobachtungen und staatliche Waldmeldungen gut überein – und warum können sie voneinander abweichen?",
      "Wie zuverlässig können Satelliten zwischen dauerhafter Entwaldung, Waldbrand, Holzeinschlag und späterer Wiederbewaldung unterscheiden?",
      "Mit Sentinel-Radardaten lassen sich Waldstörungen inzwischen sehr schnell erkennen. Was bedeutet dieser Fortschritt gegenüber älteren Messverfahren?",
      "Können wir mit Fernerkundung inzwischen auch den Zustand oder die Biomasse eines Waldes beurteilen und nicht nur seine Fläche?",
      "Welche Veränderungen des globalen Waldes sind in den vergangenen Jahrzehnten besonders deutlich geworden?",
      "Wie hängen diese Veränderungen mit Klima, Kohlenstoffkreislauf, Wasser und Biodiversität zusammen?",
      "Wo würden Sie trotz der enormen Datenmengen sagen: Das wissen wir über den globalen Wald noch erstaunlich schlecht?"
    ];
  } else if(/christelle\s+vancutsem/i.test(name)){
    intro=`Heute schauen wir mit Satellitendaten mehr als drei Jahrzehnte zurück. Mein Gast ist Christelle Vancutsem vom Joint Research Centre der Europäischen Kommission. Sie arbeitet am Tropical Moist Forest Monitoring, das Landsat-Aufnahmen tropischer Feuchtwälder seit 1990 systematisch auswertet. Dadurch lassen sich Entwaldung, Schädigung und teilweise auch Regeneration über lange Zeiträume verfolgen.`;
    questions=[
      "Ms Vancutsem, your monitoring looks back to 1990. Why is such a long and consistent satellite record scientifically so valuable?",
      "What exactly do you classify in the Tropical Moist Forest dataset: intact forest, degradation, deforestation and regrowth?",
      "How can Landsat images with a resolution of about 30 metres reveal changes that happened many years ago?",
      "What do more than three decades of observations tell us about the overall development of tropical moist forests?",
      "Which changes can satellite data reveal that may remain hidden in national forest statistics?",
      "How do you distinguish permanent deforestation from temporary disturbances such as fire, selective logging or storms?",
      "Can the data show whether forests recover after a disturbance – and whether that regrowth is ecologically comparable to the original forest?",
      "Where are the strongest regional differences in the long-term trends?",
      "How are agriculture, fires and infrastructure reflected in the patterns you observe?",
      "Why are tropical forest changes important not only for carbon emissions but also for biodiversity and the water cycle?",
      "What is the most important uncertainty that people should keep in mind when interpreting global satellite maps of forest change?"
    ];
  } else if(/anssi\s+pekkarinen/i.test(name)){
    intro=`Heute geht es um eine der ältesten globalen Beobachtungen unserer natürlichen Lebensgrundlagen: die Waldressourcenerhebung der Welternährungsorganisation FAO. Mein Gast ist Anssi Pekkarinen von der FAO Forestry Division. Er arbeitet am Global Forest Resources Assessment, das Informationen der Staaten zusammenführt und mit Fernerkundung ergänzt. Besonders interessiert mich, warum wir im Satellitenzeitalter weiterhin beides brauchen.`;
    questions=[
      "Mr Pekkarinen, the FAO has assessed the world's forests for many decades. How far back does this global observation actually reach?",
      "How does the Global Forest Resources Assessment obtain its data from individual countries?",
      "How do you make national forest inventories and definitions sufficiently comparable to produce a global trend?",
      "What is the most important change in global forest area since 1990?",
      "The net loss of forest has slowed, while deforestation continues. Why is the distinction between net change and gross deforestation so important?",
      "Why does the FAO still need national reports when satellites can now observe almost the entire land surface?",
      "What can national forest inventories tell us that satellite images cannot?",
      "And what does the FAO's Remote Sensing Survey add as an independent source of information?",
      "Where do satellite observations and national reports tend to disagree, and what can we learn from those differences?",
      "How well can global statistics capture forest degradation and ecological quality rather than simply forest area?",
      "If you had to choose one long-term number that best describes the state of the world's forests today, which one would you choose – and why?"
    ];
  } else {
    const topic=c.topic||"der zugrunde liegenden Messreihe";
    intro=`Mein Gast ist ${name}${institution?` von ${institution}`:""}. ${name} arbeitet zu ${topic}. Im Gespräch möchte ich verstehen, was langfristige Messungen tatsächlich zeigen, wie zuverlässig wir Veränderungen erkennen können und womit sie zusammenhängen.`;
    questions=[
      `Was genau wird bei ${topic} gemessen – und wie?`,
      c.period?`Die Messreihe reicht ${c.period}. Warum ist gerade dieser lange Zeitraum wichtig?`:"Wie weit reicht die Messreihe zurück und warum ist dieser Zeitraum wichtig?",
      "Welche langfristige Veränderung ist in den Daten besonders deutlich zu erkennen?",
      c.question||"Welche zentrale Frage lässt sich mit diesen Daten beantworten?",
      "Welche Ursachen lassen sich erkennen und wo beginnt die Interpretation?",
      "Welche Folgen hat die beobachtete Entwicklung für natürliche Lebensgrundlagen beziehungsweise planetare Grenzen?",
      "Welche Zusammenhänge werden in der öffentlichen Diskussion häufig übersehen?",
      "Wo liegen die wichtigsten Unsicherheiten der Messung?",
      "Welche Entwicklung sollten wir in den kommenden Jahren besonders aufmerksam weiter beobachten?"
    ];
  }

  return {intro,notes:questions.join("\n\n")};
}
function getInterview(c){
  if(!c)return {intro:"",notes:""};
  const saved=data.interviews[c.id];

  // Abwärtskompatibel: alte Version speicherte nur den Leitfaden als String.
  if(typeof saved==="string")return {intro:"",notes:saved};

  // Eigene Bearbeitungen haben immer Vorrang.
  if(saved && ((saved.intro||"").trim() || (saved.notes||"").trim()))return saved;

  // Beim ersten Öffnen automatisch einen kandidatenbezogenen Vorschlag erzeugen.
  return makeInterviewDraft(c);
}

function showInterviewForSelectedCandidate(forceDraft=false){
  const c=selected("#iCandidate");
  if(!c){
    $("#iIntro").value="";
    $("#iNotes").value="";
    return;
  }

  let interview;
  if(forceDraft){
    interview=makeInterviewDraft(c);
  }else{
    interview=getInterview(c);
  }

  $("#iIntro").value=interview.intro||"";
  $("#iNotes").value=interview.notes||"";
  stopTraining();
}

$("#iCandidate").onchange=()=>showInterviewForSelectedCandidate(false);

$("#loadInterviewDraft").onclick=()=>{
  const c=selected("#iCandidate");
  if(!c)return alert("Bitte zuerst einen Kandidaten auswählen.");

  const hasText=$("#iIntro").value.trim() || $("#iNotes").value.trim();
  if(hasText && !confirm("Den aktuellen Text durch den automatisch erzeugten Vorschlag ersetzen?"))return;

  showInterviewForSelectedCandidate(true);
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


function renderAll(){
  renderCandidates();
  candidateOptions();
  makeMail();
  if($("#iCandidate").value)showInterviewForSelectedCandidate(false);
}
renderAll();
