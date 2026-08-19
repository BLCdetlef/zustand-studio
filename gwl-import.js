(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.GwlStudioImport=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const SUPPORTED_FORMAT="gwl-knowledge-network-v1.3";
  const MAPPING_VERSION="gwl-to-zustand-candidate-v1";

  function clean(value){return String(value??"").replace(/\s+/g," ").trim()}
  function list(value){return Array.isArray(value)?value:[]}
  function unique(values){
    const seen=new Set();
    return values.map(clean).filter(value=>{
      const key=value.toLocaleLowerCase();
      if(!value||seen.has(key))return false;
      seen.add(key); return true;
    });
  }
  function sourceMap(gwl){return Object.fromEntries(list(gwl.sources).map(source=>[source.id,source]))}
  function sourceUrl(source){return clean(source?.url||source?.doi)}
  function studyPeriod(study,sources){
    const years=list(study.sourceRefs).map(id=>clean(sources[id]?.year)).filter(Boolean);
    return unique(years).join("/");
  }
  function studyTitle(study,sources){
    const source=list(study.sourceRefs).map(id=>sources[id]).find(Boolean);
    return clean(source?.title||study.id||"Studie / Evidenzgrundlage");
  }
  function researcherPublications(gwl,sources){
    const referenced=new Set(list(gwl.studyEvidence).flatMap(study=>list(study.sourceRefs)));
    return list(gwl.sources)
      .filter(source=>referenced.has(source.id)&&/burkhardt/i.test(clean(source.authors)))
      .slice(0,3)
      .map(source=>({
        title:clean(source.title),
        year:clean(source.year),
        url:sourceUrl(source),
        relevance:"Wissenschaftliche Grundlage des importierten GWL-Wissenspfads."
      }));
  }
  function quantityText(measurement){
    const scope=[clean(measurement.geography),clean(measurement.period)].filter(Boolean).join(" · ");
    const label=clean(measurement.display)||[measurement.value,measurement.unit].filter(value=>value!==undefined&&value!==null&&value!=="").join(" ");
    const metric=clean(measurement.metric);
    return [label,metric,scope?`(${scope})`:""].filter(Boolean).join(" – ");
  }
  function relevantMeasurements(gwl){
    return list(gwl.measurements).map((measurement,index)=>{
      const text=`${clean(measurement.metric)} ${clean(measurement.display)}`;
      let score=0;
      if(/gesamtverlust|frühen abflussphase|gemessene biozidkonzentrationen|anfangsphase möglich/i.test(text))score+=10;
      if(/wirkstoff.*jahr|jahresverbrauch.*wirkstoff|jährlicher verbrauch biozider wirkstoffe|wirkstoffe pro jahr/i.test(text))score+=12;
      if(/minderung|reduktionspotenzial/i.test(text))score+=6;
      if(measurement.displayType==="study_value")score+=3;
      return {measurement,index,score};
    }).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,5).map(item=>item.measurement);
  }
  function chooseQuestions(gwl){
    const questions=unique(list(gwl.reviewQuestionsForExperts));
    const opening=questions.find(q=>/welches ergebnis|beschreibt den zustand|woher wissen/i.test(q))||questions[0]||"";
    const reserve=questions.filter(q=>q!==opening);
    const preferred=[];
    [/heute|neuere|aktuell/i,/übertragbar|stand der technik|grenzen/i,/verkapselung|lösung|maßnahme/i,/messreihe|fallstudie/i].forEach(pattern=>{
      const hit=reserve.find(q=>pattern.test(q)&&!preferred.includes(q));
      if(hit)preferred.push(hit);
    });
    reserve.forEach(q=>{if(preferred.length<3&&!preferred.includes(q))preferred.push(q)});
    return {opening,reserve:preferred.slice(0,3)};
  }
  function validate(gwl){
    if(!gwl||typeof gwl!=="object"||Array.isArray(gwl))throw new Error("Die GWL-Datei muss ein JSON-Objekt enthalten.");
    if(gwl.format!==SUPPORTED_FORMAT)throw new Error(`Nicht unterstütztes GWL-Format: ${clean(gwl.format)||"ohne Formatangabe"}. Erwartet wird ${SUPPORTED_FORMAT}.`);
    if(!clean(gwl.researcherConnection?.researcher))throw new Error("Die GWL-Datei enthält keine Forscherverknüpfung.");
    if(!gwl.entry||typeof gwl.entry!=="object")throw new Error("Die GWL-Datei enthält keinen fachlichen Einstieg (entry).");
    const sources=sourceMap(gwl);
    const refs=[...list(gwl.studyEvidence),...list(gwl.measurements)].flatMap(item=>list(item.sourceRefs));
    const missing=unique(refs.filter(id=>!sources[id]));
    return missing.map(id=>`Quellenreferenz ${id} ist nicht in sources enthalten.`);
  }
  function project(gwl,sourceFile=""){
    const warnings=validate(gwl);
    const sources=sourceMap(gwl);
    const studies=list(gwl.studyEvidence).slice(0,3);
    const profileSource=list(gwl.sources).find(source=>/profile/i.test(clean(source.id)))||list(gwl.sources).find(source=>/ost\.ch/i.test(sourceUrl(source)));
    const questions=chooseQuestions(gwl);
    const selectedMeasurements=relevantMeasurements(gwl);
    const coreFindings=unique([
      ...list(gwl.corePrinciples),
      ...list(gwl.studyEvidence).map(study=>study.finding)
    ]).slice(0,6);
    const uncertainties=unique([
      gwl.researcherConnection?.importantLimitation,
      ...list(gwl.measurements).map(measurement=>measurement.uncertainty),
      ...list(gwl.knowledgeGaps).map(gap=>gap.question)
    ]).slice(0,4);
    const connections=unique([
      ...list(gwl.pathways).map(path=>path.label),
      ...list(gwl.boundaryInteractions).map(item=>`${clean(item.boundary)}: ${clean(item.relation)}`)
    ]).slice(0,4);
    const relevantIds={
      studyEvidence:studies.map(item=>item.id).filter(Boolean),
      measurements:selectedMeasurements.map(item=>item.id).filter(Boolean),
      knowledgeGaps:list(gwl.knowledgeGaps).map(item=>item.id).filter(Boolean),
      pathways:list(gwl.pathways).map(item=>item.id).filter(Boolean),
      sources:unique([
        ...(profileSource?.id?[profileSource.id]:[]),
        ...studies.flatMap(item=>list(item.sourceRefs))
      ])
    };
    const evidenceSourceIds=new Set(list(gwl.studyEvidence).flatMap(study=>list(study.sourceRefs)));
    const periodYears=unique(list(gwl.sources).filter(source=>evidenceSourceIds.has(source.id)&&/burkhardt/i.test(clean(source.authors))).map(source=>source.year)).sort();
    const candidate={
      name:clean(gwl.researcherConnection.researcher),
      institution:clean(gwl.researcherConnection.institution),
      topic:clean(gwl.entry.effectFocus||gwl.entry.subComponent||gwl.topic),
      period:periodYears.length>1?`Studien ${periodYears[0]}–${periodYears[periodYears.length-1]}`:(periodYears[0]?`Studie ${periodYears[0]}`:""),
      email:"", phone:"", address:"",
      source:sourceUrl(profileSource),
      why:clean(gwl.researcherConnection.fitExplanation),
      question:questions.opening,
      coreFindings,
      measurements:studies.map(study=>({
        name:studyTitle(study,sources),
        period:studyPeriod(study,sources),
        measured:clean(study.finding),
        method:clean(study.design),
        role:"Autor oder Mitautor der in GWL zugeordneten Forschungsarbeit.",
        trend:clean(study.finding),
        sourceUrl:sourceUrl(list(study.sourceRefs).map(id=>sources[id]).find(Boolean))
      })),
      publications:researcherPublications(gwl,sources),
      keyNumbers:selectedMeasurements.map(quantityText).filter(Boolean),
      connections,
      uncertainties,
      openingQuestion:questions.opening,
      reserveQuestions:questions.reserve,
      gwlContext:{
        sourceType:"gwl-knowledge-network",
        sourceFormat:clean(gwl.format),
        sourceVersion:clean(gwl.version),
        sourceStatus:clean(gwl.status),
        sourceFile:clean(sourceFile),
        mappingVersion:MAPPING_VERSION,
        importedAt:new Date().toISOString(),
        topic:clean(gwl.topic),
        importantLimitation:clean(gwl.researcherConnection.importantLimitation),
        relevantIds
      }
    };
    if(clean(gwl.status).toLowerCase()!=="published"&&clean(gwl.status).toLowerCase()!=="approved")warnings.unshift(`GWL-Status: ${clean(gwl.status)||"nicht angegeben"}. Die Angaben müssen redaktionell und wissenschaftlich geprüft werden.`);
    if(!list(gwl.timeSeries).length)warnings.push("Die GWL-Datei enthält keine Zeitreihe; es wird keine Langzeitreihe behauptet.");
    if(!profileSource)warnings.push("Keine offizielle Profilquelle für die verknüpfte Person erkannt.");
    return {candidate,warnings};
  }

  function feedback(candidate,interview,exportedAt=new Date().toISOString()){
    const ctx=candidate?.gwlContext;
    if(!ctx)throw new Error("Der Kandidat ist nicht mit einer GWL-Wissensdatei verknüpft.");
    return {
      format:"gwl-interview-feedback-v1",
      status:"editorial_draft_requires_scientific_review",
      exportedAt,
      target:{
        sourceFormat:ctx.sourceFormat,
        sourceVersion:ctx.sourceVersion,
        sourceFile:ctx.sourceFile,
        topic:ctx.topic,
        relevantIds:ctx.relevantIds
      },
      candidate:{name:candidate.name,institution:candidate.institution,studioCandidateId:candidate.id},
      interview:{recordingAt:clean(interview?.recordingAt),broadcastAt:clean(interview?.broadcastAt)},
      editorialAssessment:{
        notes:clean(interview?.gwlFeedback),
        preparationContext:{
          coreFindings:clean(interview?.coreFindings),
          evidence:clean(interview?.evidence),
          quantitiesConnectionsAndUncertainties:clean(interview?.connections),
          questions:clean(interview?.notes)
        }
      },
      reviewRule:"Keine Aussage automatisch in GWL übernehmen. Quantitäten, Einheiten, Zeit-/Raumbezug, Primärquelle und Evidenzstatus wissenschaftlich prüfen."
    };
  }

  return {SUPPORTED_FORMAT,MAPPING_VERSION,validate,project,feedback};
});
