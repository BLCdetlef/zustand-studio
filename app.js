const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const KEY="zustandStudioPrototypeV1";

class LocalDemoStorage {
  load(){ try{return JSON.parse(localStorage.getItem(KEY))||this.empty()}catch{return this.empty()} }
  save(data){ localStorage.setItem(KEY,JSON.stringify(data)) }
  clear(){ localStorage.removeItem(KEY) }
  empty(){return {candidates:[], groups:[], acquisition:{}, interviews:{}, zDrafts:{}}}
}

// Später austauschbar: class NextcloudStorage { load(); save(); ... }
const storage = new LocalDemoStorage();
let data=storage.load();

// Abwärtskompatibel zu bereits im Browser gespeicherten Studio-Daten.
if(!Array.isArray(data.candidates))data.candidates=[];
if(!Array.isArray(data.groups))data.groups=[];
if(!data.acquisition)data.acquisition={};
if(!data.interviews)data.interviews={};
if(!data.zDrafts)data.zDrafts={};
data.candidates.forEach(c=>{
  if(typeof c.groupId!=="string")c.groupId="";
  if(typeof c.phone!=="string")c.phone="";
  if(typeof c.address!=="string")c.address="";
});

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
  if(!name)return alert("Bitte Name eintragen.");

  const editId=$("#saveCandidate").dataset.editId||"";
  const record={
    id:editId||crypto.randomUUID(),
    name,
    institution:$("#cInstitution").value.trim(),
    topic:$("#cTopic").value.trim(),
    period:$("#cPeriod").value.trim(),
    email:$("#cEmail").value.trim(),
    phone:$("#cPhone").value.trim(),
    address:$("#cAddress").value.trim(),
    source:$("#cSource").value.trim(),
    groupId:$("#cGroup").value||"",
    why:$("#cWhy").value.trim(),
    question:$("#cQuestion").value.trim()
  };

  if(editId){
    const idx=data.candidates.findIndex(c=>c.id===editId);
    if(idx>=0)data.candidates[idx]=record;
  }else{
    data.candidates.push(record);
  }

  ["#cName","#cInstitution","#cTopic","#cPeriod","#cEmail","#cPhone","#cAddress","#cSource","#cWhy","#cQuestion"].forEach(x=>$(x).value="");
  $("#cGroup").value="";
  delete $("#saveCandidate").dataset.editId;
  $("#saveCandidate").textContent="Speichern";
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
      let updated=0;
      let skipped=0;

      // Bestehende Kontakte werden über Name + Institution erkannt.
      // Bei ihnen werden nur dienstliche Kontakt-Stammdaten aus der Datei aktualisiert.
      // Redaktionelle Daten bleiben unangetastet: Gruppe, Akquise-Status,
      // Interview/Anmoderation und Z-Panel-Entwürfe.
      const duplicates=incoming.filter(raw=>{
        const name=String(raw?.name||"").trim().toLocaleLowerCase();
        const institution=String(raw?.institution||"").trim().toLocaleLowerCase();
        return name && data.candidates.some(c=>
          String(c.name||"").trim().toLocaleLowerCase()===name &&
          String(c.institution||"").trim().toLocaleLowerCase()===institution
        );
      });

      let updateExisting=true;
      if(duplicates.length){
        updateExisting=confirm(
          `${duplicates.length} bereits vorhandene${duplicates.length===1?"r Kontakt wird":" Kontakte werden"} erkannt.\n\n`+
          `Dienstl. E-Mail, Telefon, Postanschrift und offizielle Profil-/Kontaktseite aus der Datei aktualisieren?\n\n`+
          `Gruppe, Akquise-Status, Interviewtexte und Z-Panel-Entwürfe bleiben unverändert.`
        );
      }

      for(const raw of incoming){
        const name=String(raw?.name||"").trim();
        if(!name){skipped++; continue}

        const institution=String(raw?.institution||"").trim();
        const existing=data.candidates.find(c=>
          String(c.name||"").trim().toLocaleLowerCase()===name.toLocaleLowerCase() &&
          String(c.institution||"").trim().toLocaleLowerCase()===institution.toLocaleLowerCase()
        );

        if(existing){
          if(!updateExisting){skipped++; continue}

          // Nur öffentlich bereitgestellte dienstliche Kontaktinformationen.
          const email=String(raw?.email||raw?.contact||"").trim();
          const phone=String(raw?.phone||raw?.telephone||"").trim();
          const address=String(raw?.address||raw?.postalAddress||"").trim();
          const source=String(raw?.source||raw?.sourceUrl||"").trim();

          if(email)existing.email=email;
          if(phone)existing.phone=phone;
          if(address)existing.address=address;
          if(source)existing.source=source;
          updated++;
          continue;
        }

        data.candidates.push({
          id:crypto.randomUUID(),
          name,
          institution,
          topic:String(raw?.topic||raw?.measurement||"").trim(),
          period:String(raw?.period||"").trim(),
          email:String(raw?.email||raw?.contact||"").trim(),
          phone:String(raw?.phone||raw?.telephone||"").trim(),
          address:String(raw?.address||raw?.postalAddress||"").trim(),
          source:String(raw?.source||raw?.sourceUrl||"").trim(),
          groupId:resolveImportedGroup(raw),
          why:String(raw?.why||raw?.reason||"").trim(),
          question:String(raw?.question||raw?.coreQuestion||"").trim()
        });
        added++;
      }

      persist();
      nav("candidates");

      const parts=[];
      if(added)parts.push(`${added} neu importiert`);
      if(updated)parts.push(`${updated} bestehende Kontakt${updated===1?"":"e"} aktualisiert`);
      if(skipped)parts.push(`${skipped} übersprungen`);
      alert(parts.length?parts.join(" · "):"Keine Änderungen vorgenommen.");
    }catch(err){
      alert("Import nicht möglich: "+err.message);
    }finally{
      e.target.value="";
    }
  };
}


function groupById(id){return data.groups.find(g=>g.id===id)}
function groupName(id){return groupById(id)?.name||""}

function uniqueGroupName(name,excludeId=""){
  const n=String(name||"").trim().toLocaleLowerCase();
  return !data.groups.some(g=>g.id!==excludeId && g.name.trim().toLocaleLowerCase()===n);
}

function resolveImportedGroup(raw){
  const id=String(raw?.groupId||"").trim();
  if(id && groupById(id))return id;
  const name=String(raw?.group||raw?.groupName||raw?.suggestedGroup||"").trim();
  if(!name)return "";
  const existing=data.groups.find(g=>g.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase());
  if(existing)return existing.id;
  const g={id:crypto.randomUUID(),name};
  data.groups.push(g);
  return g.id;
}

function groupOptions(selected="",includeAll=false){
  let out=includeAll?'<option value="__all__">Alle Gruppen</option>':'<option value="">Keine Gruppe</option>';
  out+=data.groups.slice().sort((a,b)=>a.name.localeCompare(b.name,"de"))
    .map(g=>`<option value="${g.id}" ${g.id===selected?"selected":""}>${esc(g.name)}</option>`).join("");
  if(includeAll)out+='<option value="__none__">Ohne Gruppe</option>';
  return out;
}

function filteredCandidatesByGroup(value){
  if(!value || value==="__all__")return data.candidates;
  if(value==="__none__")return data.candidates.filter(c=>!c.groupId);
  return data.candidates.filter(c=>c.groupId===value);
}

function renderGroupControls(){
  const cGroup=$("#cGroup");
  if(cGroup){
    const old=cGroup.value;
    cGroup.innerHTML=groupOptions(old,false);
    cGroup.value=(old && groupById(old))?old:"";
  }

  const filter=$("#candidateGroupFilter");
  if(filter){
    const old=filter.value||"__all__";
    filter.innerHTML=groupOptions("",true);
    filter.value=[...filter.options].some(o=>o.value===old)?old:"__all__";
  }

  const zFilter=$("#zGroupFilter");
  if(zFilter){
    const old=zFilter.value||"__all__";
    zFilter.innerHTML=groupOptions("",true);
    zFilter.value=[...zFilter.options].some(o=>o.value===old)?old:"__all__";
  }

  const list=$("#groupList");
  if(list){
    list.innerHTML=data.groups.length
      ? data.groups.slice().sort((a,b)=>a.name.localeCompare(b.name,"de")).map(g=>{
          const count=data.candidates.filter(c=>c.groupId===g.id).length;
          return `<div class="group-row">
            <input value="${esc(g.name)}" aria-label="Gruppenname" onchange="renameGroup('${g.id}',this.value)">
            <span class="group-count">${count} Kontakt${count===1?"":"e"}</span>
            <button class="ghost small" onclick="deleteGroup('${g.id}')">Löschen</button>
          </div>`;
        }).join("")
      : '<p class="hint">Noch keine Gruppen angelegt.</p>';
  }
}

window.renameGroup=(id,name)=>{
  name=String(name||"").trim();
  if(!name){renderAll();return alert("Der Gruppenname darf nicht leer sein.");}
  if(!uniqueGroupName(name,id)){renderAll();return alert("Diese Gruppe gibt es bereits.");}
  const g=groupById(id);
  if(g){g.name=name;persist();}
};

window.deleteGroup=id=>{
  const g=groupById(id);
  if(!g)return;
  const count=data.candidates.filter(c=>c.groupId===id).length;
  const msg=count
    ? `Gruppe „${g.name}“ löschen? ${count} Kontakt${count===1?"":"e"} bleibt erhalten und wird danach keiner Gruppe zugeordnet.`
    : `Gruppe „${g.name}“ löschen?`;
  if(!confirm(msg))return;
  data.candidates.forEach(c=>{if(c.groupId===id)c.groupId=""});
  Object.values(data.zDrafts).forEach(z=>{if(z?.groupId===id)z.groupId=""});
  data.groups=data.groups.filter(x=>x.id!==id);
  persist();
};

window.setCandidateGroup=(candidateId,groupId)=>{
  const c=data.candidates.find(x=>x.id===candidateId);
  if(!c)return;
  c.groupId=groupId||"";
  persist();
};

$("#manageGroups").onclick=()=>{
  $("#groupManager").classList.remove("hidden");
  renderGroupControls();
};
$("#closeGroups").onclick=()=>$("#groupManager").classList.add("hidden");
$("#addGroup").onclick=()=>{
  const input=$("#newGroupName");
  const name=input.value.trim();
  if(!name)return alert("Bitte einen Gruppennamen eintragen.");
  if(!uniqueGroupName(name))return alert("Diese Gruppe gibt es bereits.");
  data.groups.push({id:crypto.randomUUID(),name});
  input.value="";
  persist();
  $("#groupManager").classList.remove("hidden");
};
$("#newGroupName").addEventListener("keydown",e=>{
  if(e.key==="Enter"){e.preventDefault();$("#addGroup").click();}
});
$("#candidateGroupFilter").onchange=renderCandidates;
$("#zGroupFilter").onchange=()=>{
  renderZCandidateOptions();
  $("#zTitle").value="";
  $("#zSummary").value="";
  $("#zSource").value="";
  $("#zGroupDisplay").value="";
};

function candidateOptions(){
  const opts='<option value="">Bitte auswählen</option>'+data.candidates.map(c=>`<option value="${c.id}">${esc(c.name)}${c.institution?" · "+esc(c.institution):""}</option>`).join("");

  ["#aCandidate","#iCandidate"].forEach(s=>{
    const el=$(s);
    const old=el.value;
    el.innerHTML=opts;
    if(old && data.candidates.some(c=>c.id===old))el.value=old;
    else el.value="";
  });

  renderZCandidateOptions();
}

function renderZCandidateOptions(){
  const el=$("#zCandidate");
  if(!el)return;
  const old=el.value;
  const filter=$("#zGroupFilter")?.value||"__all__";
  const list=filteredCandidatesByGroup(filter);
  el.innerHTML='<option value="">Bitte auswählen</option>'+list.map(c=>`<option value="${c.id}">${esc(c.name)}${c.institution?" · "+esc(c.institution):""}</option>`).join("");
  if(old && list.some(c=>c.id===old))el.value=old;
  else el.value="";
  showZGroup();
}

function showZGroup(){
  const c=selected("#zCandidate");
  const field=$("#zGroupDisplay");
  if(field)field.value=c?groupName(c.groupId):"";
}
function esc(s=""){
  return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}

function statusInfo(status){
  const s=(status||"noch nicht angeschrieben").toLowerCase();
  if(s.includes("durchgeführt"))return {icon:"✓",label:"Interview durchgeführt"};
  if(s.includes("zugesagt"))return {icon:"●",label:"zugesagt"};
  if(s.includes("abgesagt"))return {icon:"●",label:"abgesagt"};
  if(s.includes("aussteh")||s.includes("warte"))return {icon:"◷",label:"Antwort ausstehend"};
  if(s.includes("angeschrieben"))return {icon:"✉",label:"angeschrieben"};
  return {icon:"○",label:"noch nicht angeschrieben"};
}

function renderCandidates(){
  $("#candidateCount").textContent=data.candidates.length;
  const filter=$("#candidateGroupFilter")?.value||"__all__";
  const shown=filteredCandidatesByGroup(filter);

  $("#candidateList").innerHTML=shown.length
    ? shown.map(c=>{
        const st=statusInfo((data.acquisition[c.id]||{}).status);
        const grp=groupName(c.groupId);
        const mail=c.email?`<span class="compact-mail">${esc(c.email)}</span>`:"<span class='muted'>keine E-Mail</span>";
        return `<article class="card candidate compact-candidate">
          <div class="compact-main">
            <div class="compact-line compact-line1">
              <span class="status-symbol" title="${esc(st.label)}" aria-label="${esc(st.label)}">${st.icon}</span>
              <strong>${esc(c.name)}</strong>
              ${c.institution?`<span>· ${esc(c.institution)}</span>`:""}
              ${grp?`<span>· <b>${esc(grp)}</b></span>`:""}
            </div>
            <div class="compact-line compact-line2">
              <span>${esc(c.topic||"Kein Thema eingetragen")}</span>
              <span>· ${mail}</span>
              <button class="text-button" onclick="toggleCandidateDetails('${c.id}')">Details</button>
              <span>·</span>
              <button class="text-button" onclick="editCandidate('${c.id}')">Bearbeiten</button>
            </div>
            <div id="details-${c.id}" class="candidate-details hidden">
              ${c.period?`<p><b>Zeitraum:</b> ${esc(c.period)}</p>`:""}
              ${c.why?`<p><b>Einordnung:</b> ${esc(c.why)}</p>`:""}
              ${c.question?`<p><b>Kernfrage:</b> ${esc(c.question)}</p>`:""}
              ${c.phone?`<p><b>Dienstl. Telefon:</b> ${esc(c.phone)}</p>`:""}
              ${c.address?`<p><b>Dienstl. Postanschrift:</b> ${esc(c.address)}</p>`:""}
              ${c.source?`<p><b>Profil/Kontakt:</b> <span class="break">${esc(c.source)}</span></p>`:""}
              <p class="privacy-note">Nur öffentlich bereitgestellte dienstliche Kontaktdaten speichern.</p>
              <button class="ghost small" onclick="removeCandidate('${c.id}')">Kontakt entfernen</button>
            </div>
          </div>
        </article>`;
      }).join("")
    : '<div class="card"><p>Für diesen Filter sind keine Kandidaten vorhanden.</p></div>';
}

window.toggleCandidateDetails=id=>{
  const el=$("#details-"+id);
  if(el)el.classList.toggle("hidden");
};

window.editCandidate=id=>{
  const c=data.candidates.find(x=>x.id===id);
  if(!c)return;
  $("#candidateForm").classList.remove("hidden");
  $("#cName").value=c.name||"";
  $("#cInstitution").value=c.institution||"";
  $("#cTopic").value=c.topic||"";
  $("#cPeriod").value=c.period||"";
  $("#cEmail").value=c.email||"";
  $("#cPhone").value=c.phone||"";
  $("#cAddress").value=c.address||"";
  $("#cSource").value=c.source||"";
  $("#cGroup").value=c.groupId||"";
  $("#cWhy").value=c.why||"";
  $("#cQuestion").value=c.question||"";
  $("#saveCandidate").dataset.editId=id;
  $("#saveCandidate").textContent="Änderungen speichern";
  $("#candidateForm").scrollIntoView({behavior:"smooth",block:"start"});
};
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

${c.topic?`Ihre Arbeit zu ${c.topic} finde ich dafür besonders interessant.\n\n`:""}Hätten Sie Interesse an einem etwa 20–30-minütigen Telefongespräch beim Offenen Kanal Lübeck?

Bei Interesse schicke ich Ihnen gern kurz weitere Informationen.

Beste Grüße
Detlef Hau
Technische Hochschule Lübeck
Projekt: https://www.th-luebeck.de/zustand
Mönkhofer Weg 239
23562 Lübeck
Tel.: (+49) 0451 300-5660
Mobil: (+49) 0173 6144597
E-Mail: detlef.hau@th-luebeck.de`;

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

// --- Interview-Bildschirm ---------------------------------------------------
// Reine Anzeige des aktuell bearbeiteten Interviewtexts. Es werden keine neuen
// Datenfelder angelegt und keine Kontakt- oder Interviewdaten umstrukturiert.
let interviewScreenFontSize=26;

function sentenceSegments(text){
  const clean=String(text||"").replace(/\s+/g," ").trim();
  if(!clean)return [];

  // Intl.Segmenter liefert im Browser die sauberste Satztrennung.
  try{
    if(typeof Intl?.Segmenter==="function"){
      const segmenter=new Intl.Segmenter("de",{granularity:"sentence"});
      return [...segmenter.segment(clean)].map(x=>x.segment.trim()).filter(Boolean);
    }
  }catch{}

  return clean.match(/[^.!?]+(?:[.!?]+|$)/g)?.map(x=>x.trim()).filter(Boolean)||[clean];
}

function introParagraphs(text){
  const sentences=sentenceSegments(text);
  const paragraphs=[];
  let current="";
  for(const sentence of sentences){
    const combined=current?`${current} ${sentence}`:sentence;
    if(current && combined.length>210){
      paragraphs.push(current);
      current=sentence;
    }else{
      current=combined;
    }
  }
  if(current)paragraphs.push(current);
  return paragraphs;
}

function interviewParagraphs(text){
  return String(text||"")
    .split(/\n\s*\n|\n/)
    .map(line=>line.replace(/^\s*(?:[-•]|\d+[.)])\s*/,"").trim())
    .filter(Boolean);
}

function setInterviewScreenFont(size){
  interviewScreenFontSize=Math.max(18,Math.min(42,Number(size)||26));
  const body=$("#interviewScreenBody");
  if(body)body.style.setProperty("--interview-font-size",`${interviewScreenFontSize}px`);
  const value=$("#interviewFontValue");
  if(value)value.textContent=String(interviewScreenFontSize);
}

function fillInterviewScreen(){
  const c=selected("#iCandidate");
  if(!c)return false;

  const intro=$("#iIntro").value.trim();
  const notes=$("#iNotes").value.trim();
  if(!intro && !notes)return false;

  $("#interviewScreenCandidate").textContent=[c.name,c.institution].filter(Boolean).join(" · ");

  const topic=String(c.topic||"").trim();
  const coreQuestion=String(c.question||"").trim();
  $("#interviewScreenTopic").textContent=topic;
  $("#interviewScreenCoreQuestion").textContent=coreQuestion;
  $("#interviewScreenTopicRow").classList.toggle("hidden",!topic);
  $("#interviewScreenCoreQuestionRow").classList.toggle("hidden",!coreQuestion);
  $("#interviewScreenContextSection").classList.toggle("hidden",!topic&&!coreQuestion);

  const introBox=$("#interviewScreenIntro");
  introBox.replaceChildren();
  for(const text of introParagraphs(intro)){
    const p=document.createElement("p");
    p.textContent=text;
    introBox.appendChild(p);
  }
  $("#interviewScreenIntroSection").classList.toggle("hidden",!intro);

  const questions=$("#interviewScreenQuestions");
  questions.replaceChildren();
  interviewParagraphs(notes).forEach((text,index)=>{
    const row=document.createElement("div");
    row.className="interview-question";

    const number=document.createElement("span");
    number.className="interview-question-number";
    number.textContent=String(index+1);

    const p=document.createElement("p");
    p.textContent=text;

    row.append(number,p);
    questions.appendChild(row);
  });
  $("#interviewScreenQuestionsSection").classList.toggle("hidden",!notes);
  return true;
}

function openInterviewScreen(){
  const c=selected("#iCandidate");
  if(!c)return alert("Bitte zuerst einen Kandidaten auswählen.");
  if(!fillInterviewScreen())return alert("Bitte Anmoderation oder Fragen eintragen.");

  stopTraining();
  const screen=$("#interviewScreen");
  screen.classList.remove("hidden");
  document.body.classList.add("interview-screen-open");
  setInterviewScreenFont(interviewScreenFontSize);
  requestAnimationFrame(()=>{
    const body=$("#interviewScreenBody");
    body.scrollTop=0;
    body.focus();
  });
}

async function closeInterviewScreen(){
  if(document.fullscreenElement){
    try{await document.exitFullscreen()}catch{}
  }
  $("#interviewScreen").classList.add("hidden");
  document.body.classList.remove("interview-screen-open");
}

async function toggleInterviewFullscreen(){
  const screen=$("#interviewScreen");
  try{
    if(document.fullscreenElement){
      await document.exitFullscreen();
    }else if(screen.requestFullscreen){
      await screen.requestFullscreen();
    }
  }catch{
    // Die Anzeige füllt auch ohne Browser-Fullscreen bereits das Fenster.
  }
}

$("#openInterviewScreen").onclick=openInterviewScreen;
$("#closeInterviewScreen").onclick=closeInterviewScreen;
$("#interviewFontMinus").onclick=()=>setInterviewScreenFont(interviewScreenFontSize-2);
$("#interviewFontPlus").onclick=()=>setInterviewScreenFont(interviewScreenFontSize+2);
$("#interviewGoTop").onclick=()=>{
  const body=$("#interviewScreenBody");
  body.scrollTo({top:0,behavior:"smooth"});
  body.focus();
};
$("#interviewToggleFullscreen").onclick=toggleInterviewFullscreen;
$("#printInterviewScreen").onclick=()=>window.print();

document.addEventListener("keydown",e=>{
  const screen=$("#interviewScreen");
  if(!screen || screen.classList.contains("hidden"))return;

  const body=$("#interviewScreenBody");
  if(e.key==="Escape" && !document.fullscreenElement){
    e.preventDefault();
    closeInterviewScreen();
  }else if(e.key==="PageDown" || e.key===" "){
    e.preventDefault();
    body.scrollBy({top:Math.max(240,body.clientHeight*.82),behavior:"smooth"});
  }else if(e.key==="PageUp"){
    e.preventDefault();
    body.scrollBy({top:-Math.max(240,body.clientHeight*.82),behavior:"smooth"});
  }else if(e.key==="Home"){
    e.preventDefault();
    body.scrollTo({top:0,behavior:"smooth"});
  }else if(e.key==="End"){
    e.preventDefault();
    body.scrollTo({top:body.scrollHeight,behavior:"smooth"});
  }
});

$("#zCandidate").onchange=()=>{
  const c=selected("#zCandidate");
  const z=c?(data.zDrafts[c.id]||{}):{};
  $("#zTitle").value=z.title||"";
  $("#zSummary").value=z.summary||"";
  $("#zSource").value=z.source||(c?c.source:"");
  showZGroup();
};

$("#saveZ").onclick=()=>{
  const c=selected("#zCandidate");
  if(!c)return alert("Bitte Kandidaten auswählen.");
  data.zDrafts[c.id]={
    title:$("#zTitle").value,
    summary:$("#zSummary").value,
    source:$("#zSource").value,
    groupId:c.groupId||""
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

function trainerVoiceScore(v){
  const name=String(v?.name||"");
  const lang=String(v?.lang||"");
  let score=0;
  if(/^de-DE$/i.test(lang))score+=45;
  else if(/^de/i.test(lang))score+=30;
  if(/natural|neural|online|premium/i.test(name))score+=80;
  if(/google/i.test(name))score+=45;
  if(/microsoft/i.test(name))score+=35;
  if(/apple/i.test(name))score+=25;
  if(/katja|hedda|anna|amala|vicki|petra|marlene/i.test(name))score+=12;
  if(/espeak|mbrola/i.test(name))score-=80;
  return score;
}

function preferredTrainerVoice(){
  const german=trainerVoices.filter(v=>/^de/i.test(v.lang));
  const pool=german.length?german:trainerVoices;
  return [...pool].sort((a,b)=>trainerVoiceScore(b)-trainerVoiceScore(a))[0];
}

function loadTrainerVoices(){
  trainerVoices=speechSynthesis.getVoices();
  const select=$("#trainingVoice");
  if(!select)return;
  const old=select.value;
  const german=trainerVoices.map((v,i)=>({v,i})).filter(x=>/^de/i.test(x.v.lang));
  const list=german.length?german:trainerVoices.map((v,i)=>({v,i}));
  const options=[`<option value="auto">Automatisch – beste deutsche Stimme</option>`];
  options.push(...list.map(({v,i})=>`<option value="${i}">${esc(v.name)} (${esc(v.lang)})</option>`));
  select.innerHTML=options.join("");
  if([...select.options].some(o=>o.value===old))select.value=old;
  else select.value="auto";
}
if("speechSynthesis" in window){
  speechSynthesis.addEventListener?.("voiceschanged",loadTrainerVoices);
  loadTrainerVoices();
}

function trainerVoice(){
  const value=$("#trainingVoice")?.value;
  if(value==="auto" || value==="" || value==null)return preferredTrainerVoice();
  const i=Number(value);
  return trainerVoices[i]||preferredTrainerVoice()||trainerVoices[0];
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

function trainingIntroChunks(text){
  const sentences=sentenceSegments(text);
  const chunks=[];
  let current="";

  // Ein Abschnitt soll kurz genug sein, um ihn direkt nachsprechen zu können.
  for(const sentence of sentences){
    const combined=current?`${current} ${sentence}`:sentence;
    if(current && (combined.length>125 || current.length>85)){
      chunks.push(current);
      current=sentence;
    }else{
      current=combined;
    }
  }
  if(current)chunks.push(current);
  return chunks;
}

function buildTraining(){
  const c=selected("#iCandidate");
  if(!c)return false;
  const intro=$("#iIntro").value.trim();
  const qs=parseTrainingQuestions($("#iNotes").value);
  trainerItems=[];

  const introChunks=trainingIntroChunks(intro);
  introChunks.forEach((text,i)=>trainerItems.push({
    kind:`Anmoderation ${i+1}/${introChunks.length}`,
    type:"intro",
    text
  }));
  qs.forEach((q,i)=>trainerItems.push({kind:`Frage ${i+1}`,type:"question",text:q}));
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

  $("#trainingStatus").textContent=item.type==="intro"?"Jetzt diesen Abschnitt laut nachsprechen …":"Jetzt Frage laut sprechen / Antwort üben …";
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

$("#startTraining").onclick=()=>{
  const c=selected("#iCandidate");
  if(!c)return alert("Bitte zuerst einen Kandidaten auswählen.");
  // Änderungen sichern, aber Audio noch NICHT starten.
  data.interviews[c.id]={intro:$("#iIntro").value,notes:$("#iNotes").value};
  storage.save(data);
  if(!buildTraining())return alert("Bitte Anmoderation oder Fragen eintragen.");
  $("#trainingPanel").classList.remove("hidden");
  $("#trainingStatus").textContent="Bereit";
  $("#trainingText").textContent=trainerItems[0]?.text||"Bereit";
  $("#trainingRound").textContent="Runde 1";
  $("#trainingPlay").textContent="▶ Training starten";
  $("#trainingPanel").scrollIntoView({behavior:"smooth",block:"start"});
};
$("#trainingPlay").onclick=()=>{
  if(trainerPaused){ resumeTraining(); return; }
  if(trainerRunning) return;
  startTraining();
};
$("#trainingPauseBtn").onclick=pauseTraining;
$("#trainingStop").onclick=stopTraining;
$("#testTrainingVoice").onclick=()=>{
  if(!("speechSynthesis" in window)){
    alert("Dieser Browser unterstützt die Sprachausgabe leider nicht.");
    return;
  }
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance("ZUSTAND Interviewtraining. Die Sprachausgabe funktioniert.");
  const v=trainerVoice();
  if(v)u.voice=v;
  u.lang=v?.lang||"de-DE";
  u.rate=Number($("#trainingRate").value||0.95);
  speechSynthesis.speak(u);
};
$("#closeTraining").onclick=()=>{stopTraining();$("#trainingPanel").classList.add("hidden")};

document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible"&&trainerRunning)trainerLock();
});


function renderAll(){
  renderGroupControls();
  renderCandidates();
  candidateOptions();
  makeMail();
  if($("#iCandidate").value)showInterviewForSelectedCandidate(false);
  showZGroup();
}
renderAll();
