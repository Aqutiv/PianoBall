/** Browser module: seeded, reproducible review through the production Web Audio graph. */
import { AudioEngine, DEFAULT_AUDIO } from '../src/audio/engine.ts';
import { compilePublishedCatalog } from '../src/content/export.ts';
import { ROLES } from '../src/modes/playtune/role.ts';
import { validateReviewSampleRate, retainRepeatCheck } from './music-review-manifest.ts';

const LEAD_IN = .25;
const TAIL = 5;
const QUANTUM = 128;
function seeded(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function hash(text) { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function fixed(seed, action) { const previous = Math.random; Math.random = seeded(seed); try { return action(); } finally { Math.random = previous; } }
const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const fingerprint=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(value))))),byte=>byte.toString(16).padStart(2,'0')).join('');
const db = value => 20 * Math.log10(Math.max(value, 1e-9));
function metrics(buffer, contentEnd) {
  let peak = 0, square = 0, dc = 0, nonfinite = 0, clipped = 0, nearClip = 0, tailSquare = 0, tailCount = 0;
  let musicSquare = 0, musicCount = 0;
  const musicStart = Math.floor(LEAD_IN * buffer.sampleRate), musicStop = Math.floor(contentEnd * buffer.sampleRate);
  const tailStart = buffer.length - Math.floor(.25 * buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const s = data[i];
      if (!Number.isFinite(s)) { nonfinite++; continue; }
      const a = Math.abs(s); peak = Math.max(peak, a); square += s*s; dc += s;
      if (a >= 1) clipped++;
      if (a >= .98) nearClip++;
      if (i >= tailStart) { tailSquare += s*s; tailCount++; }
      if (i >= musicStart && i < musicStop) { musicSquare += s*s; musicCount++; }
    }
  }
  const count = buffer.length * buffer.numberOfChannels;
  return { seconds: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels,
    peak, peakDbFS: db(peak), rms: Math.sqrt(square/count), rmsDbFS: db(Math.sqrt(square/count)),
    musicRmsDbFS: db(Math.sqrt(musicSquare/Math.max(1,musicCount))),
    endingRmsDbFS: db(Math.sqrt(tailSquare/Math.max(1,tailCount))),
    dc: dc/count, nonfiniteSamples: nonfinite, clippedSamples: clipped, nearClipSamples: nearClip };
}
function wav(buffer) {
  const length = buffer.length * buffer.numberOfChannels * 2;
  const bytes = new ArrayBuffer(44 + length), view = new DataView(bytes);
  const text = (at, str) => { for (let i=0;i<str.length;i++)view.setUint8(at+i,str.charCodeAt(i)); };
  text(0,'RIFF'); view.setUint32(4,36+length,true); text(8,'WAVE'); text(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,buffer.numberOfChannels,true);
  view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*buffer.numberOfChannels*2,true);
  view.setUint16(32,buffer.numberOfChannels*2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,length,true);
  const channels = Array.from({length:buffer.numberOfChannels},(_,c)=>buffer.getChannelData(c));
  for(let i=0,at=44;i<buffer.length;i++)for(const channel of channels){const s=Math.max(-1,Math.min(1,channel[i]));view.setInt16(at,Math.round(s*(s<0?32768:32767)),true);at+=2;}
  return bytes;
}
async function save(name, body, type) {
  const response = await fetch('/__music_save?name='+encodeURIComponent(name), {method:'POST',headers:{'content-type':type},body});
  if(!response.ok)throw Error(await response.text());return response.json();
}

export async function render(entry, stem, { sampleRate = 48000, label = 'current', written = true, nameSuffix = '' } = {}) {
  const beatSeconds = 60/entry.bpm;
  const last = Math.max(0,...entry.playerNotes.map(n=>n.beat+n.len),...entry.backingEvents.map(n=>n.beat+n.len),...(entry.drumEvents??[]).map(hit=>hit.beat));
  const contentEnd = LEAD_IN + last*beatSeconds;
  const context = new OfflineAudioContext(2,Math.ceil((contentEnd+TAIL)*sampleRate),sampleRate);
  const engine = new AudioEngine();
  engine.settings = {...DEFAULT_AUDIO};
  engine.lite = false;
  engine.ctx = context;
  // Only this test adapter bypasses the live-context state check. Node builders,
  // input/release paths, mixing, instruments and effects are production code.
  Object.defineProperty(engine,'running',{get:()=>true});
  engine.setKeyVoicing(entry.voices.keyVoicing);
  if(entry.voices.keyVoicing==='bed')engine.setKeyBedVoice(entry.voices.keys);
  else engine.setLeadVoice(entry.voices.keys);
  engine.setBedVoice(entry.voices.backing);
  const base = hash(entry.role+':'+entry.id);
  fixed(base,()=>engine.build(context));
  engine.ready=true;
  engine.setTempo(entry.bpm);
  if(stem!=='player')entry.backingEvents.forEach((event,i)=>fixed(base ^ hash('auto:'+i),()=>
    engine.pad(event.notes,event.len*beatSeconds,event.gain,LEAD_IN+event.beat*beatSeconds,event.attack*beatSeconds,written)));
  // Drums belong to the automatic side in both roles. Use the production
  // owned route so its dedicated room returns match normal PlayTune playback.
  if(stem!=='player'&&entry.drumEvents?.length){
    const drums=fixed(base ^ hash('drum-track'),()=>engine.createDrumTrack());
    entry.drumEvents.forEach((event,i)=>fixed(base ^ hash('drum:'+i),()=>
      drums.drum(event.voice,event.gain,LEAD_IN+event.beat*beatSeconds)));
  }
  const jobs=[];
  let maxInputQuantizationMs=0;
  if(stem!=='automatic') {
    const events=entry.playerNotes.flatMap((note,i)=>[
      {time:LEAD_IN+note.beat*beatSeconds,press:true,note:note.note,serial:i},
      {time:LEAD_IN+(note.beat+note.len)*beatSeconds,press:false,note:note.note,serial:i},
    ]).sort((a,b)=>a.time-b.time||Number(a.press)-Number(b.press)||a.note-b.note);
    const groups=new Map();
    for(const event of events){const frame=Math.floor(event.time*sampleRate/QUANTUM)*QUANTUM;const group=groups.get(frame)??[];group.push(event);groups.set(frame,group);}
    for(const [frame,events] of groups) {
      jobs.push(context.suspend(frame/sampleRate).then(()=>{
        for(const event of events){
          maxInputQuantizationMs=Math.max(maxInputQuantizationMs,Math.abs(context.currentTime-event.time)*1000);
          fixed(base ^ hash('player:'+event.serial+':'+event.press),()=>{
            if(event.press)engine.noteOn(event.note,.62,Math.max(-.65,Math.min(.65,(event.note-60)/48)));
            else engine.noteOff(event.note);
          });
        }
        return context.resume();
      }));
    }
  }
  const buffer=await context.startRendering();
  await Promise.all(jobs);
  const measured=metrics(buffer,contentEnd);
  if(measured.nonfiniteSamples)throw Error(entry.id+': nonfinite rendered samples');
  const name=[label,entry.role,entry.id,stem].join('_')+(nameSuffix?'_'+nameSuffix:'')+'.wav';
  const output=await save(name,wav(buffer),'audio/wav');
  return {id:entry.id,role:entry.role,title:entry.title,bpm:entry.bpm,stem,label,written,playerVelocity:.62,
    register:'authored',keyboardShiftSemitones:0,drumEventCount:stem==='player'?0:(entry.drumEvents?.length??0),maxInputQuantizationMs,...measured,...output};
}

export async function run(options = {}) {
  const label=options.label??'current';
  const catalog=label==='baseline'?await (await fetch('/__music_baseline')).json():compilePublishedCatalog({sourceCommit:null,sourceDirty:true});
  const entries=catalog.entries.filter(e=>(!options.ids?.length||options.ids.includes(e.id))&&(!options.roles?.length||options.roles.includes(e.role)));
  if(!entries.length)throw Error('No arrangements match the requested IDs/roles');
  const missingIds=options.ids?.filter(id=>!entries.some(entry=>entry.id===id))??[];
  if(missingIds.length)throw Error('Unknown IDs for the selected roles: '+missingIds.join(', '));
  const partial=Boolean(options.ids?.length||options.roles?.length);
  const prior=partial?await (await fetch('/__music_manifest?label='+label)).json():null;
  validateReviewSampleRate(prior,options.sampleRate??48000);
  const results=prior?.entries?.filter(e=>catalog.entries.some(current=>current.role===e.role&&current.id===e.id)&&!entries.some(next=>next.role===e.role&&next.id===e.id)).map(e=>({...e,sourceDigest:e.sourceDigest??prior.sourceDigest}))??[];
  let completedThisRun=0;
  const provenance=await (await fetch('/__music_provenance')).json();
  const entryHashes=new Map(await Promise.all(catalog.entries.map(async entry=>[entry.role+':'+entry.id,await fingerprint(entry)])));
  for(const entry of results)if(entry.entrySha256&&entry.entrySha256!==entryHashes.get(entry.role+':'+entry.id))throw Error('Retained arrangement changed; include it in this render: '+entry.role+':'+entry.id);
  const snapshot=await save(label+'_catalog_'+provenance.sourceDigest.slice(0,12)+'.json',JSON.stringify(catalog,null,2)+'\n','application/json');
  const manifest={...provenance,catalogSnapshot:snapshot.file,register:'authored',keyboardShiftSemitones:0,label,sampleRate:options.sampleRate??48000,engine:'production AudioEngine at review working tree',
    baselineNote:label==='baseline'?'Baseline catalog data rendered by current engine; not an old-engine recording':undefined,
    defaults:'Default mix; high audio quality; player velocity .62; 0.25s lead-in; 5s tail; no live player pedal; authored drums included in automatic/combined stems',
    browser:navigator.userAgent,entries:results,determinism:retainRepeatCheck(prior?.determinism,results),expectedArrangements:catalog.entries.length,selectedRoleKeys:entries.map(entry=>entry.role+':'+entry.id),
    priorSnapshots:partial?[...(prior?.priorSnapshots??[]),...(prior?[{sourceDigest:prior.sourceDigest,capturedAt:prior.capturedAt}]:[])]:[]};
  for(const entry of entries) {
    const source=ROLES[entry.role].tunes.find(t=>t.id===entry.id);
    const written=entry.role==='chords'||(label!=='baseline'&&source?.backingNotes!==undefined);
    const stems=[];
    for(const stem of ['player','automatic','combined']){
      document.querySelector('#status').textContent=`Rendering ${entry.role}: ${entry.title} (${stem})`;
      const result=await render(entry,stem,{...options,label,written});stems.push(result);
      await fetch('/__music_progress',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(result)});
    }
    if(options.verifyRepeat && completedThisRun===0) {
      const repeated=await render(entry,'combined',{...options,label,written,nameSuffix:'repeat'});
      manifest.determinism={id:entry.id,role:entry.role,expectedSha256:stems[2].sha256,actualSha256:repeated.sha256,matches:stems[2].sha256===repeated.sha256};
      const basename=file=>file.split(/[\\/]/).at(-1);
      const response=await fetch('/__music_compare?first='+encodeURIComponent(basename(stems[2].file))+'&second='+encodeURIComponent(basename(repeated.file)));
      if(!response.ok)throw Error(await response.text());
      Object.assign(manifest.determinism,await response.json());
      if(!manifest.determinism.withinTolerance) { await save(label+'_repeat-failure.json',JSON.stringify(manifest.determinism,null,2),'application/json'); throw Error('Repeated PCM render exceeds one PCM16 unit for '+entry.id); }
    }
    results.push({id:entry.id,role:entry.role,title:entry.title,bpm:entry.bpm,sourceDigest:provenance.sourceDigest,rendererDigest:provenance.rendererDigest,entrySha256:entryHashes.get(entry.role+':'+entry.id),fingerprintBasis:'captured from the rendered entry',
      automaticMinusPlayerRmsDb:stems[1].musicRmsDbFS-stems[0].musicRmsDbFS,
      balanceReviewRequired:stems[1].musicRmsDbFS-stems[0].musicRmsDbFS > 6 || stems[1].musicRmsDbFS-stems[0].musicRmsDbFS < -20,
      renderChecksPass:stems.every(s=>s.nonfiniteSamples===0&&s.clippedSamples===0&&s.nearClipSamples===0&&s.endingRmsDbFS < -65),stems});
    completedThisRun++;
    manifest.renderedArrangementsThisRun=completedThisRun;
    manifest.selectionComplete=entries.every(entry=>results.filter(result=>result.role===entry.role&&result.id===entry.id).length===1);
    manifest.complete=results.length===catalog.entries.length&&catalog.entries.every(entry=>results.filter(result=>result.role===entry.role&&result.id===entry.id).length===1);
    results.sort((a,b)=>catalog.entries.findIndex(e=>e.role===a.role&&e.id===a.id)-catalog.entries.findIndex(e=>e.role===b.role&&e.id===b.id));
    await save(label+'_render-metrics.json',JSON.stringify(manifest,null,2)+'\n','application/json');
  }
  document.querySelector('#status').textContent=`Finished ${entries.length} arrangements, ${entries.length*3} WAV files.`;
  return manifest;
}

/** Real browser clock, production mode/input/transport, isolated by the runner profile. */
export async function smoke({label='current'} = {}) {
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const waitFor=async(test,label,limit=20000)=>{const start=performance.now();while(!test()){
    if(performance.now()-start>limit){
      const api=window.__pianoball,mode=api?.shell.active;
      throw Error('Timed out: '+label+' '+JSON.stringify({phase:mode?.phase,tune:mode?.tune?.id,audioNow:api?.audio.now,audioState:api?.audio.ctx?.state,endsAt:mode?.endsAt,transport:mode?.transport?.running,suspended:api?.shell.suspended,screen:api?.overlay.screen,visibility:document.visibilityState,fps:api?.loop.stats.fps}));
    }
    await delay(30);
  }};
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  await waitFor(()=>window.__pianoball?.shell.active,'application boot');
  const api=window.__pianoball, engine=api.audio;
  check(await api.startAudio(),'AudioContext did not start');
  // Keep the ordinary hardware clock running, with only its final speaker feed muted.
  const silence=engine.ctx.createGain();silence.gain.value=0;
  engine.clip.disconnect(engine.ctx.destination);engine.clip.connect(silence).connect(engine.ctx.destination);
  api.mode('playtune');api.overlay.hide();
  const mode=api.shell.active;
  const result={...(await (await fetch('/__music_provenance')).json()),browser:navigator.userAgent,
    clock:'Production AudioContext and requestAnimationFrame; no clock acceleration',isolatedStorage:true,
    speakerOutputMuted:true,checks:[],audioState:engine.ctx.state};
  const originalPad=engine.pad.bind(engine),calls=[];
  engine.pad=(...args)=>{calls.push({notes:[...args[0]],at:args[3],written:args[5]===true});return originalPad(...args);};
  for(const role of ['melody','chords']) {
    mode.setRole(role);
    for(const count of [49,25]) {
      api.input.mapping.settings={baseNote:36,count,autoLatch:false};mode.remap();
      check(mode.start('fur-elise'),'Für Elise does not fit '+role+' '+count+' keys');
      const source=mode.role.chart(mode.tune), targets=mode.judge.targets;
      check(targets.every(n=>n.note>=36&&n.note<36+count),'Player target outside keyboard');
      check(targets.every(n=>source.some(s=>s.beat===n.beat&&s.len===n.len&&s.note+mode.shift===n.note)),'Unexpected player note transform');
      const backing=mode.role.backing(mode.tune);
      check(JSON.stringify(api.bed.notes)===JSON.stringify(backing.notes),'Automatic notes changed register or expression');
      result.checks.push({test:'register',role,keys:count,shiftSemitones:mode.shift,playerLow:Math.min(...targets.map(n=>n.note)),playerHigh:Math.max(...targets.map(n=>n.note)),automaticLow:Math.min(...backing.notes.map(n=>n.note)),automaticHigh:Math.max(...backing.notes.map(n=>n.note)),automaticAuthoredRegister:true});
      mode.stopRun();
    }
  }
  mode.setRole('melody');api.input.mapping.settings={baseNote:36,count:49,autoLatch:false};mode.remap();
  calls.length=0;check(mode.start('fur-elise'),'Cannot start live Für Elise');
  const started=engine.now;
  await waitFor(()=>engine.scheduledPianoCount>0&&mode.phase==='playing','first real automatic attack');
  check(engine.now>started+1,'Clock did not advance normally');
  check(calls.some(call=>call.written&&call.notes.includes(mode.tune.backingNotes[0].note)),'Authored automatic note was not scheduled');
  const pitch=mode.judge.targets[0].note;
  engine.pad([pitch],2,.03,engine.now+.025,.01,true);
  const autoVoice=[...engine.scheduledPianos].at(-1);
  api.noteOn(pitch,90);await delay(80);
  check(engine.voices.has(pitch),'Real debug input did not create player voice');
  check(engine.scheduledPianos.has(autoVoice),'Player attack replaced automatic same pitch');
  api.cc(64,127);api.noteOff(pitch);await delay(80);
  check(engine.sustained.has(pitch),'Pedal did not sustain the player');
  check(engine.scheduledPianos.has(autoVoice),'Player pedal/release cancelled automatic same pitch');
  api.cc(64,0);await delay(80);
  check(!engine.sustained.has(pitch)&&!engine.voices.has(pitch),'Player pedal release did not release player');
  check(engine.scheduledPianos.has(autoVoice),'Player pedal release affected automatic voice');
  result.checks.push({test:'same-pitch ownership',playerAttack:true,playerPedal:true,playerRelease:true,automaticIndependent:true});
  const oldGeneration=engine.padGen,oldSources=[...engine.scheduledPianos];
  check(mode.restart(),'Live restart failed');
  check(mode.phase==='countin'&&engine.padGen!==oldGeneration,'Restart did not create clean count-in/generation');
  check(oldSources.every(v=>!engine.scheduledPianos.has(v)),'Restart retained previous automatic ownership');
  await waitFor(()=>engine.scheduledPianoCount>0&&mode.phase==='playing','automatic notes after restart');
  mode.pause();await delay(200);
  check(!mode.transport.running&&!api.bed.running&&!engine.bedAudible,'Pause did not stop transport and mute automatic audio');
  check(engine.voices.size===0,'Pause retained player ownership');
  mode.resume();await waitFor(()=>mode.phase==='playing','resume count-in');
  mode.stopRun();await delay(250);
  check(!mode.transport.running&&!api.bed.running&&!engine.bedAudible&&engine.voices.size===0,'Stop retained transport or audible note ownership');
  result.checks.push({test:'restart/pause/resume/stop',restartHasFreshCountIn:true,automaticRestarts:true,stopMutesAutomatic:true,stopReleasesPlayer:true});
  mode.setRole('chords');calls.length=0;
  check(mode.start('hopscotch'),'Cannot start live Hopscotch');
  await waitFor(()=>mode.phase==='playing'&&calls.some(call=>call.written)&&mode.drums.track,'Hopscotch automatic notes and drums');
  const hopscotchGeneration=engine.padGen,initialDrumTrack=mode.drums.track;
  const rhythmSwitch=document.querySelector('#pt-live-rhythm');
  check(rhythmSwitch&&!rhythmSwitch.hidden&&rhythmSwitch.getAttribute('aria-checked')==='true','Active rhythm switch is not visible and on');
  const toggleJudge=mode.judge,toggleEndsAt=mode.endsAt,toggleZero=mode.transport.timeOf(0);
  const togglePitch=mode.judge.targets[0].note;
  api.noteOn(togglePitch,90);await delay(50);
  const togglePlayerVoice=engine.voices.get(togglePitch);
  check(togglePlayerVoice,'Toggle check did not create a player voice');
  rhythmSwitch.click();await delay(100);
  check(rhythmSwitch.getAttribute('aria-checked')==='false'&&rhythmSwitch.textContent.includes('Off'),'HUD switch did not show rhythm off');
  check(!mode.drums.track&&engine.drumTracks.size===0,'Rhythm off retained drum sources or room');
  check(engine.bedAudible&&api.bed.running&&engine.padGen===hopscotchGeneration,'Rhythm off interrupted automatic notes');
  check(engine.voices.get(togglePitch)===togglePlayerVoice,'Rhythm off interrupted the player note');
  check(mode.judge===toggleJudge&&mode.endsAt===toggleEndsAt&&mode.transport.timeOf(0)===toggleZero,'Rhythm off changed the chart or ending clock');
  rhythmSwitch.click();
  check(rhythmSwitch.getAttribute('aria-checked')==='true'&&rhythmSwitch.textContent.includes('On'),'HUD switch did not show rhythm on');
  await waitFor(()=>mode.drums.track,'Re-enabled rhythm on the existing clock');
  check(mode.drums.track!==initialDrumTrack,'Rhythm on reused the cancelled drum room');
  check(mode.judge===toggleJudge&&mode.endsAt===toggleEndsAt&&mode.transport.timeOf(0)===toggleZero,'Rhythm on restarted the note chart or changed its tail');
  api.noteOff(togglePitch);
  result.checks.push({test:'active HUD rhythm toggle',accessibleSwitchStateUpdates:true,drumsAndRoomCancelled:true,playerAndAutomaticNotesContinue:true,chartAndEndingClockUnchanged:true,newDrumRouteOnEnable:true});
  const hopscotchDrumTrack=mode.drums.track;
  check(engine.bedVoice==='bed-electric-piano','Hopscotch did not select its automatic electric piano');
  mode.pause();await delay(200);
  check(!engine.bedAudible&&!api.bed.running&&!mode.drums.track&&engine.drumTracks.size===0,'Hopscotch pause retained notes or drum room');
  mode.resume();
  check(engine.padGen!==hopscotchGeneration&&mode.phase==='countin','Hopscotch resume reused the prior accompaniment generation');
  await waitFor(()=>mode.drums.track,'Hopscotch fresh drum route');
  check(mode.drums.track!==hopscotchDrumTrack,'Hopscotch resumed the prior drum route');
  mode.stopRun();
  result.checks.push({test:'Hopscotch notes/drums stop/restart',role:'chords',automaticVoice:'bed-electric-piano',pauseMutesNotesAndDrumRooms:true,resumeUsesFreshGenerations:true});
  mode.setRole('melody');
  await save(label+'_browser-smoke-progress.json',JSON.stringify({...result,pending:'natural song completion'},null,2)+'\n','application/json');
  // Let a complete short excerpt finish on the unmodified real clock.
  check(mode.start('first-light'),'Cannot start ending smoke');
  const logicalEnd=mode.transport.timeOf(Math.max(...mode.tune.melody.map(n=>n.beat+n.len),...mode.tune.backingNotes.map(n=>n.beat+n.len),...mode.tune.chords.map(n=>n.beat+n.len)));
  const audibleEnd=mode.transport.timeOf(Math.max(...mode.tune.backingNotes.map(n=>n.beat+(n.soundingLen??n.len))));
  const expectedFinish=mode.endsAt;
  await waitFor(()=>mode.phase==='finished','natural song completion',(expectedFinish-engine.now+5)*1000);
  check(engine.now>=expectedFinish&&expectedFinish>=audibleEnd,'Completion cut automatic sounding duration');
  check(!mode.transport.running&&!api.bed.running,'Completed song kept scheduling');
  result.checks.push({test:'natural ending',id:'first-light',logicalEnd,audibleEnd,expectedFinish,observedFinish:engine.now,formRestSeconds:expectedFinish-logicalEnd,resultsScreen:api.overlay.screen,stingScheduled:mode.sting!==null});
  result.pass=true;result.finishedAt=new Date().toISOString();result.audioQuality=engine.lite?'lite':'full';
  await save(label+'_browser-smoke.json',JSON.stringify(result,null,2)+'\n','application/json');
  return result;
}

if(location.pathname==='/__music_review') {
  const options=JSON.parse(new URL(location.href).searchParams.get('options')??'{}');
  if(options.autorun)run(options).then(result=>fetch('/__music_done',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ok:result.entries.every(e=>e.renderChecksPass),count:result.entries.length,failed:result.entries.filter(e=>!e.renderChecksPass).map(e=>e.role+':'+e.id)})}))
    .catch(error=>fetch('/__music_done',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ok:false,error:error.stack??String(error)})}));
}
