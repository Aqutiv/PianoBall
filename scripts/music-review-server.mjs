#!/usr/bin/env node
/** Local-only production-engine audio review; generated outputs remain ignored. */
import { createServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'.shots','musicality');
const args=new Map(process.argv.slice(2).map(arg=>{const [key,...rest]=arg.replace(/^--/,'').split('=');return [key,rest.join('=')||true];}));
const port=Number(args.get('port')??5174);
const options={label:args.get('label')??'current',sampleRate:Number(args.get('sample-rate')??48000),autorun:args.has('run'),verifyRepeat:args.has('verify-repeat'),smoke:args.has('smoke')};
if(args.has('ids'))options.ids=String(args.get('ids')).split(',');
if(args.has('roles'))options.roles=String(args.get('roles')).split(',');
if(!['current','baseline','post-merge'].includes(options.label)||![24000,44100,48000].includes(options.sampleRate))throw Error('Expected label=current|baseline|post-merge and sample-rate=24000|44100|48000');
await mkdir(output,{recursive:true});
const vite=await createViteServer({root,server:{middlewareMode:true,host:'127.0.0.1',watch:{ignored:['**/.shots/**']},hmr:false,ws:false},appType:'custom'});
let done;
const completion=new Promise(resolve=>{done=resolve;});
async function body(req){const chunks=[];let count=0;for await(const chunk of req){count+=chunk.length;if(count>128*1024*1024)throw Error('Review output exceeds 128 MiB');chunks.push(chunk);}return Buffer.concat(chunks);}
async function provenance() {
  const files=(await readdir(path.join(root,'src'),{recursive:true})).filter(name=>name.endsWith('.ts')).sort();
  const digest=createHash('sha256');
  for(const file of files){digest.update(file.replaceAll('\\','/')+'\0');digest.update(await readFile(path.join(root,'src',file)));}
  const adapter=createHash('sha256');
  for(const file of ['scripts/render-music.mjs','scripts/music-review-server.mjs']){adapter.update(file+'\0');adapter.update(await readFile(path.join(root,file)));}
  let commit=null;try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();}catch{}
  return {commit,sourceDigest:digest.digest('hex'),sourceFiles:files.length,rendererDigest:adapter.digest('hex'),rendererDigestBasis:'captured from the executing adapter files',capturedAt:new Date().toISOString()};
}
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:'+port);
  try {
    if(url.pathname==='/__music_review') {res.setHeader('content-type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>PianoBall audio review</title><h1>Production audio review</h1><p id="status">Ready</p><script type="module">import("/scripts/render-music.mjs").then(m=>window.musicReview=m).catch(error=>fetch("/__music_done",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ok:false,error:String(error)})}))</script>');return;}
    if(url.pathname==='/__music_app'){
      const html=(await readFile(path.join(root,'index.html'),'utf8')).replace('</body>','<script type="module">import {smoke} from "/scripts/render-music.mjs";smoke('+JSON.stringify(options)+').then(result=>fetch("/__music_done",{method:"POST",body:JSON.stringify({ok:true,smoke:result})})).catch(error=>fetch("/__music_done",{method:"POST",body:JSON.stringify({ok:false,error:error.stack??String(error)})}));</script></body>');
      res.setHeader('content-type','text/html');res.end(await vite.transformIndexHtml('/__music_app',html));return;
    }
    if(url.pathname==='/__music_provenance'){res.setHeader('content-type','application/json');res.end(JSON.stringify(await provenance()));return;}
    if(url.pathname==='/__music_manifest'){
      const label=url.searchParams.get('label');if(!['current','baseline','post-merge'].includes(label))throw Error('Invalid manifest label');
      let prior=null;try{prior=JSON.parse(await readFile(path.join(output,label+'_render-metrics.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
      res.setHeader('content-type','application/json');res.end(JSON.stringify(prior));return;
    }
    if(url.pathname==='/__music_baseline'){res.setHeader('content-type','application/json');res.end(await readFile(path.join(output,'baseline.json')));return;}
    if(url.pathname==='/__music_compare'){
      const names=['first','second'].map(key=>url.searchParams.get(key));
      if(names.some(name=>!/^[a-z0-9_-]+\.wav$/.test(name??'')))throw Error('Invalid comparison filename');
      const [a,b]=await Promise.all(names.map(name=>readFile(path.join(output,name))));
      if(a.length!==b.length||!a.subarray(0,44).equals(b.subarray(0,44)))throw Error('Repeat render format or frame count differs');
      let maximumPcmDifference=0,differentSamples=0,square=0,signalSquare=0;
      for(let at=44;at<a.length;at+=2){const sample=a.readInt16LE(at),difference=sample-b.readInt16LE(at);maximumPcmDifference=Math.max(maximumPcmDifference,Math.abs(difference));differentSamples+=Number(difference!==0);square+=difference*difference;signalSquare+=sample*sample;}
      const value={maximumPcmDifference,differentSamples,totalSamples:(a.length-44)/2,differenceRelativeDb:10*Math.log10(Math.max(square/Math.max(signalSquare,1),1e-18)),withinTolerance:maximumPcmDifference<=1,tolerancePcm16Units:1};
      res.setHeader('content-type','application/json');res.end(JSON.stringify(value));return;
    }
    if(url.pathname==='/__music_save'&&req.method==='POST'){
      const name=url.searchParams.get('name');if(!/^[a-z0-9_-]+\.(wav|json)$/.test(name??''))throw Error('Invalid output filename');
      const bytes=await body(req),file=path.join(output,name);await writeFile(file,bytes);
      res.setHeader('content-type','application/json');res.end(JSON.stringify({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}));return;
    }
    if(url.pathname==='/__music_progress'&&req.method==='POST'){
      const event=JSON.parse(await body(req));console.log(JSON.stringify({role:event.role,id:event.id,stem:event.stem,peakDbFS:+event.peakDbFS.toFixed(2),endingRmsDbFS:+event.endingRmsDbFS.toFixed(2),bytes:event.bytes}));res.end('ok');return;
    }
    if(url.pathname==='/__music_done'&&req.method==='POST'){const result=JSON.parse(await body(req));res.end('ok');done(result);return;}
    vite.middlewares(req,res,()=>{res.statusCode=404;res.end('Not found');});
  }catch(error){res.statusCode=500;res.end(String(error));}
});
await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+port+(options.smoke?'/__music_app':'/__music_review')+'?options='+encodeURIComponent(JSON.stringify(options));
console.log('Audio review: '+url);
if(options.autorun){
  const chrome=process.env.CHROME_PATH??[
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome','/usr/bin/chromium',
  ].find(existsSync);
  if(!chrome)throw Error('Set CHROME_PATH to a Chromium browser executable');
  const child=spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
    '--autoplay-policy=no-user-gesture-required','--user-data-dir='+path.join(output,'chrome-render-profile-'+process.pid),url],{windowsHide:true,stdio:'ignore'});
  child.on('error',error=>done({ok:false,error:String(error)}));
  child.on('exit',code=>done({ok:false,error:'Chrome exited before review completion: '+code}));
  const result=await completion;
  console.log(JSON.stringify(result));
  child.kill();await vite.close();await new Promise(resolve=>server.close(resolve));
  process.exitCode=result.ok?0:1;
}
