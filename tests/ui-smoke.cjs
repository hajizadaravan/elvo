const fs=require('node:fs'); const path=require('node:path');const assert=require('node:assert/strict');const {pathToFileURL}=require('node:url');
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const {indexedDB}=require('fake-indexeddb');
const root=path.resolve(__dirname,'..');
class LocalLoader extends ResourceLoader{fetch(url){const u=new URL(url);if(u.origin!=='http://localhost:8000')return null;if(u.pathname==='/vendor/tf.min.js')return Promise.resolve(Buffer.from('/* Node TF CPU supplied by integration harness */'));return Promise.resolve(fs.readFileSync(path.join(root,u.pathname)));}}
const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://localhost:8000/?nocam',runScripts:'dangerously',resources:new LocalLoader(),pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window; w.HTMLCanvasElement.prototype.getContext=()=>({});
for(const name of ['window','document','localStorage','location','HTMLElement','Event','HTMLInputElement','getComputedStyle'])globalThis[name]=typeof w[name]==='function'&&name==='getComputedStyle'?w[name].bind(w):w[name];
globalThis.indexedDB=indexedDB;w.indexedDB=indexedDB;globalThis.tf=require('./load-tf.cjs')();tf.env().set('IS_BROWSER',true);globalThis.requestAnimationFrame=w.requestAnimationFrame.bind(w);globalThis.Charts=undefined;
const nativeFetch=globalThis.fetch;
const speechCalls=[];let failSpeech=false;
globalThis.fetch=async(url,options)=>{
 if(url==='/api/speech/status') return new Response(JSON.stringify({provider:'azure',configured:true,cached:speechCalls.length}),{headers:{'Content-Type':'application/json'}});
 if(url==='/api/speech/synthesize'){
  if(failSpeech) return new Response(JSON.stringify({error:'Azure açarı və regionu yoxlayın.'}),{status:502,headers:{'Content-Type':'application/json'}});
  speechCalls.push(JSON.parse(options.body));return new Response(new Blob(['mock-audio']),{headers:{'Content-Type':'audio/mpeg'}});
 }
 return nativeFetch(url,options);
};
globalThis.Audio=class{play(){queueMicrotask(()=>this.onended?.());return Promise.resolve()}pause(){}};
const downloads=[]; w.HTMLAnchorElement.prototype.click=function(){downloads.push({href:this.href,name:this.download})};
async function wait(fn,timeout=30000){const until=Date.now()+timeout;while(!fn()){if(Date.now()>until)throw Error('Integration wait timed out');await new Promise(r=>setTimeout(r,30));}}
(async()=>{
 await new Promise(r=>w.addEventListener('load',r));globalThis.Charts=w.Charts;
 await tf.setBackend('cpu');await import(pathToFileURL(root+'/js/main.js'));
 await wait(()=>!document.querySelector('#trainBtn').disabled);
 const $=s=>document.querySelector(s);
 for(const view of ['record','model','words','live']){$(`[data-go="${view}"]`).click();assert.equal($(`[data-view="${view}"]`).hidden,false)}
 $('#replyInput').value='Yazılı cavab işləyir.';$('#replyForm').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal($('#reply').textContent,'Yazılı cavab işləyir.');
 $('[data-reply]').click();assert.equal($('#reply').textContent,'Zəhmət olmasa, gözləyin.');
 $('[data-go="words"]').click();
 assert.equal($('#voiceSel').options.length,2);
 await $('#voiceTest').onclick();assert.equal(speechCalls.at(-1).voice,'az-AZ-BanuNeural');
 $('#voiceSel').value='az-AZ-BabekNeural';$('#voiceSel').dispatchEvent(new w.Event('change'));
 await $('#voiceTest').onclick();assert.equal(speechCalls.at(-1).voice,'az-AZ-BabekNeural');
 const beforeWarm=speechCalls.length;await $('#speechPrepare').onclick();assert.ok(speechCalls.length>beforeWarm);
 assert.ok(speechCalls.slice(beforeWarm).every(c=>c.voice==='az-AZ-BabekNeural'));
 assert.equal($('#speechPrepare').disabled,false);
 failSpeech=true;await $('#voiceTest').onclick();assert.match($('#azureStatus').textContent,/Azure açarı/);failSpeech=false;
 const v=await import(pathToFileURL(root+'/js/vocab.js'));
 const fixture={format:'dilmanc-dataset',version:1,vocab:{signs:v.DEFAULT_SIGNS,rules:v.DEFAULT_RULES},samples:['a','b'].flatMap((signer,si)=>['salam','_fon'].flatMap((sign,ci)=>Array.from({length:5},(_,i)=>({id:`qa-${si}-${ci}-${i}`,sign,signer,data:Array(4020).fill(ci*.1),at:new Date().toISOString()}))))};
 const input=$('#importInput');Object.defineProperty(input,'files',{value:[{text:async()=>JSON.stringify(fixture)}],configurable:true});await input.onchange({target:input});assert.equal(w.dilmanc.S.samples.length,20);
 $('[data-go="model"]').click();$('#holdout').value='a';$('#epochs').appendChild(new w.Option('1','1'));$('#epochs').value='1';await $('#trainBtn').onclick();assert.ok(w.dilmanc.S.model);assert.equal(w.dilmanc.S.meta.tested,10);assert.equal($('#confusion details')!==null,true);
 $('[data-go="words"]').click();await $('#modelDlBtn').onclick();assert.equal(downloads.at(-1).name,'dilmanc-hazir-model.json');const text=await(await fetch(downloads.at(-1).href)).text();
 const old=w.dilmanc.S.model;const modelInput=$('#modelImportInput');Object.defineProperty(modelInput,'files',{value:[{text:async()=>text}],configurable:true});await modelInput.onchange({target:modelInput});assert.notEqual(w.dilmanc.S.model,old);
 $('#language').value='en';$('#language').dispatchEvent(new w.Event('change'));assert.equal($('#speechPrepare').textContent,'Prepare demo voices');assert.equal($('#modelDlBtn').textContent,'Export trained model');assert.equal($('#reply').textContent,'Zəhmət olmasa, gözləyin.');
 $('#language').value='az';$('#language').dispatchEvent(new w.Event('change'));
 const corrected={...fixture,samples:fixture.samples.map((s)=>({...s,signer:s.signer==='a'?'corrected':s.signer}))};Object.defineProperty(input,'files',{value:[{text:async()=>JSON.stringify(corrected)}],configurable:true});await input.onchange({target:input});assert.equal(w.dilmanc.S.samples.length,20);assert.equal(w.dilmanc.S.samples.find((s)=>s.id==='qa-0-0-0').signer,'corrected');const store=await import(pathToFileURL(root+'/js/store.js'));assert.equal((await store.allSamples()).find((s)=>s.id==='qa-0-0-0').signer,'corrected');
 const M=await import(pathToFileURL(root+'/js/model.js'));const loaded=await M.loadModel();assert.ok(loaded?.model);assert.deepEqual(loaded.meta.classes,['salam','_fon']);loaded.model.dispose();
 const before=w.dilmanc.S.samples.length;Object.defineProperty(input,'files',{value:[{text:async()=>JSON.stringify({...fixture,samples:[{...fixture.samples[0],data:[1]}]})}],configurable:true});await input.onchange({target:input});assert.equal(w.dilmanc.S.samples.length,before);assert.match($('#toast').textContent,/İdxal alınmadı/);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({domIntegration:'passed',azureVoicesAndPlayback:true,demoVoicePreparation:true,azureErrorShown:true,views:4,typedAndQuickReply:true,datasetImport:20,signerHoldoutUITraining:true,confusionMatrix:true,modelBundleDownloadImportAndIndexedDBReload:true,malformedDatasetNoMutation:true,domErrors:errors},null,2));
 w.dilmanc.S.model.dispose();dom.window.close();
})().catch(e=>{console.error(e);process.exit(1)});
