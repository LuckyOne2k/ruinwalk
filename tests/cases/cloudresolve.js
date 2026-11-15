/* Phase 3d – Konfliktdialog, stilles Erneuern/Neuanmelden ohne Neuladen, Abmelden mit offenen Änderungen. Attrappe: tests/fake_supabase.js */
const fake=require('../fake_supabase');
const PW='Gut#Pass1',SID='c0000000-0000-4000-8000-0000000000b1',SID2='c0000000-0000-4000-8000-0000000000b2';
const tap=(a,d)=>`(()=>{const b=document.createElement('button');b.dataset.a=${JSON.stringify(a)};Object.assign(b.dataset,${JSON.stringify(d||{})});document.body.appendChild(b);b.click();b.remove();})()`;
const ready=p=>p.waitForFunction(()=>window.__RW&&window.__RW.S);
const nav=(p,fn)=>Promise.all([p.waitForNavigation(),p.evaluate(fn)]).then(()=>ready(p));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(f,what,ms=15000)=>{const t=Date.now();let v;while(Date.now()-t<ms){v=await f();if(v)return v;await sleep(100);}throw new Error('Zeit überschritten: '+what);};
const srvData=(lv,o)=>Object.assign({lv,cls:'jaeger',name:'Wolke',inv:{holz:lv},stats:{kills:lv,walk:0},tools:[],cid:'egal'},o);
const srvChar=(st,u,id,slot,lv)=>{const c={id,account:u.id,slot,name:'Wolke',data:srvData(lv),cls:'jaeger',level:lv,version:3};st.chars.push(c);return c;};
const T0={MIN:1500,FAST:300,GAP:400,BOOT:0,BACK0:700,BACKMAX:2500};
const hud=p=>p.evaluate(()=>{const e=document.querySelector('#syncst');return e&&e.style.display!=='none'?e.textContent.replace(/^[^\p{L}]+/u,''):null;});
const acct=p=>p.evaluate(()=>{const e=document.querySelector('#acct');return e.style.display==='none'?'':e.innerText;});
const meta=(p,id=SID)=>p.evaluate(id=>JSON.parse(localStorage.getItem('ruinwalk_cm_'+id)),id);
const keys=(p,re)=>p.evaluate(s=>Object.keys(localStorage).filter(k=>new RegExp(s).test(k)).sort(),re);
const cache=(p,id=SID)=>p.evaluate(id=>JSON.parse(localStorage.getItem('ruinwalk_cc_'+id)),id);
const login=async(p,mail='anna@test.de')=>{await p.waitForSelector('#ac_email');await p.fill('#ac_email',mail);await p.fill('#ac_pw',PW);await p.evaluate(tap('aclog'));};
const mkc=async(T,o={})=>{
  const st=o.srv||fake(),u=st.addUser('anna@test.de',PW,'Anna_1'),c=srvChar(st,u,SID,1,12);
  if(o.more)o.more(st,u);
  const p=await T.page({lv:7,cls:'krieger',inv:{holz:3},name:'Held'},undefined,undefined,pg=>st.install(pg));
  await p.addInitScript(t=>{window.__RW_SYT=t;},Object.assign({},T0,o.t));
  await p.evaluate(tap('acct'));await login(p);
  await p.waitForFunction(()=>document.querySelector('#acct').innerText.includes('Spielen')&&!document.querySelector('#acct').innerText.includes('Lade Cloud'));
  await p.evaluate(()=>__RW.save());
  if(!o.noplay)await nav(p,tap('accplay',{id:SID}));
  return {p,st,u,c};};
const edit=(p,n)=>p.evaluate(n=>{__RW.S.inv.holz=n;},n);
/* Konflikt erzeugen: anderes Gerät speichert (Version 4, Level 30), dieses Gerät ändert */
const conflict=async(p,st,c)=>{c.version=4;c.data=srvData(30,{name:'AnderesGerät'});await edit(p,66);await until(async()=>(await hud(p))==='Konflikt','Konflikt');};

module.exports={
 'Konfliktdialog zeigt beide Stände, ohne etwas zu senden oder zu ändern; „Später entscheiden“ lässt alles unverändert':async(T,eq)=>{
  const {p,st,c}=await mkc(T);await conflict(p,st,c);const n0=st.saves.length;const k0=await keys(p,'^ruinwalk_');
  await p.evaluate(tap('syncnow'));await until(async()=>(await acct(p)).includes('Konflikt'),'Dialog');
  const t=await acct(p);eq(t.includes('Dieses Gerät')&&t.includes('Level 12')&&t.includes('Level 30')&&t.includes('Cloud'),true);
  eq(t.includes('nichts überschrieben'),true);eq(st.saves.length,n0);
  await p.evaluate(tap('acx'));eq(await hud(p),'Konflikt');eq(await keys(p,'^ruinwalk_'),k0);eq(c.data.lv,30);
  eq((await cache(p)).inv.holz,66);eq(p.errors,[]);await p.context().close();},
 'Gerät behalten: Zweischritt-Bestätigung, Cloud-Kopie lokal gesichert, Speichern gegen die aktuelle Serverversion':async(T,eq)=>{
  const {p,st,c}=await mkc(T);await conflict(p,st,c);const n0=st.saves.length;
  await p.evaluate(tap('syncnow'));await until(async()=>(await acct(p)).includes('Gerät behalten'),'Dialog');
  await p.evaluate(tap('cfkeep'));eq((await acct(p)).includes('Wirklich überschreiben'),true);eq(st.saves.length,n0,'noch nichts gesendet');
  await p.evaluate(tap('cfback'));eq((await acct(p)).includes('Wirklich überschreiben'),false);
  await p.evaluate(tap('cfkeep'));await p.evaluate(tap('cfkeep2'));
  await until(()=>c.version===5,'überschrieben');
  const call=st.saves[st.saves.length-1].body;eq([call.p_expected_version,call.p_data.inv.holz],[4,66]);
  const sc=await keys(p,'^ruinwalk_cc_'+SID+'_srvcopy_');eq(sc.length,1);
  eq(JSON.parse(await p.evaluate(k=>localStorage.getItem(k),sc[0])).lv,30,'Cloud-Stand als Kopie erhalten');
  await until(async()=>(await meta(p)).baseVersion===5&&(await meta(p)).dirty===false&&(await hud(p))==='gespeichert','bestätigt');
  eq((await acct(p)).includes('Fertig'),true);eq(p.errors,[]);await p.context().close();},
 'Gerät behalten, Cloud hat sich inzwischen erneut geändert: nichts überschrieben, Dialog wird neu geladen':async(T,eq)=>{
  const {p,st,c}=await mkc(T);await conflict(p,st,c);
  await p.evaluate(tap('syncnow'));await until(async()=>(await acct(p)).includes('Gerät behalten'),'Dialog');
  c.version=5;c.data=srvData(31);const n0=st.saves.length;
  await p.evaluate(tap('cfkeep'));await p.evaluate(tap('cfkeep2'));await until(async()=>(await acct(p)).includes('inzwischen geändert'),'Hinweis');
  eq(st.saves.length,n0);eq([c.version,c.data.lv],[5,31]);eq((await acct(p)).includes('Level 31'),true,'Dialog zeigt neuen Stand');await p.context().close();},
 'Gerät behalten mit Netzfehler: nichts überschrieben; nach Neuladen bleibt es ein Konflikt (kein stilles Überschreiben)':async(T,eq)=>{
  const {p,st,c}=await mkc(T);await conflict(p,st,c);
  await p.evaluate(tap('syncnow'));await until(async()=>(await acct(p)).includes('Gerät behalten'),'Dialog');
  st.saveFail='net';await p.evaluate(tap('cfkeep'));await p.evaluate(tap('cfkeep2'));await until(async()=>(await acct(p)).includes('Keine Verbindung'),'Netzfehler');
  eq([c.version,c.data.lv],[4,30]);st.saveFail=null;
  await nav(p,'location.reload()');await until(async()=>(await hud(p))==='Konflikt','weiter Konflikt',15000);
  eq([c.version,c.data.lv],[4,30],'Server weiter unverändert');eq((await cache(p)).inv.holz,66);await p.context().close();},
 'Gerät behalten, Antwort geht verloren (Speichern kam an): wird sofort als eigener Stand erkannt':async(T,eq)=>{
  const {p,st,c}=await mkc(T);await conflict(p,st,c);
  await p.evaluate(tap('syncnow'));await until(async()=>(await acct(p)).includes('Gerät behalten'),'Dialog');
  st.dropResponse=true;await p.evaluate(tap('cfkeep'));await p.evaluate(tap('cfkeep2'));
  await until(async()=>(await acct(p)).includes('Fertig'),'als erfolgreich erkannt');
  eq([c.version,c.data.inv.holz],[5,66]);eq((await meta(p)).baseVersion,5);eq(await hud(p),'gespeichert');await p.context().close();},
 'Cloud-Stand laden: Gerätestand bleibt als Kopie (_replaced_ + freier lokaler Platz), lokale Charaktere unberührt, danach läuft der Cloud-Stand':async(T,eq)=>{
  const {p,st,c}=await mkc(T);await conflict(p,st,c);const loc1=await p.evaluate(()=>localStorage.getItem('ruinwalk_v1'));const n0=st.saves.length;
  await p.evaluate(tap('syncnow'));await until(async()=>(await acct(p)).includes('Cloud-Stand laden'),'Dialog');
  await nav(p,tap('cfload'));
  eq(await p.evaluate(()=>[__RW.ACTIVE.type,__RW.S.lv,__RW.S.inv.holz]),['cloud',30,30]);
  const rk=await keys(p,'^ruinwalk_cc_'+SID+'_replaced_');eq(rk.length,1);eq(JSON.parse(await p.evaluate(k=>localStorage.getItem(k),rk[0])).inv.holz,66,'Gerätestand gesichert');
  const s2=JSON.parse(await p.evaluate(()=>localStorage.getItem('ruinwalk_v1_s2')));eq([s2.lv,s2.inv.holz],[12,66],'lokale Kopie auf freiem Platz 2');
  eq(s2.cid===SID||s2.cid===(JSON.parse(loc1).cid),false,'eigene neue ID');eq(await keys(p,'^ruinwalk_v1_s3'),[]);
  eq(JSON.parse(await p.evaluate(()=>localStorage.getItem('ruinwalk_v1'))).inv.holz,JSON.parse(loc1).inv.holz,'Platz 1 unverändert');
  const m=await meta(p);eq([m.baseVersion,m.dirty],[4,false]);await sleep(3500);eq(st.saves.length,n0,'kein Upload durch das Laden');
  eq([c.version,c.data.lv],[4,30]);await edit(p,31);await until(()=>c.data.inv.holz===31,'danach normales Speichern');
  eq(st.saves[st.saves.length-1].body.p_expected_version,4);eq(p.errors,[]);await p.context().close();},
 'Cloud-Stand laden bei belegten lokalen Plätzen: nichts wird überschrieben, Kopie bleibt in _replaced_':async(T,eq)=>{
  const {p,st,c}=await mkc(T);await p.evaluate(()=>localStorage.setItem('ruinwalk_v1_s2',JSON.stringify({lv:4,cls:'krieger',name:'Zwei',inv:{holz:1},stats:{kills:0,walk:0},tools:[],cid:'zwei'})));
  const s2=await p.evaluate(()=>localStorage.getItem('ruinwalk_v1_s2'));await conflict(p,st,c);
  await p.evaluate(tap('syncnow'));await until(async()=>(await acct(p)).includes('Cloud-Stand laden'),'Dialog');await nav(p,tap('cfload'));
  eq(await p.evaluate(()=>localStorage.getItem('ruinwalk_v1_s2')),s2);eq(await keys(p,'^ruinwalk_v1_s3'),[]);
  eq((await keys(p,'^ruinwalk_cc_'+SID+'_replaced_')).length,1);eq(await p.evaluate(()=>__RW.S.lv),30);await p.context().close();},
 'Cloud-Stand unlesbar: „Cloud-Stand laden“ wird nicht angeboten, „Gerät behalten“ bleibt möglich':async(T,eq)=>{
  const {p,st,c}=await mkc(T);c.version=4;c.data={};await edit(p,66);await until(async()=>(await hud(p))==='Konflikt','Konflikt');
  await p.evaluate(tap('syncnow'));await until(async()=>(await acct(p)).includes('nicht lesbar'),'Dialog');
  const t=await acct(p);eq(t.includes('Gerät behalten'),true);eq(t.includes('Cloud-Stand laden'),false);await p.context().close();},
 'Konflikt beim Start (Spielen): Dialog statt nur Ablehnung; beide Lösungen funktionieren ohne aktiven Charakter':async(T,eq)=>{
  for(const mode of ['load','keep']){
   const {p,st,c}=await mkc(T);
   await edit(p,15);await p.evaluate(()=>{__RW.S.lv=15;__RW.save();});
   await nav(p,'localStorage.setItem("ruinwalk_slot","1"),location.reload()');
   c.version=4;c.data=srvData(20);
   await p.evaluate(tap('acct'));await p.waitForFunction(()=>document.querySelector('#acct').innerText.includes('Spielen'));
   await p.evaluate(tap('accplay',{id:SID}));await until(async()=>{const t=await acct(p);return t.includes('Konflikt')&&t.includes('Level 15')&&t.includes('Level 20');},'Dialog beim Start');
   eq((await p.evaluate(()=>__RW.ACTIVE.type)),'local');
   if(mode==='load'){await p.evaluate(tap('cfload'));await until(async()=>(await acct(p)).includes('Cloud-Stand wurde geladen'),'geladen');
     eq((await cache(p)).lv,20);eq((await keys(p,'^ruinwalk_cc_'+SID+'_replaced_')).length,1);}
   else{await p.evaluate(tap('cfkeep'));await p.evaluate(tap('cfkeep2'));await until(()=>c.version===5,'überschrieben');
     eq([c.data.lv,st.saves[st.saves.length-1].body.p_expected_version],[15,4]);eq((await keys(p,'^ruinwalk_cc_'+SID+'_srvcopy_')).length,1);}
   await nav(p,tap('accplay',{id:SID}));eq(await p.evaluate(()=>[__RW.ACTIVE.type,__RW.S.lv]),['cloud',mode==='load'?20:15]);await p.context().close();}},
 'Abmelden ohne offene Änderungen geht sofort; mit Verbindung wird vorher gespeichert (keine Warnung)':async(T,eq)=>{
  const {p,st}=await mkc(T,{t:{MIN:60000,FAST:60000}});
  await p.evaluate(tap('acct'));await p.evaluate(tap('aclogout'));await until(async()=>(await acct(p)).includes('abgemeldet'),'sofort abgemeldet: '+(await acct(p)).replace(/\n/g,' | ').slice(0,200));eq(st.saves.length,0);
  await p.evaluate(tap('acx'));await p.evaluate(tap('acct'));await login(p);await until(async()=>(await acct(p)).includes('Cloud-Charakterplätze'),'wieder da');
  await p.evaluate(tap('acx'));await edit(p,81);await p.evaluate(tap('acct'));await p.evaluate(()=>__RW.save());
  await p.evaluate(tap('aclogout'));await until(async()=>(await acct(p)).includes('abgemeldet'),'abgemeldet nach Speichern');
  eq(st.chars[0].data.inv.holz,81,'vorher in die Cloud gespeichert');eq((await acct(p)).includes('Nicht in der Cloud'),false);await p.context().close();},
 'Abmelden offline mit offenen Änderungen: Warnung, Abbrechen bleibt angemeldet, „Trotzdem“ behält alles, nach Anmeldung wird hochgeladen':async(T,eq)=>{
  const {p,st}=await mkc(T,{t:{MIN:60000,FAST:60000}});st.offline=true;await edit(p,82);await p.evaluate(()=>__RW.save());
  await p.evaluate(tap('acct'));await p.evaluate(tap('aclogout'));await until(async()=>(await acct(p)).includes('Nicht in der Cloud gespeicherte Änderungen'),'Warnung');
  eq((await acct(p)).includes('Wolke'),true);
  await p.evaluate(tap('acv',{v:'home'}));eq(await p.evaluate(()=>!!__RW.AUTH.s),true,'Abbrechen: weiter angemeldet');
  await p.evaluate(tap('aclogout'));await until(async()=>(await acct(p)).includes('Trotzdem abmelden'),'Warnung 2');await p.evaluate(tap('aclogoutok'));
  eq(await p.evaluate(()=>!!__RW.AUTH.s),false);eq((await cache(p)).inv.holz,82);eq((await meta(p)).dirty,true);
  st.offline=false;await p.evaluate(tap('acct'));await login(p);await until(()=>st.chars[0].data.inv.holz===82,'nach Anmeldung hochgeladen',20000);await p.context().close();},
 'Abmelden: offene Änderungen eines nicht aktiven Cloud-Charakters lösen ebenfalls die Warnung aus':async(T,eq)=>{
  const {p,st}=await mkc(T,{more:(s,u)=>srvChar(s,u,SID2,2,20),t:{MIN:60000,FAST:60000}});
  await p.evaluate(tap('acx'));await p.evaluate(tap('acct'));await p.waitForFunction(()=>document.querySelector('#acct').innerText.includes('Spielen'));
  await nav(p,tap('accplay',{id:SID2}));await edit(p,55);st.offline=true;await p.evaluate(()=>__RW.save());
  await nav(p,'localStorage.setItem("ruinwalk_slot","c:'+SID+'"),location.reload()');
  eq(await p.evaluate(()=>__RW.ACTIVE.id),SID);await p.evaluate(tap('acct'));
  await p.evaluate(tap('aclogout'));await until(async()=>(await acct(p)).includes('Nicht in der Cloud gespeicherte Änderungen'),'Warnung für B');
  eq((await meta(p,SID2)).dirty,true);await p.context().close();},
 'Abgelaufener Zugriffstoken + Erneuern nur wegen Netzproblem unmöglich: wird wiederholt, nicht „abgelehnt“':async(T,eq)=>{
  const {p,st}=await mkc(T);st.expireAccess();st.failRefresh='net';await edit(p,61);
  await until(async()=>/offline/.test(await hud(p)||''),'offline-Status');await sleep(2500);eq((await hud(p)).includes('abgelehnt'),false);eq((await meta(p)).dirty,true);
  st.failRefresh=null;await until(()=>st.chars[0].data.inv.holz===61,'danach hochgeladen',20000);await p.context().close();},
 'Sitzung wird kurz vor dem Ablauf unauffällig erneuert (ohne Dialog, ohne Neuladen)':async(T,eq)=>{
  const {p,st}=await mkc(T);await p.evaluate(()=>{window.__keep=__RW.S;});const at0=await p.evaluate(()=>__RW.AUTH.s.access_token);
  await p.evaluate(()=>{__RW.AUTH.s.exp=Date.now()+30000;});
  await until(async()=>(await p.evaluate(()=>__RW.AUTH.s.access_token))!==at0,'Token erneuert',20000);
  eq(await p.evaluate(()=>getComputedStyle(document.querySelector('#acct')).display),'none');eq(await p.evaluate(()=>window.__keep===__RW.S),true);
  await edit(p,62);await until(()=>st.chars[0].data.inv.holz===62,'weiter speichern');eq(p.errors,[]);await p.context().close();},
 'Sitzung ungültig mitten im Spiel: Tippen auf die Anzeige öffnet die Anmeldung (E-Mail vorausgefüllt); nach Anmeldung ohne Neuladen weiter':async(T,eq)=>{
  const {p,st}=await mkc(T);await p.evaluate(()=>{window.__keep=__RW.S;window.__m=1;});
  st.expireAccess();st.refresh={};await edit(p,63);await until(async()=>(await hud(p))==='Anmeldung nötig','Anmeldung nötig');
  eq(st.chars[0].data.inv.holz,12);
  await p.evaluate(tap('syncnow'));await until(async()=>(await acct(p)).includes('melde dich neu an'),'Anmeldung geöffnet');
  eq(await p.evaluate(()=>document.querySelector('#ac_email').value),'anna@test.de','E-Mail vorausgefüllt');
  await p.fill('#ac_pw',PW);await p.evaluate(tap('aclog'));await until(()=>st.chars[0].data.inv.holz===63,'hochgeladen');
  eq(await p.evaluate(()=>window.__m===1&&window.__keep===__RW.S),true,'kein Neuladen, Spielstand im Speicher');eq(p.errors,[]);await p.context().close();},
};
