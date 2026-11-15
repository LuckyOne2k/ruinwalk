/* Phase 3f – Tab-Sperre pro Cloud-Charakter und Gerätekopien. */
const fake=require('../fake_supabase');
const PW='Gut#Pass1',C1='c0000000-0000-4000-8000-0000000000f1';
const tap=(a,d)=>`(()=>{const b=document.createElement('button');b.dataset.a=${JSON.stringify(a)};Object.assign(b.dataset,${JSON.stringify(d||{})});document.body.appendChild(b);b.click();b.remove();})()`;
const ready=p=>p.waitForFunction(()=>window.__RW&&window.__RW.S);
const nav=(p,fn)=>Promise.all([p.waitForNavigation(),p.evaluate(fn)]).then(()=>ready(p));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(f,what,ms=15000)=>{const t=Date.now();let v;while(Date.now()-t<ms){v=await f();if(v)return v;await sleep(100);}throw new Error('Zeit überschritten: '+what);};
const lock=p=>p.evaluate(()=>{const e=document.querySelector('#lockov');return e&&getComputedStyle(e).display!=='none'?e.innerText:null;});
const acct=p=>p.evaluate(()=>{const e=document.querySelector('#acct');return e.style.display==='none'?'':e.innerText;});
const T0={MIN:1500,FAST:300,GAP:400,BOOT:0,BACK0:700,BACKMAX:2500};
const fs=require('fs'),path=require('path');
const second=async(p,st)=>{const p2=await p.context().newPage();p2.errors=[];
  await p2.route('**/unpkg.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
  await p2.route('**/unpkg.com/leaflet@1.9.4/dist/leaflet.js',r=>r.fulfill({body:fs.readFileSync(path.join(__dirname,'..','leaflet-stub.js'),'utf8'),contentType:'application/javascript'}));
  await p2.route(/openstreetmap|overpass/,r=>r.abort());
  if(st)await st.install(p2);else await p2.route(/\.supabase\.co/,r=>r.abort());
  await p2.addInitScript(x=>{window.__RW_TEST=true;window.__RW_SYT=x;},T0);await p2.goto(p.url());await ready(p2);return p2;};
const mk=async(T)=>{
  const st=fake(),u=st.addUser('anna@test.de',PW,'Anna_1');
  const cs={id:C1,account:u.id,slot:1,name:'Wolke',data:{lv:9,cls:'jaeger',name:'Wolke',inv:{holz:1},stats:{kills:1,walk:0},tools:[],cid:'x'},cls:'jaeger',level:9,version:3};st.chars.push(cs);
  const p=await T.page({lv:7,cls:'krieger',inv:{holz:3},name:'Held'},undefined,undefined,pg=>st.install(pg));
  await p.addInitScript(x=>{window.__RW_SYT=x;},T0);
  await p.evaluate(tap('acct'));await p.waitForSelector('#ac_email');await p.fill('#ac_email','anna@test.de');await p.fill('#ac_pw',PW);await p.evaluate(tap('aclog'));
  await p.waitForFunction(()=>document.querySelector('#acct').innerText.includes('Cloud-Charakterplätze')&&!document.querySelector('#acct').innerText.includes('Lade Cloud'));
  await nav(p,tap('accplay',{id:C1}));
  return {p,st,cs};};
module.exports={
 'Zweiter Tab mit demselben Cloud-Charakter startet gesperrt und sendet nichts':async(T,eq)=>{
  const {p,st,cs}=await mk(T);await sleep(300);eq(await lock(p),null,'erster Tab frei');
  const p2=await second(p,st);
  await until(async()=>(await lock(p2)||'').includes('anderen Fenster'),'zweiter Tab gesperrt');
  const n=st.saves.length;await p2.evaluate(()=>{__RW.S.inv.holz=55;});await sleep(2500);
  eq(st.saves.length,n,'zweiter Tab sendet nichts');eq(cs.data.inv.holz,1);
  eq(await p2.evaluate(()=>JSON.parse(localStorage.getItem('ruinwalk_cc_'+__RW.ACTIVE.id)).inv.holz),1,'zweiter Tab überschreibt Cache nicht');
  await p.context().close();},
 'Übernehmen: zweiter Tab spielt, der erste wird angehalten':async(T,eq)=>{
  const {p,st,cs}=await mk(T);
  const p2=await second(p,st);
  await until(async()=>(await lock(p2)||'').includes('anderen Fenster'),'gesperrt');
  await Promise.all([p2.waitForNavigation(),p2.evaluate(tap('tltake'))]);await ready(p2);
  eq(await lock(p2),null,'zweiter Tab frei');
  await until(async()=>(await lock(p)||'').includes('anderen Fenster'),'erster Tab angehalten',20000);
  await p.context().close();},
 'Normales Neuladen im selben Tab bleibt frei (Lebenszeichen wird beim Verlassen entfernt)':async(T,eq)=>{
  const {p}=await mk(T);await nav(p,'location.reload()');await sleep(500);eq(await lock(p),null);await p.context().close();},
 'Lokale Charaktere werden nie gesperrt':async(T,eq)=>{
  const p=await T.page({lv:7,cls:'krieger',inv:{holz:3},name:'Held'});
  const p2=await second(p);await sleep(800);eq(await lock(p2),null);await p.context().close();},
 'Gerätekopien: Anzeige, zweistufiges Löschen, aktive Daten bleiben':async(T,eq)=>{
  const {p}=await mk(T);
  await p.evaluate(()=>{localStorage.setItem('ruinwalk_cc_c0000000-0000-4000-8000-0000000000f1_srvcopy_123','{"lv":2}');localStorage.setItem('ruinwalk_cc_c0000000-0000-4000-8000-0000000000f1_replaced_456','{"lv":3}');});
  await p.evaluate(tap('acct'));await until(async()=>(await acct(p)).includes('Gerätekopien'),'Anzeige');
  await p.evaluate(tap('accopyclr'));await until(async()=>(await acct(p)).includes('Wirklich alle'),'Rückfrage');
  eq(await p.evaluate(()=>Object.keys(localStorage).filter(k=>/_(srvcopy|replaced)_/.test(k)).length),2,'noch nichts gelöscht');
  await p.evaluate(tap('accopyno'));eq((await acct(p)).includes('Wirklich alle'),false);
  await p.evaluate(tap('accopyclr'));await p.evaluate(tap('accopyclr'));await until(async()=>(await acct(p)).includes('2 Gerätekopien gelöscht'),'gelöscht');
  eq(await p.evaluate(()=>Object.keys(localStorage).filter(k=>/_(srvcopy|replaced)_/.test(k)).length),0);
  eq(await p.evaluate(()=>!!localStorage.getItem('ruinwalk_cc_c0000000-0000-4000-8000-0000000000f1')),true,'aktiver Cache bleibt');await p.context().close();},
};
