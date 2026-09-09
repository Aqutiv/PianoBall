/** Short offline checks through the production graph; no listening claim. */
import { render } from './render-music.mjs';
import { compilePublishedCatalog } from '../src/content/export.ts';
import { LEAD_VOICES, BED_VOICES } from '../src/audio/voices.ts';

async function save(name, data) {
  const response = await fetch('/__music_save?name=' + name, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(data,null,2)+'\n'});
  if (!response.ok) throw Error(await response.text());
  return response.json();
}
function passes(stem) {
  return stem.nonfiniteSamples===0 && stem.clippedSamples===0 && stem.nearClipSamples===0 && stem.endingRmsDbFS < -65;
}
export async function run() {
  const catalog=compilePublishedCatalog({sourceCommit:null,sourceDirty:true});
  const results={...(await (await fetch('/__music_provenance')).json()),browser:navigator.userAgent,
    scope:'First eight authored beats, retaining full durations of notes starting in the excerpt; solo soft/hard, repeated notes and held chord checks. Offline production graph at 24 kHz. No subjective listening acceptance.',
    banks:{lead:LEAD_VOICES.length,bed:BED_VOICES.length},solo:[],passages:[]};
  const solo=[['lead','trumpet'],['lead','harmonica'],['lead','electric-bass'],['bed','steel-string-guitar'],['bed','clean-electric-guitar'],['bed','brass-ensemble']];
  for(const [bank,id] of solo) for(const velocity of [.25,.95]) {
    const base=id==='electric-bass'?43:60;
    const entry={id:'solo-'+id,role:bank,title:id,bpm:120,voices:{keyVoicing:bank,keys:id,backing:'warm'},backingEvents:[],playerNotes:[
      {beat:0,len:.35,note:base},{beat:.5,len:.35,note:base},{beat:1,len:.35,note:base},
      {beat:2,len:2,note:base},{beat:2,len:3,note:base+4},{beat:2,len:4,note:base+7}]};
    const stem=await render(entry,'player',{sampleRate:24000,label:'fixed',nameSuffix:String(velocity).replace('.','-'),playerVelocity:velocity});
    results.solo.push({...stem,pass:passes(stem)});
    document.querySelector('#status').textContent='Solo '+id+' '+velocity;
  }
  for(const original of catalog.entries) {
    const entry={...original,playerNotes:original.playerNotes.filter(n=>n.beat<8),backingEvents:original.backingEvents.filter(n=>n.beat<8),drumEvents:original.drumEvents?.filter(n=>n.beat<8)};
    const stems=[];
    for(const stem of ['player','automatic','combined']) stems.push(await render(entry,stem,{sampleRate:24000,label:'fixed',nameSuffix:'excerpt'}));
    results.passages.push({role:entry.role,id:entry.id,voices:entry.voices,pass:stems.every(passes),playerMinusAutomaticRmsDb:stems[0].musicRmsDbFS-stems[1].musicRmsDbFS,stems});
    document.querySelector('#status').textContent=`Passage ${results.passages.length}/48: ${entry.role}/${entry.id}`;
  }
  results.pass=results.solo.every(s=>s.pass)&&results.passages.every(s=>s.pass);
  await save('fixed_instrument-review.json',results);
  document.querySelector('#status').textContent=results.pass?'All short render checks passed':'Render checks need review';
  return results;
}
