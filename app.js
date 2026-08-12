const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const KEY="zustandStudioPrototypeV1";
const BACKUP_FORMAT="zustand-studio-backup-v1";
const BACKUP_VERSION=1;

class LocalDemoStorage {
  load(){ try{return JSON.parse(localStorage.getItem(KEY))||this.empty()}catch{return this.empty()} }
  save(data){ localStorage.setItem(KEY,JSON.stringify(data)) }
  clear(){ localStorage.removeItem(KEY) }
  empty(){return {candidates:[], groups:[], acquisition:{}, interviews:{}, zDrafts:{}, zArticles:[], zPublicBaselineImported:false, zPublicBaselineName:""}}
}

// Später austauschbar: class NextcloudStorage { load(); save(); ... }
const storage = new LocalDemoStorage();

function normalizeStudioData(raw){
  const normalized=(raw&&typeof raw==="object"&&!Array.isArray(raw))?raw:storage.empty();
  if(!Array.isArray(normalized.candidates))normalized.candidates=[];
  if(!Array.isArray(normalized.groups))normalized.groups=[];
  if(!normalized.acquisition||typeof normalized.acquisition!=="object")normalized.acquisition={};
  if(!normalized.interviews||typeof normalized.interviews!=="object")normalized.interviews={};
  if(!normalized.zDrafts||typeof normalized.zDrafts!=="object")normalized.zDrafts={};
  if(!Array.isArray(normalized.zArticles))normalized.zArticles=[];
  if(typeof normalized.zPublicBaselineImported!=="boolean")normalized.zPublicBaselineImported=false;
  if(typeof normalized.zPublicBaselineName!=="string")normalized.zPublicBaselineName="";
  return normalized;
}

function migrateLegacyZDrafts(target){
  Object.entries(target.zDrafts||{}).forEach(([candidateId,z])=>{
    if(!z || !(z.title||z.summary||z.source))return;
    if(target.zArticles.some(a=>a?.legacyCandidateId===candidateId))return;
    const today=new Date().toISOString().slice(0,10);
    target.zArticles.push({
      id:`legacy-${candidateId}`,
      legacyCandidateId:candidateId,
      candidateId,
      title:String(z.title||""),
      summary:String(z.summary||""),
      category:"Zustand",
      planetaryBoundary:"QS",
      keywords:[],
      sourceTitle:"",
      sourceUrl:String(z.source||""),
      publicationDate:"",
      imageFile:"",
      imageIdea:"",
      imageStyle:"Automatisch",
      imageFormat:"Automatisch",
      imagePrompt:"",
      interviewUrl:"",
      workflowStatus:"entwurf",
      visibility:"aktiv",
      created:today,
      lastModified:today,
      publishedAt:""
    });
  });
  return target;
}

let data=migrateLegacyZDrafts(normalizeStudioData(storage.load()));
function textList(value){
  if(Array.isArray(value)){
    return value.map(item=>{
      if(typeof item==="string")return item.trim();
      if(item && typeof item==="object")return String(item.text||item.value||item.statement||item.label||"").trim();
      return "";
    }).filter(Boolean);
  }
  if(typeof value==="string"){
    return normalizeStoredLineBreaks(value).split(/\n\s*\n|\n/).map(x=>x.replace(/^\s*(?:[-•]|\d+[.)])\s*/,"").trim()).filter(Boolean);
  }
  return [];
}

function measurementList(value){
  const rows=Array.isArray(value)?value:(value&&typeof value==="object"?[value]:[]);
  return rows.map(item=>{
    if(typeof item==="string")return {name:item.trim(),period:"",measured:"",method:"",role:"",trend:"",sourceUrl:""};
    return {
      name:String(item?.name||item?.title||item?.program||"").trim(),
      period:String(item?.period||item?.timeframe||"").trim(),
      measured:String(item?.measured||item?.whatMeasured||item?.measurement||"").trim(),
      method:String(item?.method||item?.methods||"").trim(),
      role:String(item?.role||item?.personRole||"").trim(),
      trend:String(item?.trend||item?.change||item?.mainChange||"").trim(),
      sourceUrl:String(item?.sourceUrl||item?.source||item?.url||"").trim()
    };
  }).filter(item=>Object.values(item).some(Boolean));
}

function publicationList(value){
  const rows=Array.isArray(value)?value:(value&&typeof value==="object"?[value]:[]);
  return rows.map(item=>{
    if(typeof item==="string")return {title:item.trim(),year:"",url:"",relevance:""};
    return {
      title:String(item?.title||item?.name||"").trim(),
      year:String(item?.year||item?.date||item?.publicationYear||"").trim(),
      url:String(item?.url||item?.sourceUrl||item?.doi||item?.link||"").trim(),
      relevance:String(item?.relevance||item?.whyRelevant||"").trim()
    };
  }).filter(item=>Object.values(item).some(Boolean));
}

function firstResearchValue(raw,keys){
  for(const key of keys){
    if(Object.prototype.hasOwnProperty.call(raw||{},key))return {found:true,value:raw[key]};
  }
  return {found:false,value:undefined};
}

function mergeCandidateResearch(target,raw){
  const mappings=[
    ["coreFindings",["coreFindings","keyFindings","researchFindings"],textList],
    ["measurements",["measurements","measurementPrograms","monitoringPrograms","monitoring"],measurementList],
    ["publications",["publications","keyPublications"],publicationList],
    ["keyNumbers",["keyNumbers","numbers","quantitativeFindings"],textList],
    ["connections",["connections","causalConnections","relationships"],textList],
    ["uncertainties",["uncertainties","limitations"],textList],
    ["reserveQuestions",["reserveQuestions","backupQuestions"],textList]
  ];
  let changed=false;
  for(const [targetKey,sourceKeys,normalizer] of mappings){
    const hit=firstResearchValue(raw,sourceKeys);
    if(hit.found){target[targetKey]=normalizer(hit.value);changed=true;}
  }
  const opening=firstResearchValue(raw,["openingQuestion","interviewOpeningQuestion"]);
  if(opening.found){target.openingQuestion=String(opening.value||"").trim();changed=true;}
  return changed;
}

function ensureCandidateResearch(c){
  c.coreFindings=textList(c.coreFindings);
  c.measurements=measurementList(c.measurements||c.measurementPrograms||c.monitoringPrograms||c.monitoring);
  c.publications=publicationList(c.publications||c.keyPublications);
  c.keyNumbers=textList(c.keyNumbers);
  c.connections=textList(c.connections);
  c.uncertainties=textList(c.uncertainties);
  c.reserveQuestions=textList(c.reserveQuestions);
  if(typeof c.openingQuestion!=="string")c.openingQuestion="";
}

function hasResearchProfile(c){
  ensureCandidateResearch(c);
  // Ein vollständiges Profil braucht mindestens belastbare Kernaussagen und
  // eine konkrete Datengrundlage. Veröffentlichungen sind erwünscht, aber
  // nicht für jede Monitoringreihe zwingend vorhanden.
  return c.coreFindings.length>=2 && c.measurements.length>=1 &&
    (c.publications.length>=1 || c.keyNumbers.length>=1);
}

function setPromptPanel(title,hint){
  const titleEl=$("#promptTitle");
  const hintEl=$("#promptHint");
  if(titleEl)titleEl.textContent=title||"Such-Prompt";
  if(hintEl)hintEl.textContent=hint||"";
}

data.candidates.forEach(c=>{
  if(typeof c.groupId!=="string")c.groupId="";
  if(typeof c.phone!=="string")c.phone="";
  if(typeof c.address!=="string")c.address="";
  ensureCandidateResearch(c);
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
  setPromptPanel(
    "Such-Prompt",
    "Der Prompt sucht zuerst Messreihen und Datensätze und anschließend geeignete Personen. Neue Kandidaten werden bereits mit vollständigem Forschungsprofil vorbereitet."
  );
  $("#promptOutput").value=`Suche nicht zuerst nach bekannten Expert:innen, sondern nach interessanten langfristigen Messreihen, Monitoringprogrammen, Datensätzen und wiederholten Untersuchungen zum Thema ${topic}.
Bevorzuge Untersuchungen, die Veränderungen über mindestens mehrere Jahre, besser Jahrzehnte quantitativ zeigen. Suche anschließend nach den Personen, die diese Daten erheben, auswerten oder wissenschaftlich betreuen. Bevorzuge die tatsächlich mit der Messreihe arbeitenden Fachleute gegenüber bloß medienbekannten Personen oder Institutsleitungen.

Prüfe je Kandidat: Was wird gemessen und seit wann? Wie wird gemessen? Welche Entwicklung ist erkennbar? Welche Rolle hat die Person selbst bei Erhebung, Auswertung oder wissenschaftlicher Betreuung? Warum ist die Entwicklung für natürliche Lebensgrundlagen bzw. planetare Grenzen relevant? Welche Ursachen, Folgen, Zusammenhänge und Unsicherheiten lassen sich erklären? Gibt es eine seriöse institutionelle Kontaktmöglichkeit?

Suche für jede wirklich geeignete Person zusätzlich gezielt nach 1–3 zentralen wissenschaftlichen Veröffentlichungen oder offiziellen Auswertungen, an denen sie beteiligt ist und die unmittelbar zu den genannten Messreihen, Monitoringprogrammen oder Datensätzen gehören. Bevorzuge Originalpublikationen, DOI-/Verlagsseiten, institutionelle Repositorien oder offizielle Projektseiten. Gib nach Möglichkeit einen direkten Link zur Quelle an; Medienberichte nur ergänzend, nicht als Hauptbeleg.

Bereite für jeden Kandidaten vier Blöcke für die Interviewvorbereitung vor:
1. Kernaussagen der Forschung: 4–6 kurze, belastbare Aussagen, die ich in eigenen Worten wiedergeben können sollte. Trenne beobachtete Befunde klar von Interpretation.
2. Messreihen, Monitoringprogramme, Datensätze & Veröffentlichungen: Name, Zeitraum, räumlicher Bezug, was gemessen wird, Mess-/Auswertungsmethode, Rolle der Person und wichtigste erkennbare Veränderung. Nenne außerdem 1–3 zentrale Veröffentlichungen oder offizielle Auswertungen mit Titel, Jahr und möglichst direktem Quellenlink.
3. Zahlen, Zusammenhänge & Unsicherheiten: die wichtigsten Größenordnungen oder Trends mit Einheit, relevante Ursachen/Folgen/Wechselwirkungen sowie Grenzen der Aussagekraft.
4. Gesprächseinstieg & Reservefragen: Formuliere zuerst eine offene, natürliche Einstiegsfrage, die den Gast dazu einlädt, von der eigenen Messung oder Forschung ausgehend zu erklären, woher wir die Veränderung überhaupt kennen. Danach höchstens drei kurze Reservefragen für Aspekte, die im Gespräch sonst fehlen könnten. Die Fragen sind Reserve, kein abzuarbeitender Fragenkatalog.

Regionale Priorität: ${region}.
Interviewsprache: ${language}. Bei "Deutsch bevorzugt" suche aktiv nach deutschsprachigen Fachleuten mit möglichst vergleichbarer Nähe zu den relevanten Messdaten. Internationale Kandidat:innen dürfen zusätzlich genannt werden, wenn ihre fachliche Eignung außergewöhnlich ist.${focus?`\nZusätzlicher Fokus: ${focus}.`:""}

Wähle maximal fünf wirklich geeignete Personen. Kennzeichne hohe Medienpräsenz und bevorzuge bei gleicher Eignung Personen, deren konkrete Forschungsarbeit weniger öffentlich sichtbar ist.

Ziel ist ein verständliches 20–30-minütiges Interview für ZUSTAND / TH Lübeck und den Offenen Kanal Lübeck: nicht nur „dass“ sich etwas verändert, sondern wie wir es wissen, warum es geschieht und womit es zusammenhängt. Die Vorbereitung soll inhaltliche Sicherheit geben, ohne den Gesprächsverlauf vorab festzulegen.

Gib am Ende zusätzlich einen JSON-Block zum direkten Import ins ZUSTAND-Studio aus. Verwende dieses Schema und diese Feldnamen:
{
  "format": "zustand-studio-candidates-v2",
  "topic": "...",
  "candidates": [
    {
      "name": "...",
      "institution": "...",
      "topic": "Messreihe / Forschungsbezug",
      "period": "...",
      "email": "dienstliche E-Mail, falls seriös belegt",
      "phone": "dienstliche Telefonnummer, falls seriös belegt",
      "address": "dienstliche Anschrift, falls seriös belegt",
      "source": "offizielle Profil-/Kontaktseite",
      "why": "kurze Einordnung der Eignung",
      "question": "kurze bisherige Kernfrage, optional",
      "coreFindings": ["..."],
      "measurements": [
        {"name":"...","period":"...","measured":"...","method":"...","role":"...","trend":"...","sourceUrl":"..."}
      ],
      "publications": [
        {"title":"...","year":"...","url":"...","relevance":"..."}
      ],
      "keyNumbers": ["..."],
      "connections": ["..."],
      "uncertainties": ["..."],
      "openingQuestion": "...",
      "reserveQuestions": ["...","...","..."]
    }
  ]
}
Nur Angaben übernehmen, die sich seriös belegen lassen. Keine Kontaktdaten erraten.`;
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
  const existingRecord=editId?data.candidates.find(c=>c.id===editId):null;
  const record={
    ...(existingRecord||{}),
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
    question:$("#cQuestion").value.trim(),
    openingQuestion:$("#cQuestion").value.trim()
  };
  ensureCandidateResearch(record);

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
        const targetId=String(raw?.targetCandidateId||"").trim();
        if(targetId && data.candidates.some(c=>c.id===targetId))return true;
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
          `Dienstl. Kontaktdaten sowie neu recherchierte Kernaussagen, Messreihen, Publikationen, Zahlen und Unsicherheiten aus der Datei ergänzen/aktualisieren?\n\n`+
          `Gruppe, Akquise-Status, eigene Interviewtexte und Z-Panel-Entwürfe bleiben unverändert.`
        );
      }

      for(const raw of incoming){
        const name=String(raw?.name||"").trim();
        if(!name){skipped++; continue}

        const institution=String(raw?.institution||"").trim();
        const targetId=String(raw?.targetCandidateId||"").trim();
        const existing=(targetId?data.candidates.find(c=>c.id===targetId):null) || data.candidates.find(c=>
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
          // Bei manuell angelegten oder älteren Kandidaten dürfen fehlende
          // Forschungs-Stammdaten ergänzt werden, vorhandene redaktionelle
          // Angaben werden dabei nicht überschrieben.
          if(!String(existing.topic||"").trim())existing.topic=String(raw?.topic||raw?.measurement||"").trim();
          if(!String(existing.period||"").trim())existing.period=String(raw?.period||"").trim();
          if(!String(existing.why||"").trim())existing.why=String(raw?.why||raw?.reason||"").trim();
          mergeCandidateResearch(existing,raw);
          ensureCandidateResearch(existing);
          updated++;
          continue;
        }

        const record={
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
          question:String(raw?.question||raw?.coreQuestion||"").trim(),
          coreFindings:[],
          measurements:[],
          publications:[],
          keyNumbers:[],
          connections:[],
          uncertainties:[],
          openingQuestion:"",
          reserveQuestions:[]
        };
        mergeCandidateResearch(record,raw);
        ensureCandidateResearch(record);
        data.candidates.push(record);
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
  const list=data.candidates;
  el.innerHTML='<option value="">Kein Interviewbezug</option>'+list.map(c=>`<option value="${c.id}">${esc(c.name)}${c.institution?" · "+esc(c.institution):""}</option>`).join("");
  if(old && list.some(c=>c.id===old))el.value=old;
  else el.value="";
  showZGroup();
}

function showZGroup(){
  const c=selected("#zCandidate");
  const field=$("#zGroupDisplay");
  if(field)field.value=c?groupName(c.groupId):"";
  const button=$("#zImportCandidateProfile");
  const info=$("#zCandidateImportInfo");
  if(button)button.disabled=!c;
  if(info){
    if(!c){
      info.textContent="Kandidat auswählen. Übernommen werden nur redaktionell nutzbare Forschungsangaben – keine E-Mail, Telefonnummer, Anschrift oder internen Notizen.";
    }else{
      ensureCandidateResearch(c);
      const parts=[];
      if(c.coreFindings.length)parts.push(`${c.coreFindings.length} Kernaussage${c.coreFindings.length===1?"":"n"}`);
      if(c.measurements.length)parts.push(`${c.measurements.length} Messreihe${c.measurements.length===1?"":"n"}/Projekt${c.measurements.length===1?"":"e"}`);
      if(c.publications.length)parts.push(`${c.publications.length} Veröffentlichung${c.publications.length===1?"":"en"}`);
      info.textContent=parts.length?`Profil verfügbar: ${parts.join(" · ")}. Die Übernahme erzeugt daraus einen redaktionellen Ausgangsentwurf.`:"Für diesen Kandidaten sind noch keine erweiterten Forschungsdaten gespeichert. Stammdaten können trotzdem als Ausgangspunkt übernommen werden.";
    }
  }
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
              ${(c.openingQuestion||c.question)?`<p><b>Einstiegsfrage:</b> ${esc(c.openingQuestion||c.question)}</p>`:""}
              ${(c.measurements?.length||c.publications?.length)?`<p><b>Recherchegrundlage:</b> ${c.measurements?.length||0} Messreihe${c.measurements?.length===1?"":"n"} · ${c.publications?.length||0} Veröffentlichung${c.publications?.length===1?"":"en"}</p>`:""}
              ${!hasResearchProfile(c)?`<p><button class="ghost small" onclick="researchCandidateProfile('${c.id}')">Forschungsprofil ergänzen</button></p>`:""}
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

window.researchCandidateProfile=id=>{
  const c=data.candidates.find(x=>x.id===id);
  if(!c)return;
  ensureCandidateResearch(c);

  const region=$("#region")?.value?.trim()||"Lübeck, Schleswig-Holstein, Norddeutschland, Deutschland, Europa";
  const language=$("#language")?.value||"Deutsch bevorzugt";
  const knownTopic=String(c.topic||"").trim();
  const knownPeriod=String(c.period||"").trim();
  const knownSource=String(c.source||"").trim();

  setPromptPanel(
    `Forschungsprofil: ${c.name}`,
    "Dieser Prompt sucht keine weiteren Kandidaten. Er ergänzt ausschließlich das Forschungsprofil der ausgewählten Person. Die Recherche soll zusätzlich eine fertige JSON-Datei zum Herunterladen bereitstellen; diese danach bei „Kandidaten“ importieren."
  );

  $("#promptOutput").value=`Recherchiere ausschließlich zur bereits ausgewählten Interviewperson. Suche NICHT nach anderen Expert:innen oder Kandidat:innen.

Ausgewählte Person:
Name: ${c.name}
Institution: ${c.institution||"[noch nicht eingetragen]"}${knownTopic?`\nBisher bekannter Forschungsbezug: ${knownTopic}`:""}${knownPeriod?`\nBisher bekannter Zeitraum: ${knownPeriod}`:""}${knownSource?`\nBekannte offizielle Profil-/Kontaktquelle: ${knownSource}`:""}

Ziel: Ergänze für ZUSTAND / TH Lübeck und den Offenen Kanal Lübeck das Forschungsprofil dieser Person als Vorbereitung für ein verständliches 20–30-minütiges Interview. Im Mittelpunkt stehen langfristige Messreihen, Monitoringprogramme, Datensätze und wiederholte Untersuchungen, an denen die Person selbst beteiligt war oder ist.

Prüfe sorgfältig:
- An welchen langfristigen Messreihen, Monitoringprogrammen, Datensätzen oder wiederholten Untersuchungen arbeitet oder arbeitete die Person tatsächlich?
- Was wird dort gemessen, seit wann, in welchem räumlichen Bezug und mit welcher Methode?
- Welche konkrete Rolle hat die Person bei Erhebung, Auswertung, Entwicklung der Methode oder wissenschaftlicher Betreuung?
- Welche quantitativen Veränderungen sind erkennbar? Nenne wichtige Größenordnungen möglichst mit Einheit und Zeitraum.
- Welche Ursachen, Folgen und Wechselwirkungen lassen sich aus der Forschung erklären?
- Welche Unsicherheiten, methodischen Grenzen oder Definitionsprobleme sind wichtig?

Suche zusätzlich gezielt nach 1–3 zentralen wissenschaftlichen Veröffentlichungen oder offiziellen Auswertungen, an denen diese Person beteiligt ist und die unmittelbar zu den genannten Messreihen oder Datensätzen gehören. Bevorzuge Originalpublikationen, DOI-/Verlagsseiten, institutionelle Repositorien und offizielle Projektseiten. Gib möglichst direkte Quellenlinks an. Medienberichte nur ergänzend verwenden.

Bereite die sichtbare Zusammenfassung bewusst kompakt vor; keine langen Fließtexte. Zielumfang ungefähr halb so lang wie eine ausführliche Forschungsdarstellung. Verwende diese vier Blöcke:
1. Kernaussagen der Forschung: 4–5 kurze, belastbare Aussagen, die ich in eigenen Worten wiedergeben können sollte. Beobachtete Befunde klar von Interpretation trennen.
2. Messreihen, Monitoringprogramme, Datensätze & Veröffentlichungen: nur die 2–3 wichtigsten Programme/Datensätze mit Zeitraum, Messgröße, Methode, Rolle der Person, wichtigstem Trend und Quellenlink; dazu 1–3 zentrale Veröffentlichungen mit Titel, Jahr, Link und einem kurzen Satz zur Relevanz.
3. Zahlen, Zusammenhänge & Unsicherheiten: 3–5 besonders wichtige quantitative Angaben mit Einheit und Zeitraum; anschließend die wichtigsten Ursachen/Folgen/Wechselwirkungen und 2–4 Grenzen der Aussagekraft.
4. Gesprächseinstieg & Reservefragen: zuerst eine offene, natürliche Einstiegsfrage, die den Gast von der eigenen Messung oder Forschung aus erklären lässt, woher wir die Veränderung kennen. Danach höchstens drei kurze Reservefragen. Kein Fragenkatalog.

Regionale Einordnung für die Auswahl relevanter Arbeiten: ${region}.
Interviewsprache: ${language}. Die Recherche selbst darf internationale Originalquellen verwenden.

Wichtig: Recherchiere die konkrete Forschungsarbeit der genannten Person. Schreibe ihr keine Ergebnisse anderer Forschender zu. Falls eine Beteiligung oder Zuordnung nicht sicher belegbar ist, kennzeichne das oder lasse die Angabe weg.

Erstelle ZUSÄTZLICH zur kurzen sichtbaren Zusammenfassung eine gültige JSON-Datei zum direkten Import ins ZUSTAND-Studio und stelle sie als herunterladbare Datei bereit. Gib den vollständigen JSON-Inhalt nicht noch einmal im Fließtext oder als Codeblock aus. Die JSON-Datei darf die recherchierten Angaben vollständig enthalten, auch wenn die sichtbare Zusammenfassung bewusst kurz gehalten ist.

Dateiname nach Möglichkeit: forschungsprofil_${String(c.name||"person").toLowerCase().replace(/[^a-z0-9äöüß]+/gi,"_").replace(/^_+|_+$/g,"")}.json

Die Felder "targetCandidateId", "name" und "institution" müssen in der Datei exakt wie unten vorgegeben übernommen werden, damit der bestehende Datensatz sicher aktualisiert und kein neuer Kandidat angelegt wird. Verwende exakt dieses Datenformat:
{
  "format": "zustand-studio-candidates-v2",
  "candidates": [
    {
      "targetCandidateId": "${c.id}",
      "name": ${JSON.stringify(c.name)},
      "institution": ${JSON.stringify(c.institution||"")},
      "topic": "präzisierter Forschungsbezug, falls sinnvoll",
      "period": "Zeitraum der wichtigsten Langzeitdaten",
      "email": "dienstliche E-Mail nur falls seriös belegt",
      "phone": "dienstliche Telefonnummer nur falls seriös belegt",
      "address": "dienstliche Anschrift nur falls seriös belegt",
      "source": "offizielle Profil-/Kontaktseite",
      "why": "kurze Einordnung der Eignung",
      "coreFindings": ["..."],
      "measurements": [
        {"name":"...","period":"...","measured":"...","method":"...","role":"...","trend":"...","sourceUrl":"..."}
      ],
      "publications": [
        {"title":"...","year":"...","url":"...","relevance":"..."}
      ],
      "keyNumbers": ["..."],
      "connections": ["..."],
      "uncertainties": ["..."],
      "openingQuestion": "...",
      "reserveQuestions": ["...","...","..."]
    }
  ]
}

Nur seriös belegte Angaben übernehmen. Keine Kontaktdaten erraten. Die JSON-Datei vor der Bereitstellung auf gültige JSON-Syntax prüfen.`;

  nav("research");
  $("#promptOutput")?.scrollIntoView({behavior:"smooth",block:"center"});
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
  $("#cQuestion").value=c.openingQuestion||c.question||"";
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

function setAcquisitionMail(c,status){
  const mailTitle=$("#mailOutput")?.closest(".card")?.querySelector("h3");

  if(!c){
    $("#mailOutput").value="";
    if(mailTitle)mailTitle.textContent="Kurze Erstmail";
    return;
  }

  if(status==="zugesagt"){
    if(mailTitle)mailTitle.textContent="Zweite E-Mail nach Zusage";
    $("#mailOutput").value=`Betreff: Interview für ZUSTAND – Terminabstimmung

Guten Tag ${c.name},

vielen Dank für Ihre Rückmeldung – ich freue mich sehr, dass Sie zu einem Gespräch bereit sind.

Der Offene Kanal Lübeck ist regulär dienstags bis samstags von 12:00 bis 19:00 Uhr geöffnet. Ich kann dort einen Studioplatz reservieren, sofern zu dem gewünschten Zeitpunkt einer frei ist.

Für mich eignen sich besonders Termine von Dienstag bis Freitag, möglichst zwischen 14:00 und 17:00 Uhr. Wenn Sie mir ein oder zwei Tage bzw. Zeitfenster nennen, die für Sie grundsätzlich gut passen würden, prüfe ich anschließend die Verfügbarkeit des Studios.

Danach können wir den konkreten Termin gemeinsam festlegen.

Beste Grüße
Detlef Hau
Technische Hochschule Lübeck
Projekt: https://www.th-luebeck.de/zustand
Mönkhofer Weg 239
23562 Lübeck
Tel.: (+49) 0451 300-5660
Mobil: (+49) 0173 6144597
E-Mail: detlef.hau@th-luebeck.de`;
    return;
  }

  if(mailTitle)mailTitle.textContent="Kurze Erstmail";
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
}

function makeMail(){
  const c=selected("#aCandidate");
  if(!c){setAcquisitionMail(null,"");return}

  const a=data.acquisition[c.id]||{};
  const status=a.status||"noch nicht angeschrieben";
  $("#aStatus").value=status;
  $("#aNote").value=a.note||"";
  setAcquisitionMail(c,status);
}
$("#aCandidate").onchange=makeMail;
$("#aStatus").onchange=()=>{
  const c=selected("#aCandidate");
  setAcquisitionMail(c,$("#aStatus").value);
};
$("#saveAcquisition").onclick=()=>{
  const c=selected("#aCandidate");
  if(!c)return alert("Bitte Kandidaten auswählen.");
  data.acquisition[c.id]={status:$("#aStatus").value,note:$("#aNote").value};
  persist();
};

function formatEvidence(c){
  const blocks=[];
  const measurements=measurementList(c?.measurements);
  measurements.forEach((m,index)=>{
    const lines=[];
    lines.push(`${index+1}. ${m.name||"Messreihe / Monitoring"}`);
    if(m.period)lines.push(`Zeitraum: ${m.period}`);
    if(m.measured)lines.push(`Gemessen: ${m.measured}`);
    if(m.method)lines.push(`Methode: ${m.method}`);
    if(m.role)lines.push(`Rolle des Gastes: ${m.role}`);
    if(m.trend)lines.push(`Wichtigste Veränderung: ${m.trend}`);
    if(m.sourceUrl)lines.push(`Quelle: ${m.sourceUrl}`);
    blocks.push(lines.join("\n"));
  });

  const publications=publicationList(c?.publications);
  publications.forEach((p,index)=>{
    const lines=[`Veröffentlichung ${index+1}: ${p.title||"ohne Titel"}${p.year?` (${p.year})`:""}`];
    if(p.relevance)lines.push(`Bezug: ${p.relevance}`);
    if(p.url)lines.push(`Quelle: ${p.url}`);
    blocks.push(lines.join("\n"));
  });

  if(!blocks.length){
    const lines=[];
    if(c?.topic)lines.push(`Messreihe / Forschungsbezug: ${c.topic}`);
    if(c?.period)lines.push(`Zeitraum: ${c.period}`);
    if(c?.source)lines.push(`Offizielle Profil-/Kontaktseite: ${c.source}`);
    if(lines.length)blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}

function formatConnections(c){
  const blocks=[];
  const numbers=textList(c?.keyNumbers);
  if(numbers.length)blocks.push(`Wichtige Zahlen / Trends\n${numbers.map(x=>`• ${x}`).join("\n")}`);
  const connections=textList(c?.connections);
  if(connections.length)blocks.push(`Zusammenhänge\n${connections.map(x=>`• ${x}`).join("\n")}`);
  const uncertainties=textList(c?.uncertainties);
  if(uncertainties.length)blocks.push(`Unsicherheiten / Grenzen\n${uncertainties.map(x=>`• ${x}`).join("\n")}`);
  return blocks.join("\n\n");
}

function structuredInterviewQuestions(c){
  const opening=String(c?.openingQuestion||"").trim();
  const reserve=textList(c?.reserveQuestions);
  if(!opening && !reserve.length)return "";
  return [opening,...reserve].filter(Boolean).join("\n\n");
}

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
    intro=`Mein Gast ist ${name}${institution?` von ${institution}`:""}. ${name} forscht zu folgenden Themen: ${topic}. Im Gespräch möchte ich verstehen, was langfristige Messungen tatsächlich zeigen, wie zuverlässig wir Veränderungen erkennen können und womit sie zusammenhängen.`;
    questions=[
      c.openingQuestion||c.question||`Wenn Sie uns zunächst mit in Ihre Arbeit nehmen: Woher wissen wir bei ${topic} überhaupt, dass sich etwas verändert – welche Messung oder Beobachtung ist dafür entscheidend?`,
      "Welche langfristige Veränderung ist in den Daten besonders deutlich zu erkennen?",
      "Welche Zusammenhänge werden in der öffentlichen Diskussion häufig übersehen?",
      "Wo liegen die wichtigsten Unsicherheiten der Messung?"
    ];
  }

  const structuredQuestions=structuredInterviewQuestions(c);
  const coreFindings=textList(c.coreFindings).join("\n\n");
  return {
    intro,
    coreFindings,
    evidence:formatEvidence(c),
    connections:formatConnections(c),
    notes:structuredQuestions||questions.join("\n\n")
  };
}
function completeInterviewShape(c,value){
  const draft={...makeInterviewDraft(c),recordingAt:"",broadcastAt:""};
  if(typeof value==="string")return {...draft,notes:value};
  if(!value || typeof value!=="object")return draft;
  const result={...draft};
  for(const key of ["intro","coreFindings","evidence","connections","notes","recordingAt","broadcastAt"]){
    if(Object.prototype.hasOwnProperty.call(value,key))result[key]=String(value[key]||"");
  }
  return result;
}

function getInterview(c){
  if(!c)return {intro:"",coreFindings:"",evidence:"",connections:"",notes:"",recordingAt:"",broadcastAt:""};
  const saved=data.interviews[c.id];
  if(saved!==undefined)return completeInterviewShape(c,saved);
  return makeInterviewDraft(c);
}

function showInterviewForSelectedCandidate(forceDraft=false){
  const c=selected("#iCandidate");
  const fields=["#iIntro","#iCoreFindings","#iEvidence","#iConnections","#iNotes","#iRecordingAt","#iBroadcastAt"];
  if(!c){fields.forEach(id=>$(id).value="");return;}

  // Beim Laden eines neuen Textvorschlags bleiben bereits eingetragene Termine erhalten.
  const saved=getInterview(c);
  const interview=forceDraft?{...makeInterviewDraft(c),recordingAt:saved.recordingAt||"",broadcastAt:saved.broadcastAt||""}:saved;
  $("#iIntro").value=interview.intro||"";
  $("#iCoreFindings").value=interview.coreFindings||"";
  $("#iEvidence").value=interview.evidence||"";
  $("#iConnections").value=interview.connections||"";
  $("#iNotes").value=interview.notes||"";
  $("#iRecordingAt").value=interview.recordingAt||"";
  $("#iBroadcastAt").value=interview.broadcastAt||"";
  stopTraining();
}

$("#iCandidate").onchange=()=>showInterviewForSelectedCandidate(false);

$("#loadInterviewDraft").onclick=()=>{
  const c=selected("#iCandidate");
  if(!c)return alert("Bitte zuerst einen Kandidaten auswählen.");

  const hasText=["#iIntro","#iCoreFindings","#iEvidence","#iConnections","#iNotes"].some(id=>$(id).value.trim());
  if(hasText && !confirm("Die aktuellen Interviewtexte durch den aus den Kandidatendaten erzeugten Vorschlag ersetzen?"))return;

  showInterviewForSelectedCandidate(true);
};

function currentInterviewEditorValues(){
  return {
    intro:$("#iIntro").value,
    coreFindings:$("#iCoreFindings").value,
    evidence:$("#iEvidence").value,
    connections:$("#iConnections").value,
    notes:$("#iNotes").value,
    recordingAt:$("#iRecordingAt").value,
    broadcastAt:$("#iBroadcastAt").value
  };
}

$("#saveInterview").onclick=()=>{
  const c=selected("#iCandidate");
  if(!c)return alert("Bitte Kandidaten auswählen.");
  data.interviews[c.id]=currentInterviewEditorValues();
  persist();
};

function parseLocalDateTime(value){
  const text=String(value||"").trim();
  if(!text)return null;
  const match=text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if(!match)return null;
  const [,y,m,d,h,min]=match.map((part,index)=>index?Number(part):part);
  const date=new Date(y,m-1,d,h,min,0,0);
  return Number.isNaN(date.getTime())?null:date;
}

function formatStudioAppointment(value){
  const date=parseLocalDateTime(value);
  if(!date)return "";
  const weekdays=["So","Mo","Di","Mi","Do","Fr","Sa"];
  const dd=String(date.getDate()).padStart(2,"0");
  const mm=String(date.getMonth()+1).padStart(2,"0");
  const yyyy=date.getFullYear();
  const hh=String(date.getHours()).padStart(2,"0");
  const min=String(date.getMinutes()).padStart(2,"0");
  return `${weekdays[date.getDay()]} ${dd}.${mm}.${yyyy} · ${hh}:${min}`;
}

function interviewAppointments(){
  const items=[];
  data.candidates.forEach(c=>{
    const interview=getInterview(c);
    [["recordingAt","Aufnahme"],["broadcastAt","Sendung"]].forEach(([field,type])=>{
      const value=interview[field]||"";
      const date=parseLocalDateTime(value);
      if(date)items.push({candidateId:c.id,name:c.name||"Unbekannt",institution:c.institution||"",type,value,date});
    });
  });
  return items;
}

function renderInterviewSchedule(){
  const target=$("#interviewSchedule");
  if(!target)return;
  const now=new Date();
  const items=interviewAppointments();
  const upcoming=items.filter(item=>item.date>=now).sort((a,b)=>a.date-b.date);
  const past=items.filter(item=>item.date<now).sort((a,b)=>b.date-a.date);

  const row=item=>`<button class="schedule-row" type="button" onclick="openInterviewCandidate('${item.candidateId}')">
    <span class="schedule-date">${esc(formatStudioAppointment(item.value))}</span>
    <span class="schedule-type ${item.type==='Aufnahme'?'recording':'broadcast'}">${item.type}</span>
    <span class="schedule-person"><strong>${esc(item.name)}</strong>${item.institution?`<small>${esc(item.institution)}</small>`:""}</span>
  </button>`;

  let html="";
  if(upcoming.length){
    html+=`<div class="schedule-group"><div class="schedule-group-title">Kommende Termine</div>${upcoming.map(row).join("")}</div>`;
  }else{
    html+=`<p class="schedule-empty">Noch keine kommenden Aufnahme- oder Sendetermine eingetragen.</p>`;
  }
  if(past.length){
    html+=`<details class="schedule-past"><summary>Vergangene Termine (${past.length})</summary><div class="schedule-group">${past.map(row).join("")}</div></details>`;
  }
  target.innerHTML=html;
}

window.openInterviewCandidate=id=>{
  const select=$("#iCandidate");
  if(!select)return;
  select.value=id;
  showInterviewForSelectedCandidate(false);
  select.scrollIntoView({behavior:"smooth",block:"center"});
};

// --- Interview-Bildschirm ---------------------------------------------------
// Reine Anzeige der aktuell bearbeiteten Interviewvorbereitung.
// Kontakt- und Akquise-Daten werden dabei nicht verändert.
let interviewScreenFontSize=26;

function normalizeStoredLineBreaks(text){
  // Ältere/übernommene Studio-Daten können Zeilenumbrüche wörtlich als \n bzw. \r\n enthalten.
  // Nur für Anzeige/Trainer normalisieren; die gespeicherten Daten werden nicht verändert.
  return String(text||"").replace(/\\r\\n|\\n|\\r/g,"\n");
}

function sentenceSegments(text){
  const clean=normalizeStoredLineBreaks(text).replace(/\s+/g," ").trim();
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
  return normalizeStoredLineBreaks(text)
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

function appendLinkifiedText(parent,text){
  const source=String(text||"");
  const urlRe=/https?:\/\/[^\s]+/g;
  let last=0;
  for(const match of source.matchAll(urlRe)){
    const start=match.index||0;
    if(start>last)parent.append(document.createTextNode(source.slice(last,start)));
    let url=match[0];
    let suffix="";
    while(/[),.;:]$/.test(url)){
      suffix=url.slice(-1)+suffix;
      url=url.slice(0,-1);
    }
    const a=document.createElement("a");
    a.href=url;
    a.target="_blank";
    a.rel="noopener noreferrer";
    a.textContent=url;
    parent.append(a);
    if(suffix)parent.append(document.createTextNode(suffix));
    last=start+match[0].length;
  }
  if(last<source.length)parent.append(document.createTextNode(source.slice(last)));
}

function fillReadText(containerId,text){
  const box=$(containerId);
  box.replaceChildren();
  interviewParagraphs(text).forEach(item=>{
    const p=document.createElement("p");
    appendLinkifiedText(p,item);
    box.appendChild(p);
  });
}

function fillInterviewScreen(){
  const c=selected("#iCandidate");
  if(!c)return false;

  const intro=$("#iIntro").value.trim();
  const coreFindings=$("#iCoreFindings").value.trim();
  const evidence=$("#iEvidence").value.trim();
  const connections=$("#iConnections").value.trim();
  const notes=$("#iNotes").value.trim();
  if(!intro && !coreFindings && !evidence && !connections && !notes)return false;

  $("#interviewScreenCandidate").textContent=[c.name,c.institution].filter(Boolean).join(" · ");

  const topic=String(c.topic||"").trim();
  const period=String(c.period||"").trim();
  $("#interviewScreenTopic").textContent=topic;
  $("#interviewScreenCoreQuestion").textContent=period;
  $("#interviewScreenTopicRow").classList.toggle("hidden",!topic);
  $("#interviewScreenCoreQuestionRow").classList.toggle("hidden",!period);
  $("#interviewScreenContextSection").classList.toggle("hidden",!topic&&!period);

  fillReadText("#interviewScreenIntro",intro);
  $("#interviewScreenIntroSection").classList.toggle("hidden",!intro);

  fillReadText("#interviewScreenCoreFindings",coreFindings);
  $("#interviewScreenCoreFindingsSection").classList.toggle("hidden",!coreFindings);

  fillReadText("#interviewScreenEvidence",evidence);
  $("#interviewScreenEvidenceSection").classList.toggle("hidden",!evidence);

  fillReadText("#interviewScreenConnections",connections);
  $("#interviewScreenConnectionsSection").classList.toggle("hidden",!connections);

  const questions=$("#interviewScreenQuestions");
  questions.replaceChildren();
  interviewParagraphs(notes).forEach((text,index)=>{
    const row=document.createElement("div");
    row.className="interview-question"+(index===0?" interview-opening-question":"");

    const number=document.createElement("span");
    number.className="interview-question-number";
    number.textContent=String(index+1);

    const content=document.createElement("div");
    if(index===0){
      const role=document.createElement("span");
      role.className="interview-question-role";
      role.textContent="Einstiegsfrage";
      content.appendChild(role);
    }else{
      const role=document.createElement("span");
      role.className="interview-question-role";
      role.textContent=`Reserve ${index}`;
      content.appendChild(role);
    }
    const p=document.createElement("p");
    p.textContent=text;
    content.appendChild(p);

    row.append(number,content);
    questions.appendChild(row);
  });
  $("#interviewScreenQuestionsSection").classList.toggle("hidden",!notes);
  return true;
}

function openInterviewScreen(){
  const c=selected("#iCandidate");
  if(!c)return alert("Bitte zuerst einen Kandidaten auswählen.");
  if(!fillInterviewScreen())return alert("Bitte mindestens einen Abschnitt der Interviewvorbereitung eintragen.");

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

// --- Z-Panel Redaktion ------------------------------------------------------
let currentZArticleId="";
let zPreviewMode="th";

function zToday(){return new Date().toISOString().slice(0,10)}
function zNow(){return new Date().toISOString()}
function zArticleById(id){return data.zArticles.find(a=>a.id===id)}
function zStatusLabel(status){
  return ({entwurf:"Entwurf",geprueft:"Geprüft",freigegeben:"Freigegeben",veroeffentlicht:"Veröffentlicht"})[status]||"Entwurf";
}
function zVisibilityLabel(value){return value==="archiviert"?"Archiviert":"Aktiv"}
function zKeywordList(value){
  if(Array.isArray(value))return value.map(x=>String(x).trim()).filter(Boolean);
  return String(value||"").split(",").map(x=>x.trim()).filter(Boolean);
}

const Z_IMAGE_STYLE_HINTS={
  Natur:"Nutze eine natürliche, glaubwürdige Szenerie mit Landschaft, Tier, Pflanze, Wasser, Boden oder Himmel. Ruhig, realistisch und nicht romantisierend.",
  Wissenschaft:"Nutze eine glaubwürdige wissenschaftliche Bildsprache, etwa Atmosphäre, Messinstrumente, Proben, Modelle oder sichtbare Prozesse. Keine Science-Fiction-Ästhetik und keine werbliche Laborszene.",
  Symbolisch:"Nutze eine klare, zurückhaltende visuelle Metapher. Sie soll sofort verständlich, weder plakativ noch werblich wirken.",
  "Prozess-/Erklärskizze":"Zeige einen fachlich nachvollziehbaren Zusammenhang oder Prozess mit wenigen klaren Formen. Reduziert, ruhig und ohne dekorative Details."
};
const Z_IMAGE_AUTO_TERMS={
  Wissenschaft:["aerosol","atmosphare","halogen","chemie","stickoxid","modellstudie","messung","monitoring","labor","mikroplastik","pfas","emission","nahrstoff","biogeochem","ozon","datensatz"],
  Symbolisch:["demokratie","bildung","gemeinwohl","gerechtigkeit","frieden","zusammenarbeit","gluck","suffizienz","postwachstum","parlament","lobbyismus","gesellschaft"],
  Natur:["biodiversitat","vogel","wald","ozean","meer","wasser","arten","okosystem","klima","boden","pflanze","tier","landnutzung"]
};
const Z_BOUNDARY_IMAGE_HINTS={
  KL:"Hitze, Sonne, blauer Himmel, körperliche Hitzebelastung oder sichtbare Klimafolgen",
  BD:"lebendige Artenvielfalt, Wildpflanzen, Insekten, Vögel, Wald oder Gewässer",
  LN:"Landschaft, Wald, Landwirtschaft, Versiegelung und Nutzungskonflikte",
  FW:"Wasser, Fluss, trockener Boden, Regen, Trinkwasser oder Vegetation",
  NP:"Landwirtschaft, Nährstoffe, Algenblüte, Ackerboden oder Gewässer",
  OA:"Meer, Muschel, Koralle, Plankton oder empfindliches Meeresleben",
  OZ:"Atmosphäre, Sonnenlicht und Schutzwirkung der Ozonschicht",
  AE:"Luft, feine Partikel, Dunst, Stadt und Atemwege",
  NS:"Kunststoffe, Chemikalien, Labor, Alltagsprodukte oder Mikroplastik",
  QS:"eine klare, leicht verständliche und glaubwürdige Assoziation zum Artikel"
};

function zNormalizeImageSearch(value){
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase().replace(/\s+/g," ").trim();
}
function zImagePromptContext(){
  return {
    title:$("#zTitle")?.value.trim()||"",
    summary:$("#zSummary")?.value.trim()||"",
    category:$("#zCategory")?.value||"Zustand",
    planetaryBoundary:$("#zBoundary")?.value||"QS",
    keywords:zKeywordList($("#zKeywords")?.value||""),
    imageIdea:$("#zImageIdea")?.value.trim()||"",
    imageStyle:$("#zImageStyle")?.value||"Automatisch",
    imageFormat:$("#zImageFormat")?.value||"Automatisch"
  };
}
function zAutomaticImageStyle(ctx){
  if(ctx.imageStyle && ctx.imageStyle!=="Automatisch")return ctx.imageStyle;
  if(["Natur verstehen","Wie wissen wir das?"].includes(ctx.category))return "Prozess-/Erklärskizze";
  const haystack=zNormalizeImageSearch(`${ctx.title} ${ctx.summary} ${ctx.planetaryBoundary} ${ctx.keywords.join(" ")}`);
  for(const style of ["Wissenschaft","Symbolisch","Natur"]){
    if(Z_IMAGE_AUTO_TERMS[style].some(term=>haystack.includes(term)))return style;
  }
  return "Natur";
}
function zAutomaticImageFormat(ctx,style=zAutomaticImageStyle(ctx)){
  if(ctx.imageFormat && ctx.imageFormat!=="Automatisch")return ctx.imageFormat;
  if(style==="Prozess-/Erklärskizze" || ["Natur verstehen","Wie wissen wir das?"].includes(ctx.category))return "SVG";
  return "JPG";
}
function zAutomaticImageIdea(ctx){
  if(ctx.imageIdea)return ctx.imageIdea;
  const text=zNormalizeImageSearch(`${ctx.title} ${ctx.summary} ${ctx.keywords.join(" ")}`);
  if(["demokratie","parlament","lobby","parteienfinanz","wahl","medienkompetenz"].some(term=>text.includes(term)))return "ein heller Sitzungssaal, ein runder Beratungstisch, eine öffentliche Bibliothek oder eine Wahlurne; keine Naturmetapher als Hauptmotiv";
  if(["bildung","schule","unterricht","studierende","hochschule","lernen","lehr","kompetenz"].some(term=>text.includes(term)))return "ein glaubwürdiger Hörsaal, ein Klassenzimmer, eine Werkstatt oder eine Bibliothek; keine Naturmetapher als Hauptmotiv";
  if(["gesundheit","krankheit","medizin","pravention","praxis","patient","psychisch","pflege"].some(term=>text.includes(term)))return "eine glaubwürdige Alltagsszene aus Praxis, Prävention, Bewegung oder Gesundheitsversorgung, alternativ ein zurückhaltendes wissenschaftliches Motiv";
  if(["frieden","zusammenarbeit","gemeinwohl","gesellschaft","gerechtigkeit","dialog"].some(term=>text.includes(term)))return "Menschen im sachlichen Austausch, gemeinsames Arbeiten oder ein ruhiger öffentlicher Begegnungsort; keine gestellte Werbeszene";
  if(["kreislaufwirtschaft","reparatur","recycling","wiederverwendung","ressourceneffizienz","gebrauchtholz","rückbau","ruckbau"].some(term=>text.includes(term)))return "eine Reparaturwerkstatt, wiederverwendete Bauteile oder klar sortierte Materialien; kein Müllberg als Hauptmotiv";
  return Z_BOUNDARY_IMAGE_HINTS[ctx.planetaryBoundary]||Z_BOUNDARY_IMAGE_HINTS.QS;
}
function zBuildImagePromptText(ctx=zImagePromptContext()){
  const style=zAutomaticImageStyle(ctx);
  const format=zAutomaticImageFormat(ctx,style);
  const idea=zAutomaticImageIdea(ctx);
  const keywords=ctx.keywords.length?`\nSchlagwörter: ${ctx.keywords.join(", ")}.`:"";
  const subject=`Artikelthema: ${ctx.title||"noch ohne Titel"}.\nKernaussage: ${ctx.summary||"noch keine Kurzfassung"}.\nBildidee / mögliche Bildassoziation: ${idea}.\nGewählter Bildstil: ${style}. ${Z_IMAGE_STYLE_HINTS[style]||Z_IMAGE_STYLE_HINTS.Natur}${keywords}`;

  if(format==="SVG"){
    return `Erstelle eine echte, saubere SVG-Vektorgrafik als Titelbild für einen öffentlichen Wissenschafts-Infoscreen. Keine Rastergrafik und kein nur vektorartig aussehendes PNG/JPG.\n\n${subject}\n\nKomposition für den Infoscreen:\n- Hochformat im Seitenverhältnis 8:9; passende viewBox verwenden.\n- Genau ein dominantes, klar erkennbares Hauptmotiv bzw. einen klaren Prozess.\n- Auch aus drei bis fünf Metern Entfernung verständlich.\n- Ruhige Fläche, klare Hierarchie, wenige Formen und Pfade.\n- Wichtige Motive mindestens zehn Prozent vom Bildrand entfernt.\n- Keine Schrift, Buchstaben, Zahlen, Logos, Wasserzeichen oder dekorative Beschriftungen.\n- Pfeile nur, wenn sie für einen Prozess wirklich nötig sind; ohne Textbeschriftung.\n- Keine Collage, keine geteilte Ansicht und keine überladene Infografik.\n\nVerbindliche ZUSTAND-Bildsprache: sachlich, ruhig, hochwertig und wissenschaftsredaktionell. Der Zusammenhang muss sich unmittelbar aus dem Artikelthema ergeben und nicht aus einer beliebigen Naturmetapher.\n\nTechnische SVG-Vorgaben:\n- valides, eigenständiges SVG ohne JavaScript, Event-Handler oder externe Ressourcen,\n- keine eingebetteten Base64-, PNG- oder JPEG-Bilder,\n- einfache Pfade und Formen, möglichst kompakter Code,\n- keine externen Schriften; idealerweise überhaupt kein Text im SVG,\n- für schnelle Webdarstellung optimieren und deutlich unter 500 kB halten.\n\nAusgabe: genau eine vollständige SVG-Datei bzw. vollständigen validen SVG-Code im Hochformat 8:9.`;
  }

  return `Erzeuge ein einzelnes Titelbild für einen öffentlichen Wissenschafts-Infoscreen.\n\n${subject}\n\nZeige keine erfundene konkrete Nachrichtenszene. Entwickle stattdessen eine natürliche, glaubwürdige und fotorealistische redaktionelle Assoziation, die den Inhalt auf den ersten Blick verständlich macht. Menschen nur dann zeigen, wenn sie inhaltlich sinnvoll sind; dann respektvoll, alltäglich und nicht posierend.\n\nKomposition für den Infoscreen:\n- Hochformat im Seitenverhältnis 8:9.\n- Das Bild füllt die linke Hälfte eines vertikal geteilten 16:9-Bildschirms.\n- Genau ein dominantes, klar erkennbares Hauptmotiv.\n- Auch aus drei bis fünf Metern Entfernung verständlich.\n- Ruhiger Hintergrund und deutliche Hell-Dunkel-Trennung.\n- Wichtige Motive mindestens zehn Prozent vom Bildrand entfernt.\n- Keine Schrift, Buchstaben, Zahlen, Diagramme, Logos, Wasserzeichen, Rahmen oder Collagen.\n- Keine überladene Komposition und keine gestellte Werbeszene.\n\nVerbindliche ZUSTAND-Bildsprache: fotorealistische, glaubwürdige redaktionelle Fotografie für ein hochwertiges deutschsprachiges Wissenschaftsmagazin. Ruhige Bildsprache, natürliches Licht, klare Komposition, realistische Materialien und Hauttöne, dezente Tiefenschärfe. Das Hauptmotiv soll sich unmittelbar aus dem Artikelthema ergeben und nicht aus einer allgemeinen Naturmetapher.\n\nAusgabeziel: genau ein fertiges Bild im Hochformat 8:9, ohne Text im Bild. Bevorzugtes Webformat JPEG/JPG; auf sichtbar hohe Qualität bei einer Zieldateigröße von höchstens 500 kB optimieren. Falls das Bilderzeugungssystem Dateiformat oder Dateigröße nicht direkt steuern kann, das Bild in hoher Qualität erzeugen; die JPG-Konvertierung und Komprimierung erfolgt anschließend separat.`;
}
function updateZImageAdvice(){
  const el=$("#zImageAdvice");
  if(!el)return;
  const ctx=zImagePromptContext();
  const style=zAutomaticImageStyle(ctx);
  const format=zAutomaticImageFormat(ctx,style);
  const automatic=[];
  if(ctx.imageStyle==="Automatisch")automatic.push(`Stil: ${style}`);
  if(ctx.imageFormat==="Automatisch")automatic.push(`Format: ${format}`);
  const detail=format==="JPG"?"JPG ist für fotorealistische Motive vorgesehen; Zielgröße max. 500 kB.":"SVG ist für reduzierte Erklär-, Prozess- und Symbolgrafiken vorgesehen; ohne eingebettete Rasterbilder oder Skripte.";
  el.textContent=`Aktuelle Empfehlung: ${style} · ${format}. ${detail}${automatic.length?` Automatisch gewählt: ${automatic.join(", ")}.`:""}`;
}
function buildZImagePrompt(){
  const prompt=zBuildImagePromptText();
  $("#zImagePrompt").value=prompt;
  updateZImageAdvice();
  updateZPreview();
}
async function copyZImagePrompt(){
  const field=$("#zImagePrompt");
  if(!field.value.trim())buildZImagePrompt();
  const text=field.value.trim();
  if(!text)return;
  try{
    await navigator.clipboard.writeText(text);
  }catch{
    field.focus();field.select();document.execCommand("copy");
  }
  const button=$("#zCopyImagePrompt");
  const old=button.textContent;
  button.textContent="Kopiert ✓";
  setTimeout(()=>button.textContent=old,1400);
}
function zNormalizeArticle(a={}){
  return {
    id:String(a.id||crypto.randomUUID()),
    legacyCandidateId:String(a.legacyCandidateId||""),
    publicId:String(a.publicId||""),
    publicOriginal:(a.publicOriginal && typeof a.publicOriginal==="object" && !Array.isArray(a.publicOriginal))?a.publicOriginal:null,
    candidateId:String(a.candidateId||""),
    title:String(a.title||""),
    summary:String(a.summary||""),
    category:String(a.category||"Zustand"),
    planetaryBoundary:String(a.planetaryBoundary||"QS"),
    keywords:zKeywordList(a.keywords),
    sourceTitle:String(a.sourceTitle||""),
    sourceUrl:String(a.sourceUrl||a.source||""),
    publicationDate:String(a.publicationDate||""),
    imageFile:String(a.imageFile||""),
    imageIdea:String(a.imageIdea||""),
    imageStyle:["Automatisch","Natur","Wissenschaft","Symbolisch","Prozess-/Erklärskizze"].includes(String(a.imageStyle||""))?String(a.imageStyle):"Automatisch",
    imageFormat:["Automatisch","JPG","SVG"].includes(String(a.imageFormat||""))?String(a.imageFormat):"Automatisch",
    imagePrompt:String(a.imagePrompt||""),
    interviewUrl:String(a.interviewUrl||""),
    workflowStatus:["entwurf","geprueft","freigegeben","veroeffentlicht"].includes(a.workflowStatus)?a.workflowStatus:"entwurf",
    visibility:a.visibility==="archiviert"?"archiviert":"aktiv",
    created:String(a.created||zToday()),
    lastModified:String(a.lastModified||zNow()),
    publishedAt:String(a.publishedAt||"")
  };
}
data.zArticles=data.zArticles.map(zNormalizeArticle);

function newZArticle(){
  const a=zNormalizeArticle({id:crypto.randomUUID(),created:zToday(),lastModified:zNow()});
  data.zArticles.unshift(a);
  currentZArticleId=a.id;
  storage.save(data);
  renderZPanel();
  populateZEditor(a);
  $("#zTitle").focus();
}

function zCandidateSource(c){
  ensureCandidateResearch(c);
  const measurement=c.measurements.find(m=>String(m.sourceUrl||"").trim());
  if(measurement){
    return {title:String(measurement.name||"Messreihe / Forschungsprojekt").trim(),url:String(measurement.sourceUrl||"").trim(),date:""};
  }
  const publication=c.publications.find(p=>String(p.url||"").trim());
  if(publication){
    return {
      title:String(publication.title||"Wissenschaftliche Veröffentlichung").trim(),
      url:String(publication.url||"").trim(),
      date:/^\d{4}-\d{2}-\d{2}$/.test(String(publication.year||"").trim())?String(publication.year).trim():""
    };
  }
  return {title:`${c.name}${c.institution?" – "+c.institution:""}`,url:String(c.source||"").trim(),date:""};
}

function zCandidateKeywords(c){
  const out=[];
  const add=value=>{
    const text=String(value||"").trim();
    if(text && !out.some(x=>x.toLocaleLowerCase()===text.toLocaleLowerCase()))out.push(text);
  };
  add(c.name);
  add(c.institution);
  String(c.topic||"").split(/[,;|]/).map(x=>x.trim()).filter(Boolean).slice(0,5).forEach(add);
  return out.slice(0,8);
}

function zCandidateSummary(c){
  ensureCandidateResearch(c);
  const sentences=[];
  const topic=String(c.topic||"").trim();
  if(topic)sentences.push(`${c.name}${c.institution?" ("+c.institution+")":""} forscht zu folgenden Themen: ${topic}.`);
  c.coreFindings.slice(0,3).forEach(x=>{
    const text=String(x||"").trim();
    if(text && sentences.join(" ").length<470)sentences.push(text);
  });
  const trend=String(c.measurements[0]?.trend||"").trim();
  if(trend && sentences.join(" ").length<430)sentences.push(trend);
  if(!sentences.length)sentences.push(`${c.name}${c.institution?" ("+c.institution+")":""} hat noch kein erweitertes Forschungsprofil im Studio. Die Forschungsangaben müssen vor einer Veröffentlichung noch redaktionell ergänzt werden.`);
  let text=sentences.join(" ").replace(/\s+/g," ").trim();
  if(text.length>550){
    const cut=text.slice(0,547);
    const last=Math.max(cut.lastIndexOf(". "),cut.lastIndexOf("; "),cut.lastIndexOf(", "));
    text=(last>350?cut.slice(0,last+1):cut.replace(/\s+\S*$/,""))+" …";
  }
  return text;
}

function zCandidateTitle(c){
  const topic=String(c.topic||"").trim();
  if(!topic)return `${c.name}${c.institution?" – "+c.institution:""}`;
  const shortTopic=(topic.split(/[;|]/)[0]||topic).trim();
  const title=`${c.name}: ${shortTopic}`;
  return title.length<=120?title:title.slice(0,117).replace(/\s+\S*$/," ").trim()+"…";
}

function importCandidateProfileToZArticle(){
  const c=selected("#zCandidate");
  if(!c)return alert("Bitte zuerst einen Kandidaten auswählen.");
  ensureCandidateResearch(c);
  if(!currentZArticleId){
    const fresh=zNormalizeArticle({id:crypto.randomUUID(),created:zToday(),lastModified:zNow(),candidateId:c.id});
    data.zArticles.unshift(fresh);
    currentZArticleId=fresh.id;
  }
  $("#zCandidate").value=c.id;
  const source=zCandidateSource(c);
  const generated={
    title:zCandidateTitle(c),
    summary:zCandidateSummary(c),
    category:"Menschen der Forschung",
    keywords:zCandidateKeywords(c),
    sourceTitle:source.title,
    sourceUrl:source.url,
    publicationDate:source.date,
    imageIdea:`Porträt oder glaubwürdiger Arbeitskontext von ${c.name}${c.topic?`; Forschungsbezug: ${String(c.topic).trim()}`:""}. Keine Werbeästhetik, keine erfundene Forschungsszene.`
  };
  const hasExisting=["#zTitle","#zSummary","#zSourceTitle","#zSource"].some(sel=>String($(sel)?.value||"").trim());
  if(hasExisting && !confirm("Im Z-Panel-Entwurf stehen bereits redaktionelle Inhalte. Titel, Kurztext, Kategorie, Schlagwörter und Quelle durch Angaben aus dem Kandidatenprofil ersetzen? Interview-Link, Bilddatei, Status und Sichtbarkeit bleiben erhalten."))return;

  $("#zTitle").value=generated.title;
  $("#zSummary").value=generated.summary;
  $("#zCategory").value=generated.category;
  $("#zKeywords").value=generated.keywords.join(", ");
  $("#zSourceTitle").value=generated.sourceTitle;
  $("#zSource").value=generated.sourceUrl;
  if(generated.publicationDate)$("#zPublicationDate").value=generated.publicationDate;
  if(!String($("#zImageIdea").value||"").trim())$("#zImageIdea").value=generated.imageIdea;
  updateZPreview();
  saveZArticle(false);
  const missing=[];
  if(!generated.summary)missing.push("Kurztext");
  if(!generated.sourceUrl)missing.push("Quellenlink");
  if(!$("#zPublicationDate").value)missing.push("genaues Quellendatum");
  const suffix=missing.length?` Bitte noch redaktionell ergänzen/prüfen: ${missing.join(", ")}.`:" Bitte den Entwurf jetzt redaktionell prüfen und bei Bedarf kürzen oder zuspitzen.";
  alert(`Kandidatenprofil übernommen.${suffix}`);
}

function zFormArticle(){
  const existing=zArticleById(currentZArticleId)||zNormalizeArticle({id:currentZArticleId||crypto.randomUUID()});
  return zNormalizeArticle({
    ...existing,
    candidateId:$("#zCandidate").value||"",
    title:$("#zTitle").value.trim(),
    summary:$("#zSummary").value.trim(),
    category:$("#zCategory").value,
    planetaryBoundary:$("#zBoundary").value,
    keywords:zKeywordList($("#zKeywords").value),
    sourceTitle:$("#zSourceTitle").value.trim(),
    sourceUrl:$("#zSource").value.trim(),
    publicationDate:$("#zPublicationDate").value,
    imageFile:$("#zImageFile").value.trim(),
    imageIdea:$("#zImageIdea").value.trim(),
    imageStyle:$("#zImageStyle").value,
    imageFormat:$("#zImageFormat").value,
    imagePrompt:$("#zImagePrompt").value.trim(),
    interviewUrl:$("#zInterviewUrl").value.trim(),
    lastModified:zNow()
  });
}

function saveZArticle(showMessage=false){
  if(!currentZArticleId)newZArticle();
  const a=zFormArticle();
  const i=data.zArticles.findIndex(x=>x.id===a.id);
  if(i>=0)data.zArticles[i]=a; else data.zArticles.unshift(a);
  currentZArticleId=a.id;
  storage.save(data);
  renderZPanel();
  if(showMessage)alert("Z-Panel-Entwurf gespeichert.");
  return a;
}

function zValidation(a,{forRelease=false}={}){
  const missing=[];
  if(!a.title)missing.push("Titel");
  if(!a.summary)missing.push("Kurztext");
  if(!a.sourceUrl)missing.push("Quellenlink");
  if(!a.sourceTitle)missing.push("Quellentitel");
  if(!a.publicationDate)missing.push("Quellendatum");
  if(!a.planetaryBoundary)missing.push("planetare Grenze / Bereich");
  if(!a.category)missing.push("Beitragstyp");
  if(missing.length)return `Bitte zuerst ergänzen: ${missing.join(", ")}.`;
  if(!/^https?:\/\//i.test(a.sourceUrl))return "Der Quellenlink sollte mit http:// oder https:// beginnen.";
  if(a.interviewUrl && !/^https?:\/\//i.test(a.interviewUrl))return "Der Interview-Link sollte mit http:// oder https:// beginnen.";
  if(forRelease && (a.summary.length<350 || a.summary.length>550))return `Der Kurztext hat ${a.summary.length} Zeichen. Für die Freigabe sollten es 350–550 Zeichen sein.`;
  return "";
}

function zSetWorkflow(next){
  let a=saveZArticle(false);
  const order={entwurf:0,geprueft:1,freigegeben:2,veroeffentlicht:3};
  if(next==="geprueft"){
    const err=zValidation(a);
    if(err)return alert(err);
  }
  if(next==="freigegeben"){
    if(order[a.workflowStatus]<1)return alert("Der Beitrag muss zuerst als geprüft markiert werden.");
    const err=zValidation(a,{forRelease:true});
    if(err)return alert(err);
  }
  if(next==="veroeffentlicht"){
    if(order[a.workflowStatus]<2)return alert("Der Beitrag muss zuerst freigegeben werden.");
    if(!confirm("Nur markieren, wenn die freigegebene news.json tatsächlich veröffentlicht wurde. Als veröffentlicht markieren?"))return;
  }
  a.workflowStatus=next;
  if(next==="veroeffentlicht" && !a.publishedAt)a.publishedAt=zNow();
  a.lastModified=zNow();
  const i=data.zArticles.findIndex(x=>x.id===a.id);
  data.zArticles[i]=a;
  storage.save(data);
  renderZPanel();
  populateZEditor(a);
}

function zToggleVisibility(){
  const a=saveZArticle(false);
  a.visibility=a.visibility==="archiviert"?"aktiv":"archiviert";
  a.lastModified=zNow();
  const i=data.zArticles.findIndex(x=>x.id===a.id);
  data.zArticles[i]=a;
  storage.save(data);
  renderZPanel();
  populateZEditor(a);
}

function clearZEditor(){
  currentZArticleId="";
  $("#zCandidate").value="";
  $("#zTitle").value="";
  $("#zSummary").value="";
  $("#zCategory").value="Zustand";
  $("#zBoundary").value="QS";
  $("#zKeywords").value="";
  $("#zSourceTitle").value="";
  $("#zSource").value="";
  $("#zPublicationDate").value="";
  $("#zImageFile").value="";
  $("#zImageIdea").value="";
  $("#zImageStyle").value="Automatisch";
  $("#zImageFormat").value="Automatisch";
  $("#zImagePrompt").value="";
  $("#zInterviewUrl").value="";
  updateZImageAdvice();
  updateZEditorState(null);
  updateZPreview();
}

function populateZEditor(article){
  const a=article?zNormalizeArticle(article):null;
  if(!a)return clearZEditor();
  currentZArticleId=a.id;
  $("#zCandidate").value=data.candidates.some(c=>c.id===a.candidateId)?a.candidateId:"";
  $("#zTitle").value=a.title;
  $("#zSummary").value=a.summary;
  $("#zCategory").value=[...$("#zCategory").options].some(o=>o.value===a.category)?a.category:"Zustand";
  $("#zBoundary").value=[...$("#zBoundary").options].some(o=>o.value===a.planetaryBoundary)?a.planetaryBoundary:"QS";
  $("#zKeywords").value=a.keywords.join(", ");
  $("#zSourceTitle").value=a.sourceTitle;
  $("#zSource").value=a.sourceUrl;
  $("#zPublicationDate").value=a.publicationDate;
  $("#zImageFile").value=a.imageFile;
  $("#zImageIdea").value=a.imageIdea;
  $("#zImageStyle").value=a.imageStyle;
  $("#zImageFormat").value=a.imageFormat;
  $("#zImagePrompt").value=a.imagePrompt;
  $("#zInterviewUrl").value=a.interviewUrl;
  updateZImageAdvice();
  showZGroup();
  updateZEditorState(a);
  updateZPreview();
}

function updateZEditorState(a){
  const status=a?.workflowStatus||"entwurf";
  const visibility=a?.visibility||"aktiv";
  $("#zStatusBadge").textContent=zStatusLabel(status);
  $("#zVisibilityBadge").textContent=zVisibilityLabel(visibility);
  $("#zEditorHeading").textContent=a?.title||"Neuer Beitrag";
  $("#zToggleActive").textContent=visibility==="archiviert"?"Wieder aktivieren":"Archivieren";
  const hints={
    entwurf:"Entwurf: intern, noch nicht für die öffentliche Datei vorgesehen.",
    geprueft:"Geprüft: Quelle und Kernaussagen wurden redaktionell kontrolliert; noch nicht freigegeben.",
    freigegeben:"Freigegeben: wird bei aktivem Status in die nächste news.json aufgenommen.",
    veroeffentlicht:"Veröffentlicht: redaktionell freigegeben und von dir als tatsächlich veröffentlicht markiert."
  };
  $("#zWorkflowHint").textContent=hints[status];
}

function renderZArticleList(){
  const status=$("#zStatusFilter")?.value||"__all__";
  const visibility=$("#zVisibilityFilter")?.value||"__all__";
  const list=data.zArticles.slice().sort((a,b)=>String(b.lastModified).localeCompare(String(a.lastModified)))
    .filter(a=>(status==="__all__"||a.workflowStatus===status)&&(visibility==="__all__"||a.visibility===visibility));
  $("#zArticleCount").textContent=data.zArticles.length;
  $("#zArticleList").innerHTML=list.length?list.map(a=>{
    const c=data.candidates.find(x=>x.id===a.candidateId);
    return `<button class="z-article-row ${a.id===currentZArticleId?"selected":""}" onclick="selectZArticle('${a.id}')">
      <span class="z-article-title">${esc(a.title||"Ohne Titel")}</span>
      <span class="z-article-meta">${esc(zStatusLabel(a.workflowStatus))} · ${esc(zVisibilityLabel(a.visibility))}${c?" · "+esc(c.name):""}</span>
    </button>`;
  }).join(""):'<p class="hint">Keine Beiträge in dieser Auswahl.</p>';
}
window.selectZArticle=id=>{
  const a=zArticleById(id);
  if(!a)return;
  populateZEditor(a);
  renderZArticleList();
};

function renderZPanel(){
  renderZArticleList();
  const current=zArticleById(currentZArticleId);
  if(current)updateZEditorState(current);
  updateZPreview();
}

function updateZPreview(){
  const title=$("#zTitle")?.value.trim()||"Titel des Beitrags";
  const summary=$("#zSummary")?.value.trim()||"Hier erscheint der Kurztext.";
  const category=$("#zCategory")?.value||"Zustand";
  const boundary=$("#zBoundary")?.value||"QS";
  const source=$("#zSource")?.value.trim()||"";
  const interview=$("#zInterviewUrl")?.value.trim()||"";
  const image=$("#zImageFile")?.value.trim()||"";
  $("#zPreviewTitle").textContent=title;
  $("#zPreviewSummary").textContent=summary;
  $("#zPreviewMeta").textContent=`${category} · ${boundary}`;
  $("#zSummaryCount").textContent=`${$("#zSummary").value.length} Zeichen · Ziel 350–550`;
  const sourceLink=$("#zPreviewSource");
  sourceLink.href=source||"#";
  sourceLink.classList.toggle("disabled-link",!source);
  const interviewLink=$("#zPreviewInterview");
  interviewLink.href=interview||"#";
  interviewLink.classList.toggle("hidden",!interview||zPreviewMode==="th");
  const imageBox=$("#zPreviewImage");
  imageBox.style.backgroundImage=image?`url('${image.replace(/'/g,"%27")}')`:"";
  imageBox.classList.toggle("has-image",!!image);
  imageBox.querySelector("span").textContent=image?"":"Bild";
}

function setZPreviewMode(mode){
  zPreviewMode=mode;
  const card=$("#zPreviewCard");
  card.classList.toggle("mode-th",mode==="th");
  card.classList.toggle("mode-full",mode==="full");
  $("#zPreviewTh").classList.toggle("active-preview",mode==="th");
  $("#zPreviewFull").classList.toggle("active-preview",mode==="full");
  updateZPreview();
}

function zPublicId(a){
  if(a.publicId)return a.publicId;
  const clean=String(a.id||"").replace(/[^a-zA-Z0-9]/g,"").slice(0,7).toUpperCase()||Math.random().toString(36).slice(2,9).toUpperCase();
  return `${a.planetaryBoundary||"QS"}_S${clean}`;
}
function zContentType(a){
  if(a.category==="Natur verstehen"||a.category==="Wie wissen wir das?")return "explainer";
  if(a.category==="Menschen der Forschung")return "editorial";
  return "news";
}
function zPublicArticle(a){
  const id=zPublicId(a);
  const base=(a.publicOriginal && typeof a.publicOriginal==="object")?JSON.parse(JSON.stringify(a.publicOriginal)):{};
  const imageCtx={...a,keywords:zKeywordList(a.keywords)};
  const resolvedImageStyle=zAutomaticImageStyle(imageCtx);
  const resolvedImageFormat=zAutomaticImageFormat(imageCtx,resolvedImageStyle);
  const publicImageStyle=({
    Natur:"nature",
    Wissenschaft:"scientific-editorial",
    Symbolisch:"symbolic-editorial",
    "Prozess-/Erklärskizze":"vector-explainer"
  })[resolvedImageStyle]||"nature";
  const out={
    ...base,
    id,
    status:"freigegeben",
    title:a.title,
    summary:a.summary,
    planetaryBoundary:a.planetaryBoundary||"QS",
    keywords:zKeywordList(a.keywords),
    imageId:base.imageId||`${id}_01`,
    sourceUrl:a.sourceUrl,
    sourceTitle:a.sourceTitle||base.sourceTitle||"",
    publicationDate:a.publicationDate,
    author:base.author||"",
    interviewPotential:a.interviewUrl?"hoch":(base.interviewPotential||""),
    created:base.created||a.created||zToday(),
    lastModified:String(a.lastModified||zToday()).slice(0,10),
    language:base.language||"de",
    article:Array.isArray(base.article)?base.article:[],
    facts:Array.isArray(base.facts)?base.facts:[],
    links:Array.isArray(base.links)?base.links:[],
    license:base.license||"",
    contentType:base.contentType||zContentType(a),
    category:a.category||base.category||"",
    visualMode:base.visualMode||(resolvedImageFormat==="SVG"?"process-sketch":"editorial-photo"),
    imageStyle:base.imageStyle||publicImageStyle
  };
  if(a.interviewUrl && !out.links.some(link=>link?.url===a.interviewUrl))out.links.push({label:"Zum Interview",url:a.interviewUrl});
  if(a.imageFile)out.imageFile=a.imageFile;
  return out;
}

function downloadJson(filename,obj){
  const blob=new Blob([JSON.stringify(obj,null,2)+"\n"],{type:"application/json;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function backupTimestampForFilename(date=new Date()){
  const pad=n=>String(n).padStart(2,"0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

function studioBackupPayload(){
  return {
    format:BACKUP_FORMAT,
    version:BACKUP_VERSION,
    exportedAt:new Date().toISOString(),
    storageKey:KEY,
    note:"Vollständige lokale ZUSTAND-Studio-Sicherung. Bilddateien sind nicht enthalten; gespeichert werden nur ihre Pfade und Metadaten.",
    data
  };
}

function downloadStudioBackup(suffix=""){
  // Sicherung bildet den aktuell im Studio-Datenmodell gespeicherten Stand ab.
  const extra=suffix?`_${suffix}`:"";
  downloadJson(`zustand-studio-backup_${backupTimestampForFilename()}${extra}.json`,studioBackupPayload());
}

function backupSummary(restored){
  const candidates=Array.isArray(restored.candidates)?restored.candidates.length:0;
  const interviews=restored.interviews&&typeof restored.interviews==="object"?Object.keys(restored.interviews).length:0;
  const zArticles=Array.isArray(restored.zArticles)?restored.zArticles.length:0;
  return `${candidates} Kandidat:innen, ${interviews} Interview-Datensätze, ${zArticles} Z-Panel-Beiträge`;
}

async function restoreStudioBackup(file){
  try{
    const parsed=JSON.parse(await file.text());
    if(!parsed||parsed.format!==BACKUP_FORMAT||!parsed.data||typeof parsed.data!=="object"){
      throw new Error("Das ist keine gültige ZUSTAND-Studio-Sicherung.");
    }
    if(Number(parsed.version||0)>BACKUP_VERSION){
      throw new Error(`Diese Sicherung verwendet Version ${parsed.version}. Das Studio unterstützt derzeit Version ${BACKUP_VERSION}.`);
    }
    const restored=migrateLegacyZDrafts(normalizeStudioData(parsed.data));
    const when=parsed.exportedAt?new Date(parsed.exportedAt).toLocaleString("de-DE"):"unbekannt";
    const ok=confirm(
      `Studio-Sicherung wiederherstellen?\n\nSicherung vom: ${when}\nEnthalten: ${backupSummary(restored)}\n\nDer aktuelle lokale Datenstand dieses Browsers wird dadurch ersetzt. Falls du ihn behalten möchtest, brich ab und lade zuerst eine Studio-Sicherung herunter.`
    );
    if(!ok)return;
    data=restored;
    storage.save(data);
    currentZArticleId="";
    renderAll();
    nav("research");
    alert("Studio-Sicherung wurde erfolgreich wiederhergestellt.");
  }catch(error){
    alert(`Sicherung konnte nicht wiederhergestellt werden: ${error.message||error}`);
  }
}
function inferZCategory(raw={}){
  if(raw.category)return String(raw.category);
  const keys=zKeywordList(raw.keywords).map(x=>x.toLocaleLowerCase());
  if(raw.contentType==="explainer"||keys.includes("natur verstehen"))return "Natur verstehen";
  if(keys.includes("lösung"))return "Lösung";
  if(keys.includes("querschnitt"))return "Querschnitt";
  return "Zustand";
}

async function importExistingZNews(file){
  try{
    const parsed=JSON.parse(await file.text());
    const articles=Array.isArray(parsed)?parsed:parsed?.articles;
    if(!Array.isArray(articles))throw new Error("Die Datei enthält keine Artikelliste.");
    let added=0,updated=0;
    for(const raw of articles){
      if(!raw || typeof raw!=="object" || !String(raw.title||"").trim())continue;
      const publicId=String(raw.id||"").trim();
      let existing=data.zArticles.find(a=>publicId && a.publicId===publicId);
      if(!existing){
        const sourceUrl=String(raw.sourceUrl||"").trim().toLocaleLowerCase();
        existing=data.zArticles.find(a=>sourceUrl && String(a.sourceUrl||"").trim().toLocaleLowerCase()===sourceUrl && String(a.title||"").trim()===String(raw.title||"").trim());
      }
      const imported=zNormalizeArticle({
        ...(existing||{}),
        id:existing?.id||crypto.randomUUID(),
        publicId:publicId||existing?.publicId||"",
        publicOriginal:raw,
        title:String(raw.title||""),
        summary:String(raw.summary||""),
        category:inferZCategory(raw),
        planetaryBoundary:String(raw.planetaryBoundary||"QS"),
        keywords:zKeywordList(raw.keywords),
        sourceTitle:String(raw.sourceTitle||existing?.sourceTitle||""),
        sourceUrl:String(raw.sourceUrl||""),
        publicationDate:String(raw.publicationDate||""),
        imageFile:String(raw.imageFile||""),
        workflowStatus:"veroeffentlicht",
        visibility:existing?.visibility||"aktiv",
        created:String(raw.created||existing?.created||zToday()),
        lastModified:String(raw.lastModified||existing?.lastModified||zNow()),
        publishedAt:existing?.publishedAt||zNow()
      });
      if(existing){
        const i=data.zArticles.findIndex(a=>a.id===existing.id);
        data.zArticles[i]=imported; updated++;
      }else{
        data.zArticles.push(imported); added++;
      }
    }
    data.zPublicBaselineImported=true;
    data.zPublicBaselineName=file.name||"news.json";
    storage.save(data);
    renderZPanel();
    if(!currentZArticleId && data.zArticles.length)populateZEditor(data.zArticles[0]);
    $("#zExportInfo").textContent=`Bestehende öffentliche Datei importiert: ${articles.length} Einträge gelesen, ${added} neu übernommen, ${updated} aktualisiert. Beim Export bleiben die ursprünglichen öffentlichen Zusatzfelder erhalten.`;
  }catch(err){
    alert("news.json konnte nicht importiert werden: "+err.message);
  }
}

function exportZNews(){
  saveZArticle(false);
  if(!data.zPublicBaselineImported){
    return alert("Bitte vor dem ersten Gesamt-Export die aktuell veröffentlichte news.json importieren. Sonst könnten vorhandene Z-Panel-Beiträge beim Hochladen verloren gehen.");
  }
  const eligible=data.zArticles.filter(a=>a.visibility==="aktiv" && ["freigegeben","veroeffentlicht"].includes(a.workflowStatus));
  const invalid=eligible.filter(a=>a.workflowStatus==="freigegeben")
    .map(a=>({a,err:zValidation(a,{forRelease:true})})).filter(x=>x.err);
  if(invalid.length)return alert(`Export abgebrochen. Bitte zuerst prüfen: ${invalid[0].a.title||"Ohne Titel"}: ${invalid[0].err}`);
  const payload={version:1,generatedAt:zNow(),articleCount:eligible.length,articles:eligible.map(zPublicArticle)};
  downloadJson("news.json",payload);
  const archived=data.zArticles.filter(a=>a.visibility==="archiviert" && ["freigegeben","veroeffentlicht"].includes(a.workflowStatus)).length;
  $("#zExportInfo").textContent=`news.json erzeugt: ${eligible.length} aktive, freigegebene/veröffentlichte Beiträge. ${archived} archivierte öffentliche Beiträge bleiben im Studio und wurden nicht ausgespielt.`;
}

$("#zImportNews").onclick=()=>$("#zImportNewsFile").click();
$("#zImportNewsFile").onchange=async e=>{
  const file=e.target.files?.[0];
  if(file)await importExistingZNews(file);
  e.target.value="";
};

$("#zNewArticle").onclick=newZArticle;
$("#saveZ").onclick=()=>saveZArticle(true);
$("#zMarkChecked").onclick=()=>zSetWorkflow("geprueft");
$("#zRelease").onclick=()=>zSetWorkflow("freigegeben");
$("#zMarkPublished").onclick=()=>zSetWorkflow("veroeffentlicht");
$("#zToggleActive").onclick=zToggleVisibility;
$("#zDeleteArticle").onclick=()=>{
  const a=zArticleById(currentZArticleId);
  if(!a)return;
  if(!confirm(`Beitrag „${a.title||"Ohne Titel"}“ wirklich aus dem Studio löschen?`))return;
  data.zArticles=data.zArticles.filter(x=>x.id!==a.id);
  currentZArticleId="";
  storage.save(data);
  renderZPanel();
  const next=data.zArticles[0];
  next?populateZEditor(next):clearZEditor();
};
$("#zStatusFilter").onchange=renderZArticleList;
$("#zVisibilityFilter").onchange=renderZArticleList;
$("#zPreviewTh").onclick=()=>setZPreviewMode("th");
$("#zPreviewFull").onclick=()=>setZPreviewMode("full");
$("#zExportNews").onclick=exportZNews;
$("#zCandidate").onchange=()=>{showZGroup();updateZPreview();};
$("#zImportCandidateProfile").onclick=importCandidateProfileToZArticle;
$("#zBuildImagePrompt").onclick=buildZImagePrompt;
$("#zCopyImagePrompt").onclick=()=>void copyZImagePrompt();
["#zTitle","#zSummary","#zCategory","#zBoundary","#zKeywords","#zSourceTitle","#zSource","#zPublicationDate","#zImageFile","#zImageIdea","#zImageStyle","#zImageFormat","#zImagePrompt","#zInterviewUrl"].forEach(sel=>{
  $(sel).addEventListener("input",()=>{updateZPreview();updateZImageAdvice();});
  $(sel).addEventListener("change",()=>{updateZPreview();updateZImageAdvice();});
});

$("#downloadStudioBackup").onclick=()=>downloadStudioBackup();
$("#restoreStudioBackup").onclick=()=>$("#restoreStudioBackupFile").click();
$("#restoreStudioBackupFile").onchange=async event=>{
  const file=event.target.files?.[0];
  if(file)await restoreStudioBackup(file);
  event.target.value="";
};

$("#clearDemo").onclick=()=>{
  const answer=prompt(
    "ACHTUNG: Damit werden Kandidaten, Interviews und Z-Panel-Redaktion dieses Browsers gelöscht.\n\nVor dem Löschen wird automatisch eine Studio-Sicherung heruntergeladen.\n\nTippe zum endgültigen Löschen exakt: LÖSCHEN"
  );
  if(answer!=="LÖSCHEN")return;
  downloadStudioBackup("vor-loeschen");
  storage.clear();
  data=migrateLegacyZDrafts(normalizeStudioData(storage.load()));
  currentZArticleId="";
  renderAll();
  nav("research");
  alert("Die lokalen Studio-Daten dieses Browsers wurden gelöscht. Die Sicherungsdatei wurde zuvor zum Download angeboten.");
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

function parseTrainingStatements(text){
  return normalizeStoredLineBreaks(text)
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
  const findings=parseTrainingStatements($("#iCoreFindings").value);
  trainerItems=[];

  const introChunks=trainingIntroChunks(intro);
  introChunks.forEach((text,i)=>trainerItems.push({
    kind:`Anmoderation ${i+1}/${introChunks.length}`,
    type:"intro",
    text
  }));
  findings.forEach((text,i)=>trainerItems.push({kind:`Kernaussage ${i+1}`,type:"finding",text}));
  return trainerItems.length>0;
}

async function trainerLoop(){
  if(!trainerRunning||trainerPaused||!trainerItems.length)return;
  const item=trainerItems[trainerIndex];
  $("#trainingStatus").textContent=item.kind;
  $("#trainingRound").textContent=`Runde ${trainerRound}`;
  $("#trainingText").textContent=item.text;

  // Die Ansage trennt Anmoderation und Kernaussagen akustisch.
  await trainerSpeak(item.kind);
  if(!trainerRunning||trainerPaused)return;
  await trainerDelay(500);
  await trainerSpeak(item.text);
  if(!trainerRunning||trainerPaused)return;

  $("#trainingStatus").textContent=item.type==="intro"?"Jetzt diesen Abschnitt laut nachsprechen …":"Jetzt die Kernaussage in eigenen Worten wiedergeben …";
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
  const findings=parseTrainingStatements($("#iCoreFindings").value);
  if(!findings.length)return alert("Für diesen Kandidaten sind noch keine Kernaussagen gespeichert. Bitte zuerst die erweiterte Recherche importieren oder Kernaussagen eintragen.");

  // Änderungen vor Trainingsstart automatisch speichern.
  data.interviews[c.id]=currentInterviewEditorValues();
  storage.save(data);

  if(!buildTraining())return alert("Bitte Anmoderation oder Kernaussagen eintragen.");
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
  // Alle Interviewfelder einschließlich Aufnahme-/Sendetermin bleiben erhalten.
  data.interviews[c.id]=currentInterviewEditorValues();
  storage.save(data);
  if(!buildTraining())return alert("Bitte mindestens einen Abschnitt der Interviewvorbereitung eintragen.");
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
  renderInterviewSchedule();
  showZGroup();
  renderZPanel();
  if(!currentZArticleId && data.zArticles.length){
    currentZArticleId=data.zArticles[0].id;
    populateZEditor(data.zArticles[0]);
  }else if(!data.zArticles.length){
    clearZEditor();
  }
}
renderAll();
