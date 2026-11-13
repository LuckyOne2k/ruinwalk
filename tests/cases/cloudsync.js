/* Phase 3c – Cloud-Speichern: Änderungserkennung, Drosselung, Versionsprüfung, Wiederholung, Offline, Konflikt (ohne Überschreiben), Statusanzeige.
   Läuft gegen die Attrappe tests/fake_supabase.js; Zeiten werden über window.__RW_SYT verkürzt. */
const fake=require('../fake_supabase');
const PW='Gut#Pass1',SID='c0000000-0000-4000-8000-0000000000b1',SID2='c0000000-0000-4000-8000-0000000000b2';
const tap=(a,d)=>`(()=>{const b=document.createElement('button');b.dataset.a=${JSON.stringify(a)};Object.assign(b.dataset,${JSON.stringify(d||{})});document.body.appendChild(b);b.click();b.remove();})()`;
const ready=p=>p.waitForFunction(()=>window.__RW&&window.__RW.S);
const nav=(p,fn)=>Promise.all([p.waitForNavigation(),p.evaluate(fn)]).then(()=>ready(p));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(f,what,ms=15000)=>{const t=Date.now();let v;while(Date.now()-t<ms){v=await f();if(v)return v;await sleep(100);}throw new Error('Zeit überschritten: '+what+(until.dbg?' | '+JSON.stringify(await until.dbg()):''));};
const srvData=(lv,o)=>Object.assign({lv,cls:'jaeger',name:'Wolke',inv:{holz:lv},stats:{kills:lv,walk:0},tools:[],cid:'egal'},o);
const srvChar=(st,u,id,slot,lv)=>{const c={id,account:u.id,slot,name:'Wolke',data:srvData(lv),cls:'jaeger',level:lv,version:3};st.chars.push(c);return c;};
const T0={MIN:1500,FAST:300,GAP:400,BOOT:0,BACK0:700,BACKMAX:2500};
const hud=p=>p.evaluate(()=>{const e=document.querySelector('#syncst');return e&&e.style.display!=='none'?e.textContent.replace(/^[^\p{L}]+/u,''):null;});
const meta=(p,id=SID)=>p.evaluate(id=>JSON.parse(localStorage.getItem('ruinwalk_cm_'+id)),id);
const ours=p=>p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>/^ruinwalk_(v1|slot)/.test(k)).sort().map(k=>[k,localStorage.getItem(k)])));
const strip=v=>{try{const j=JSON.parse(v);if(j&&typeof j==='object')for(const k of ['last','played','lp','hp','en','gv'])delete j[k];return JSON.stringify(j);}catch(e){return String(v);}};
const mkc=async(T,o={})=>{
  const st=o.srv||fake(),u=st.addUser('anna@test.de',PW,'Anna_1'),c=srvChar(st,u,SID,1,12);
  if(o.more)o.more(st,u);
  const p=await T.page({lv:7,cls:'krieger',inv:{holz:3},name:'Held'},undefined,undefined,pg=>st.install(pg));
  await p.addInitScript(t=>{window.__RW_SYT=t;},Object.assign({},T0,o.t));
  await p.evaluate(tap('acct'));await p.fill('#ac_email','anna@test.de');await p.fill('#ac_pw',PW);await p.evaluate(tap('aclog'));
  await p.waitForFunction(()=>document.querySelector('#acct').innerText.includes('Spielen')&&!document.querySelector('#acct').innerText.includes('Lade Cloud'));
  await p.evaluate(()=>__RW.save());
  const local0=await ours(p);
  await nav(p,tap('accplay',{id:SID}));setDbg(p);
  return {p,st,u,c,local0};};
const setDbg=p=>{until.dbg=()=>p.evaluate(()=>({hud:document.querySelector('#syncst').textContent,sy:{st:__RW.SY.st,err:__RW.SY.err,busy:__RW.SY.busy,due:__RW.SY.due-Date.now(),next:__RW.SY.next-Date.now()}}));};
const edit=(p,n)=>p.evaluate(n=>{__RW.S.inv.holz=n;},n);
const sv=(st)=>st.chars[0];

module.exports={
 'Änderung wird hochgeladen: Versionsprüfung, Bestätigung, Basis/Status aktualisiert, lokale Plätze unberührt':async(T,eq)=>{
  const {p,st,local0}=await mkc(T);await edit(p,77);
  await until(()=>sv(st).version===4,'Upload');
  const call=st.calls.find(c=>c.path.endsWith('/save_character'));
  eq([call.body.p_id,call.body.p_expected_version,call.body.p_data.inv.holz,call.body.p_data.cid],[SID,3,77,SID]);
  eq([call.h.apikey,/^Bearer at-/.test(call.h.authorization)],[st.KEY,true]);
  await until(async()=>(await meta(p)).baseVersion===4&&(await hud(p))==='gespeichert','Bestätigung');
  const m=await meta(p);eq([m.dirty,m.baseHash,m.pend],[false,await p.evaluate(()=>__RW.syncHash(__RW.S)),undefined]);
  eq(sv(st).data.inv.holz,77);
  const o=await ours(p);for(const [k,v] of Object.entries(local0))eq(strip(o[k]),strip(v),k);
  eq(p.errors,[]);await p.context().close();},
 'Nur flüchtige Felder (Zeit, HP, Energie, Spielzeit) lösen nie einen Upload aus; auch der Start allein nicht':async(T,eq)=>{
  const {p,st}=await mkc(T);
  await p.evaluate(()=>{__RW.S.hp=1;__RW.S.en=3;});await sleep(7500);
  eq(st.saves.length,0);eq(await hud(p),'gespeichert');eq((await meta(p)).dirty,false);await p.context().close();},
 'Drosselung: viele schnelle Änderungen ergeben wenige Uploads, der letzte Stand kommt an':async(T,eq)=>{
  const {p,st}=await mkc(T,{t:{MIN:3000}});
  for(let i=1;i<=15;i++){await edit(p,100+i);await sleep(300);}
  await until(()=>sv(st).data.inv.holz===115,'letzter Stand',12000);
  eq(st.saves.length<=4,true,'Uploads: '+st.saves.length);
  await sleep(4500);const n=st.saves.length;await sleep(3500);eq(st.saves.length,n,'danach Ruhe');await p.context().close();},
 'Schlüsselereignis (Levelaufstieg) wird schnell gesendet, auch bei langer Normal-Drosselung':async(T,eq)=>{
  const {p,st}=await mkc(T,{t:{MIN:60000}});
  await edit(p,40);await until(()=>sv(st).version===4,'erster Upload (noch keine Drosselung)');
  await p.evaluate(()=>{__RW.S.lv=13;});await until(()=>sv(st).version===5&&sv(st).data.lv===13,'Level-Upload trotz Drosselung',6000);
  await p.evaluate(()=>{__RW.S.inv.holz=5;});await sleep(3500);eq(st.saves.length,2,'normale Änderung wartet auf die lange Drosselung');
  eq((await meta(p)).dirty,true);await p.context().close();},
 'Rücknahme einer Änderung: kein Upload nötig, offene Markierung wird entfernt':async(T,eq)=>{
  const {p,st}=await mkc(T,{t:{MIN:3000,BOOT:0}});
  await edit(p,50);await sleep(1500);await edit(p,12);
  await until(async()=>(await meta(p)).dirty===false&&(await hud(p))==='gespeichert','sauber',12000);
  eq(st.saves.length<=1,true);await p.context().close();},
 'Offline-Änderungen bleiben erhalten (Neuladen inklusive) und werden später sicher hochgeladen':async(T,eq)=>{
  const {p,st}=await mkc(T);st.offline=true;await edit(p,88);
  await until(async()=>(await hud(p))==='offline – lokal gesichert','offline sichtbar');
  eq((await meta(p)).dirty,true);eq(sv(st).data.inv.holz,12,'Server unverändert');
  await nav(p,'location.reload()');
  eq(await p.evaluate(()=>[__RW.ACTIVE.type,__RW.S.inv.holz]),['cloud',88],'Änderung nach Neuladen noch da');
  await until(async()=>(await hud(p))!=='gespeichert','weiter offen');eq((await meta(p)).dirty,true);
  st.offline=false;await until(()=>sv(st).data.inv.holz===88&&sv(st).version===4,'später hochgeladen');
  await until(async()=>(await meta(p)).dirty===false,'sauber');await p.context().close();},
 'Serverfehler 503/429: Wiederholung mit wachsendem Abstand, Status bleibt sichtbar, danach Erfolg':async(T,eq)=>{
  for(const code of [503,429]){
   const {p,st}=await mkc(T);st.saveFail=code;await edit(p,60);
   await until(()=>st.saves.length>=3,'Wiederholungen',20000);
   const g=[st.saves[1].t-st.saves[0].t,st.saves[2].t-st.saves[1].t];eq(g[1]>g[0]*1.3,true,'Abstand wächst '+g);
   eq(/offline|Serverfehler/.test(await hud(p)),true);eq((await meta(p)).dirty,true);eq(sv(st).data.inv.holz,12);
   st.saveFail=null;await until(()=>sv(st).data.inv.holz===60,'Erfolg nach Wiederherstellung');await p.context().close();}},
 'Konflikt (anderer Stand auf dem Server): nichts überschrieben, Status sichtbar, keine weiteren Versuche, Änderung bleibt lokal':async(T,eq)=>{
  const {p,st,c}=await mkc(T);
  c.version=4;c.data=srvData(30,{name:'AnderesGerät'});    // anderes Gerät hat gespeichert
  await edit(p,66);await until(async()=>(await hud(p))==='Konflikt','Konflikt');
  eq(st.saves.length,1);eq([c.version,c.data.lv],[4,30],'Server unverändert');
  await sleep(4500);eq(st.saves.length,1,'keine weiteren Versuche');
  const m=await meta(p);eq([m.baseVersion,m.dirty],[3,true]);
  eq(await p.evaluate(()=>JSON.parse(localStorage.getItem('ruinwalk_cc_c0000000-0000-4000-8000-0000000000b1')).inv.holz),66,'lokaler Stand erhalten');
  eq((await p.evaluate(()=>__RW.syncStatus().help)).includes('nichts überschrieben'),true);await p.context().close();},
 'Verlorene Antwort: Speichern kam an, Client sah Netzfehler → beim Wiederholen als eigener Stand erkannt, kein Konflikt, keine Doppel-Version':async(T,eq)=>{
  const {p,st}=await mkc(T);st.dropResponse=true;await edit(p,91);
  await until(async()=>(await meta(p)).baseVersion===4&&(await meta(p)).dirty===false&&(await hud(p))==='gespeichert','Übernahme',15000);
  eq([sv(st).version,sv(st).data.inv.holz],[4,91]);await p.context().close();},
 'Seite schließt direkt nach Änderung: Notfall-Senden (keepalive), beim nächsten Start als eigener Stand übernommen':async(T,eq)=>{
  const {p,st}=await mkc(T,{t:{MIN:60000,FAST:60000}});await edit(p,123);
  await nav(p,'location.reload()');
  await until(()=>sv(st).version===4&&sv(st).data.inv.holz===123,'Notfall-Upload angekommen');
  await until(async()=>(await meta(p)).baseVersion===4&&(await meta(p)).dirty===false,'übernommen',15000);
  eq(await hud(p),'gespeichert');eq(st.saves.length>=1&&sv(st).version,4);
  // Auch beim erneuten Start über die Oberfläche (3b) kein falscher Konflikt
  await edit(p,124);await nav(p,'location.reload()');await until(()=>sv(st).version===5,'zweites Notfall-Speichern');
  await p.evaluate(()=>localStorage.setItem('ruinwalk_slot','1'));st.saveFail=500;await nav(p,'location.reload()');
  await p.evaluate(tap('acct'));await p.waitForFunction(()=>document.querySelector('#acct').innerText.includes('Spielen'));
  st.saveFail=null;await nav(p,tap('accplay',{id:SID}));
  eq(await p.evaluate(()=>[__RW.ACTIVE.type,__RW.S.inv.holz]),['cloud',124]);await p.context().close();},
 'Gesperrt (character_locked): sofort gestoppt, nichts verändert, Fortschritt lokal gesichert':async(T,eq)=>{
  const {p,st,c}=await mkc(T);c.slot=3;c.locked=true;await edit(p,45);
  await until(async()=>(await hud(p))==='gesperrt','gesperrt');await sleep(3500);
  eq(st.saves.length,1);eq(c.data.inv.holz,12);eq((await meta(p)).dirty,true);
  eq(await p.evaluate(()=>JSON.parse(localStorage.getItem('ruinwalk_cc_c0000000-0000-4000-8000-0000000000b1')).inv.holz),45);await p.context().close();},
 'Abgelehnt (400): Status sichtbar, keine Wiederholungsflut':async(T,eq)=>{
  const {p,st}=await mkc(T);st.saveFail=400;await edit(p,40);
  await until(async()=>(await hud(p))==='abgelehnt','abgelehnt');await sleep(4000);eq(st.saves.length,1);eq((await meta(p)).dirty,true);await p.context().close();},
 'Zu großer Spielstand wird nicht gesendet':async(T,eq)=>{
  const {p,st}=await mkc(T);await p.evaluate(()=>{__RW.S.junk='x'.repeat(950000);});
  await until(async()=>(await hud(p))==='abgelehnt','zu groß',10000);eq(st.saves.length,0);
  eq((await p.evaluate(()=>__RW.syncStatus().help)).includes('zu groß'),true);await p.context().close();},
 'Abgelaufene Anmeldung: Status „Anmeldung nötig“, Fortschritt bleibt, nach Neuanmeldung wird hochgeladen':async(T,eq)=>{
  const {p,st}=await mkc(T);st.expireAccess();st.refresh={};await edit(p,55);
  await until(async()=>(await hud(p))==='Anmeldung nötig','Anmeldung nötig');eq(sv(st).data.inv.holz,12);eq((await meta(p)).dirty,true);
  await p.evaluate(tap('acct'));await p.waitForSelector('#ac_email');await p.fill('#ac_email','anna@test.de');await p.fill('#ac_pw',PW);await p.evaluate(tap('aclog'));
  await until(()=>sv(st).data.inv.holz===55,'nach Neuanmeldung hochgeladen');await p.context().close();},
 'Anderes Konto angemeldet: es wird nichts für den fremden Charakter gesendet':async(T,eq)=>{
  const {p,st}=await mkc(T);st.addUser('bert@test.de',PW,'Bert_2');await p.evaluate(tap('aclogout'));
  await p.evaluate(tap('acct'));await p.waitForSelector('#ac_email');await p.fill('#ac_email','bert@test.de');await p.fill('#ac_pw',PW);await p.evaluate(tap('aclog'));
  await p.waitForFunction(()=>document.querySelector('#acct').innerText.includes('Bert_2'));
  await edit(p,33);await until(async()=>(await hud(p))==='Anmeldung nötig','Konto passt nicht');await sleep(2500);
  eq(st.saves.length,0);eq((await meta(p)).dirty,true);eq((await p.evaluate(()=>__RW.syncStatus().help)).includes('anderes Konto'),true);await p.context().close();},
 'Abmelden mit offenen Änderungen: nichts geht verloren, nach Anmeldung wird hochgeladen':async(T,eq)=>{
  const {p,st}=await mkc(T,{t:{MIN:60000,FAST:60000}});await edit(p,71);
  await p.evaluate(()=>__RW.save());await p.evaluate(tap('aclogout'));
  eq(await p.evaluate(()=>JSON.parse(localStorage.getItem('ruinwalk_cc_c0000000-0000-4000-8000-0000000000b1')).inv.holz),71);
  await p.evaluate(()=>__RW.save());await p.evaluate(tap('acct'));await p.fill('#ac_email','anna@test.de');await p.fill('#ac_pw',PW);await p.evaluate(tap('aclog'));
  await until(()=>sv(st).data.inv.holz===71,'nach Anmeldung hochgeladen',20000);await p.context().close();},
 '„Jetzt speichern“ (Anzeige oben links und Konto) sendet sofort und meldet das Ergebnis':async(T,eq)=>{
  const {p,st}=await mkc(T,{t:{MIN:60000,FAST:60000}});await edit(p,19);
  await p.evaluate(tap('syncnow'));await until(()=>sv(st).data.inv.holz===19,'sofort');
  await p.waitForFunction(()=>document.querySelector('#toast').textContent.includes('gespeichert'));
  await edit(p,20);await p.evaluate(tap('acct'));
  const t=await p.evaluate(()=>document.querySelector('#acct').innerText);eq(t.includes('Speicherstatus')&&t.includes('Jetzt speichern'),true);
  await p.evaluate(tap('syncnow'));await until(()=>sv(st).data.inv.holz===20,'über Konto');eq(p.errors,[]);await p.context().close();},
 'Lokale Charaktere erzeugen nie Cloud-Verkehr; Statusanzeige bleibt dort verborgen':async(T,eq)=>{
  const st=fake();st.addUser('anna@test.de',PW,'Anna_1');
  const p=await T.page({lv:7,cls:'krieger',inv:{holz:3},name:'Held'},undefined,undefined,pg=>st.install(pg));
  await p.addInitScript(t=>{window.__RW_SYT=t;},T0);await p.evaluate(()=>{__RW.S.inv.holz=9;});await sleep(3500);
  eq(st.calls.length,0);eq(await hud(p),null);await p.context().close();},
 'Zwei Cloud-Charaktere sind unabhängig: jeder sendet nur seinen Stand mit seiner Version':async(T,eq)=>{
  const {p,st,u}=await mkc(T,{more:(s,u)=>srvChar(s,u,SID2,2,20)});
  await edit(p,201);await until(()=>st.chars[0].data.inv.holz===201,'A hochgeladen');
  await p.evaluate(tap('acct'));await p.waitForFunction(()=>document.querySelector('#acct').innerText.includes('Spielen'));
  await nav(p,tap('accplay',{id:SID2}));await edit(p,202);
  await until(()=>st.chars[1].data.inv.holz===202,'B hochgeladen');
  eq([st.chars[0].data.inv.holz,st.chars[0].version],[201,4],'A unverändert durch B');
  eq(st.saves.map(s=>s.body.p_id),[SID,SID2]);eq(st.saves[1].body.p_expected_version,3);await p.context().close();},
};
