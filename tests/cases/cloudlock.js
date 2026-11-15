/* Phase 3e – Platz 3 und Sperrzustand: Verschieben gesperrter Charaktere, Prüfung beim Start (nur online), Sperre mitten im Spiel. */
const fake=require('../fake_supabase');
const PW='Gut#Pass1',S3='c0000000-0000-4000-8000-0000000000e3',S1='c0000000-0000-4000-8000-0000000000e1';
const tap=(a,d)=>`(()=>{const b=document.createElement('button');b.dataset.a=${JSON.stringify(a)};Object.assign(b.dataset,${JSON.stringify(d||{})});document.body.appendChild(b);b.click();b.remove();})()`;
const ready=p=>p.waitForFunction(()=>window.__RW&&window.__RW.S);
const nav=(p,fn)=>Promise.all([p.waitForNavigation(),p.evaluate(fn)]).then(()=>ready(p));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(f,what,ms=15000)=>{const t=Date.now();let v;while(Date.now()-t<ms){v=await f();if(v)return v;await sleep(100);}throw new Error('Zeit überschritten: '+what);};
const srvData=(lv,o)=>Object.assign({lv,cls:'jaeger',name:'Wolke',inv:{holz:lv},stats:{kills:lv,walk:0},tools:[],cid:'egal'},o);
const add=(st,u,id,slot,lv,o)=>{const c=Object.assign({id,account:u.id,slot,name:'Wolke'+slot,data:srvData(lv),cls:'jaeger',level:lv,version:3},o);st.chars.push(c);return c;};
const T0={MIN:1500,FAST:300,GAP:400,BOOT:0,BACK0:700,BACKMAX:2500};
const acct=p=>p.evaluate(()=>{const e=document.querySelector('#acct');return e.style.display==='none'?'':e.innerText;});
const lock=p=>p.evaluate(()=>{const e=document.querySelector('#lockov');return e&&getComputedStyle(e).display!=='none'?e.innerText:null;});
const meta=(p,id)=>p.evaluate(id=>JSON.parse(localStorage.getItem('ruinwalk_cm_'+id)),id);
const mkc=async(T,setup,t)=>{
  const st=fake(),u=st.addUser('anna@test.de',PW,'Anna_1'),cs=setup(st,u);
  const p=await T.page({lv:7,cls:'krieger',inv:{holz:3},name:'Held'},undefined,undefined,pg=>st.install(pg));
  await p.addInitScript(x=>{window.__RW_SYT=x;},Object.assign({},T0,t));
  await p.evaluate(tap('acct'));await p.waitForSelector('#ac_email');await p.fill('#ac_email','anna@test.de');await p.fill('#ac_pw',PW);await p.evaluate(tap('aclog'));
  await p.waitForFunction(()=>document.querySelector('#acct').innerText.includes('Cloud-Charakterplätze')&&!document.querySelector('#acct').innerText.includes('Lade Cloud'));
  await p.evaluate(()=>__RW.save());
  return {p,st,u,cs};};

module.exports={
 'Gesperrter Platz-3-Charakter lässt sich auf einen freien Platz 1/2 verschieben und danach spielen':async(T,eq)=>{
  const {p,st,cs}=await mkc(T,(s,u)=>add(s,u,S3,3,20,{locked:true}));
  const t=await acct(p);eq(t.includes('Gesperrt'),true);
  eq(await p.evaluate(()=>[...document.querySelectorAll('#acct [data-a="acmove"]')].map(b=>b.dataset.to)),['1','2']);
  eq(await p.evaluate(()=>!!document.querySelector('#acct [data-a="accplay"]')),false,'gesperrt: kein Spielen');
  await p.evaluate(tap('acmove',{id:S3,to:'1'}));await until(async()=>(await acct(p)).includes('Verschoben auf Platz 1'),'verschoben');
  eq([cs.slot,cs.version,cs.locked],[1,4,false]);eq(cs.data.lv,20,'Daten unverändert');eq(st.moves.length,1);
  await nav(p,tap('accplay',{id:S3}));eq(await p.evaluate(()=>[__RW.ACTIVE.type,__RW.S.lv]),['cloud',20]);eq(p.errors,[]);await p.context().close();},
 'Verschieben bietet nur freie Plätze an; sind beide belegt, gibt es keinen Knopf':async(T,eq)=>{
  const a=await mkc(T,(s,u)=>{add(s,u,S1,1,5);return add(s,u,S3,3,20,{locked:true});});
  eq(await a.p.evaluate(()=>[...document.querySelectorAll('#acct [data-a="acmove"]')].map(b=>b.dataset.to)),['2']);await a.p.context().close();
  const b=await mkc(T,(s,u)=>{add(s,u,S1,1,5);add(s,u,'c0000000-0000-4000-8000-0000000000e2',2,6);return add(s,u,S3,3,20,{locked:true});});
  eq(await b.p.evaluate(()=>document.querySelectorAll('#acct [data-a="acmove"]').length),0);await b.p.context().close();},
 'Verschieben: Platz inzwischen belegt oder offline → nichts verändert, verständliche Meldung':async(T,eq)=>{
  const {p,st,u,cs}=await mkc(T,(s,u)=>add(s,u,S3,3,20,{locked:true}));
  add(st,u,S1,1,5);   // zwischenzeitlich belegt (Liste im Dialog ist noch alt)
  await p.evaluate(tap('acmove',{id:S3,to:'1'}));await until(async()=>(await acct(p)).includes('inzwischen belegt'),'belegt');eq([cs.slot,cs.version],[3,3]);
  st.offline=true;await p.evaluate(tap('acmove',{id:S3,to:'2'}));await until(async()=>(await acct(p)).includes('Keine Verbindung'),'offline');eq([cs.slot,cs.version],[3,3]);await p.context().close();},
 'Verschieben mit vorhandenem Zwischenspeicher: Platz/Version werden nachgeführt, danach kein falscher Konflikt, Fortschritt bleibt':async(T,eq)=>{
  const {p,st,cs}=await mkc(T,(s,u)=>add(s,u,S3,3,20));
  await nav(p,tap('accplay',{id:S3}));await p.evaluate(()=>{__RW.S.inv.holz=99;});
  await until(()=>cs.data.inv.holz===99&&cs.version===4,'hochgeladen');
  cs.locked=true;await nav(p,'localStorage.setItem("ruinwalk_slot","1"),location.reload()');
  await p.evaluate(tap('acct'));await p.waitForFunction(()=>document.querySelector('#acct [data-a="acmove"]'));
  await p.evaluate(tap('acmove',{id:S3,to:'1'}));await until(async()=>(await acct(p)).includes('Verschoben'),'verschoben');
  const m=await meta(p,S3);eq([m.slot,m.baseVersion],[1,5]);
  await nav(p,tap('accplay',{id:S3}));eq(await p.evaluate(()=>[__RW.ACTIVE.type,__RW.S.inv.holz]),['cloud',99]);
  eq(await lock(p),null,'kein Sperrfenster nach dem Verschieben');await p.context().close();},
 'Platz-3-Charakter nach Neuladen: Spiel erst nach Serverprüfung freigegeben (online → Fenster verschwindet)':async(T,eq)=>{
  const {p,st}=await mkc(T,(s,u)=>add(s,u,S3,3,20));
  await nav(p,tap('accplay',{id:S3}));
  await nav(p,'location.reload()');
  await until(async()=>(await p.evaluate(()=>getComputedStyle(document.querySelector('#lockov')).display))==='none'&&st.calls.some(c=>c.path.endsWith('/list_characters')),'Prüfung ok');
  eq(await lock(p),null);await p.context().close();},
 'Platz 3 offline: Spiel bleibt gesperrt („nur online“), anderer Charakter wählbar, nach Rückkehr der Verbindung wieder freigegeben':async(T,eq)=>{
  const {p,st}=await mkc(T,(s,u)=>add(s,u,S3,3,20));
  await nav(p,tap('accplay',{id:S3}));st.offline=true;await nav(p,'location.reload()');
  await until(async()=>(await lock(p)||'').includes('nur online spielbar'),'nur online');
  await p.evaluate(tap('chars'));eq(await p.evaluate(()=>getComputedStyle(document.querySelector('#chars')).display),'flex','Charakterauswahl erreichbar');
  await p.evaluate(()=>{document.querySelector('#chars').style.display='none';});
  st.offline=false;await p.evaluate(tap('lkretry'));await until(async()=>(await lock(p))===null,'freigegeben');await p.context().close();},
 'Platz 3 serverseitig gesperrt beim Start: „gesperrt“-Fenster, nichts wird gesendet oder geändert':async(T,eq)=>{
  const {p,st,cs}=await mkc(T,(s,u)=>add(s,u,S3,3,20));
  await nav(p,tap('accplay',{id:S3}));cs.locked=true;const n0=st.saves.length;await nav(p,'location.reload()');
  await until(async()=>(await lock(p)||'').includes('gesperrt'),'gesperrt');
  const t=await lock(p);eq(t.includes('verschieben'),true);eq(st.saves.length,n0);eq(cs.data.lv,20);await p.context().close();},
 'Platz 3 wird mitten im Spiel gesperrt: Fenster sofort, Fortschritt bleibt lokal gesichert, Server unverändert':async(T,eq)=>{
  const {p,st,cs}=await mkc(T,(s,u)=>add(s,u,S3,3,20));
  await nav(p,tap('accplay',{id:S3}));await until(async()=>(await lock(p))===null,'Start frei');
  cs.locked=true;await p.evaluate(()=>{__RW.S.inv.holz=77;});
  await until(async()=>(await lock(p)||'').includes('gesperrt'),'Sperre erkannt');
  eq(cs.data.inv.holz,20);eq(await p.evaluate(()=>{__RW.save();return JSON.parse(localStorage.getItem('ruinwalk_cc_c0000000-0000-4000-8000-0000000000e3')).inv.holz;}),77);
  eq((await meta(p,S3)).dirty,true);await p.context().close();},
 'Plätze 1/2 werden nie durch das Platz-3-Fenster blockiert':async(T,eq)=>{
  const {p,st}=await mkc(T,(s,u)=>add(s,u,S1,1,12));
  await nav(p,tap('accplay',{id:S1}));await sleep(1500);eq(await lock(p),null);
  await p.evaluate(()=>{__RW.S.inv.holz=5;});await sleep(2500);eq(await lock(p),null);await p.context().close();},
};
