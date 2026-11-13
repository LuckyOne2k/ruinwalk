/* Phase 3b – Cloud-Charaktere vom Server laden und starten, neue Cloud-Charaktere auf Platz 1/2 anlegen.
   Läuft gegen die Attrappe tests/fake_supabase.js. Server ist maßgeblich; bei jedem Fehler bleibt alles lokal unverändert. */
const fake=require('../fake_supabase');
const PW='Gut#Pass1';
const SID='c0000000-0000-4000-8000-0000000000b1',SID2='c0000000-0000-4000-8000-0000000000b2',SID3='c0000000-0000-4000-8000-0000000000b3';
const tap=(a,d)=>`(()=>{const b=document.createElement('button');b.dataset.a=${JSON.stringify(a)};Object.assign(b.dataset,${JSON.stringify(d||{})});document.body.appendChild(b);b.click();b.remove();})()`;
const txt=p=>p.evaluate(()=>document.querySelector('#acct').innerText);
const waitTxt=(p,s)=>p.waitForFunction(s=>document.querySelector('#acct').innerText.includes(s),s,{timeout:6000}).catch(async()=>{throw new Error('Text fehlt: "'+s+'" – gefunden: '+(await txt(p)).replace(/\n/g,' | ').slice(0,300));});
const ready=p=>p.waitForFunction(()=>window.__RW&&window.__RW.S);
const nav=(p,fn)=>Promise.all([p.waitForNavigation(),p.evaluate(fn)]).then(()=>ready(p));
const srvData=(lv,o)=>Object.assign({lv,cls:'jaeger',name:'Wolke',inv:{holz:lv},stats:{kills:lv,walk:0},tools:[],cid:'egal'},o);
const srvChar=(st,u,slot,lv,o)=>{const c=Object.assign({id:slot===1?SID:slot===2?SID2:SID3,account:u.id,slot,name:'Wolke',data:srvData(lv),cls:'jaeger',level:lv,version:3},o);st.chars.push(c);return c;};
const VOLK=['last','played','lp','hp','en','gv'];
const ours=p=>p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>/^ruinwalk_(v1|slot|cc_|cm_)/.test(k)).sort().map(k=>[k,localStorage.getItem(k)])));
const strip=v=>{try{const j=JSON.parse(v);if(j&&typeof j==='object')for(const k of VOLK)delete j[k];return JSON.stringify(j);}catch(e){return String(v);}};
const stable=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,strip(v)]));
/* lokale Schlüssel: bereits vorhandene bleiben (bis auf flüchtige Felder) gleich; durch den normalen Sicherungs-Wechsel darf ein _bak neu entstehen */
const keepLocal=(before,after,eq,msg)=>{for(const [k,v] of Object.entries(before)){const a=JSON.parse(after[k]||'null'),b=JSON.parse(strip(v));
  const d=[];for(const x of new Set([...Object.keys(a||{}),...Object.keys(b||{})]))if(JSON.stringify((a||{})[x])!==JSON.stringify(b[x]))d.push(x+': '+JSON.stringify(b[x])+' → '+JSON.stringify((a||{})[x]));
  eq(d,[],(msg||'')+' '+k);}};
const LOCAL=/^ruinwalk_v1/,CLOUD=/^ruinwalk_c[cm]_/;
const pick=(o,re)=>Object.fromEntries(Object.entries(o).filter(([k])=>re.test(k)));
/* Browser mit angemeldetem Konto und geöffnetem Konto-Bildschirm */
const mk=async(T,o={})=>{const st=o.srv||fake();const u=st.addUser('anna@test.de',PW,'Anna_1');
  if(o.chars)o.chars(st,u);
  const p=await T.page(o.seed||{lv:7,cls:'krieger',inv:{holz:3},name:'Held'},o.query,undefined,pg=>st.install(pg));
  await p.evaluate(tap('acct'));await p.fill('#ac_email','anna@test.de');await p.fill('#ac_pw',PW);await p.evaluate(tap('aclog'));
  await waitTxt(p,'Cloud-Charakterplätze');await p.waitForFunction(()=>!document.querySelector('#acct').innerText.includes('Lade Cloud'));
  await p.evaluate(()=>__RW.save());   // Seed in Normalform bringen (so wie der normale Autosave es tut)
  return {p,st,u};};
const state=p=>p.evaluate(()=>({t:__RW.ACTIVE.type,id:__RW.ACTIVE.id||null,lv:__RW.S.lv,cid:__RW.S.cid,slot:localStorage.getItem('ruinwalk_slot')}));
const rest=(st,re)=>st.calls.filter(c=>re.test(c.path));

module.exports={
 'Cloud-Charakter starten: Server wird gelesen, Zwischenspeicher + Sync-Daten angelegt, danach läuft genau dieser Charakter':async(T,eq)=>{
  const {p,st,u}=await mk(T,{chars:(s,u)=>srvChar(s,u,1,12)});
  const loc0=pick(await ours(p),LOCAL);
  await nav(p,tap('accplay',{id:SID}));
  eq(await state(p),{t:'cloud',id:SID,lv:12,cid:SID,slot:'c:'+SID});
  const o=await ours(p),m=JSON.parse(o['ruinwalk_cm_'+SID]);
  eq([m.v,m.uid,m.cloudId,m.slot,m.baseVersion,m.dirty],[1,u.id,SID,1,3,false]);
  eq(JSON.parse(o['ruinwalk_cc_'+SID]).lv,12);
  eq(m.baseHash,await p.evaluate(()=>__RW.syncHash(__RW.S)),'baseHash passt zum gespeicherten Stand');
  keepLocal(loc0,stable(pick(o,LOCAL)),eq,'lokale Plätze/Backups unverändert');
  const g=rest(st,/^\/rest\/v1\/characters$/)[0];eq(g.h.apikey,st.KEY);eq(/^Bearer at-/.test(g.h.authorization),true);eq(g.h.authorization.includes(st.KEY),false);
  eq(p.errors,[]);await p.context().close();},
 'Neuer Cloud-Charakter auf Platz 1 und 2: Server-Anlage, Prüfung per Lesen, Zwischenspeicher, Start; lokale Daten unberührt':async(T,eq)=>{
  for(const slot of [1,2]){
   const {p,st,u}=await mk(T);const loc0=pick(await ours(p),LOCAL);
   await p.fill('#accn'+slot,'Nebel<b>');await nav(p,tap('accnew',{slot:String(slot)}));
   const c=st.chars[0];eq([st.chars.length,c.slot,c.account,c.version],[1,slot,u.id,1]);
   const call=rest(st,/create_character/)[0];eq(call.body.p_slot,slot);eq(call.body.p_name,'Nebelb');eq(call.body.p_data.name,'Nebelb');eq(call.body.p_data.lv,1);
   const s=await state(p);eq([s.t,s.id,s.lv,s.cid,s.slot],['cloud',c.id,1,c.id,'c:'+c.id]);
   const o=await ours(p),m=JSON.parse(o['ruinwalk_cm_'+c.id]);eq([m.slot,m.baseVersion,m.dirty,m.uid],[slot,1,false,u.id]);
   eq(await p.evaluate(()=>__RW.S.name),'Nebelb');
   keepLocal(loc0,stable(pick(o,LOCAL)),eq,'lokal unverändert (Slot '+slot+')');eq(p.errors,[]);await p.context().close();}},
 'Leerer Name ergibt einen gültigen Standardnamen':async(T,eq)=>{
  const {p,st}=await mk(T);await nav(p,tap('accnew',{slot:'1'}));
  eq(st.chars[0].name.length>=1,true);eq(await p.evaluate(()=>!!__RW.S.name),true);await p.context().close();},
 'Platz 3 kann nicht angelegt werden (UI und direkter Aufruf) – nur nach serverseitiger Berechtigung, die es hier noch nicht gibt':async(T,eq)=>{
  const {p,st}=await mk(T);
  eq(await p.evaluate(()=>!!document.querySelector('#acct [data-a="accnew"][data-slot="3"]')),false);
  await p.evaluate(()=>__RW.acCreateCloud(3));await p.evaluate(tap('accnew',{slot:'3'}));await p.waitForTimeout(300);
  eq(rest(st,/create_character/).length,0);eq(st.chars.length,0);eq((await state(p)).t,'local');await p.context().close();},
 'Belegter Platz: kein zweites Anlegen, Server wird nicht aufgerufen':async(T,eq)=>{
  const {p,st}=await mk(T,{chars:(s,u)=>srvChar(s,u,1,5)});
  await p.evaluate(()=>__RW.acCreateCloud(1));await p.waitForTimeout(300);eq(rest(st,/create_character/).length,0);eq(st.chars.length,1);await p.context().close();},
 'Anlegen scheitert (Serverfehler/offline): kein Zwischenspeicher, kein Wechsel, lokaler Charakter bleibt':async(T,eq)=>{
  for(const mode of ['fail','offline']){
   const {p,st}=await mk(T);const o0=await ours(p);
   if(mode==='fail')st.failCreate=500;else st.offline=true;
   await p.evaluate(tap('accnew',{slot:'1'}));await waitTxt(p,mode==='fail'?'Server':'nicht erreichbar');
   eq(await ours(p),o0,mode);eq((await state(p)).t,'local');eq(st.chars.length,0);await p.context().close();}},
 'Anlegen: Server liefert bei der Nachprüfung nichts Passendes → kein Start, Hinweis, Charakter bleibt auf dem Server':async(T,eq)=>{
  const {p,st}=await mk(T);const o0=await ours(p);
  st.tamper=out=>[];await p.evaluate(tap('accnew',{slot:'1'}));await waitTxt(p,'noch nicht geprüft');
  eq(await ours(p),o0);eq((await state(p)).t,'local');eq(st.chars.length,1);
  st.tamper=null;await nav(p,tap('accplay',{id:st.chars[0].id}));eq((await state(p)).t,'cloud','spätere Wiederholung per Spielen klappt');await p.context().close();},
 'Offline: Cloud-Charakter startet nicht, nichts wird angelegt oder verändert':async(T,eq)=>{
  const {p,st}=await mk(T,{chars:(s,u)=>srvChar(s,u,1,12)});const o0=await ours(p);
  st.offline=true;await p.evaluate(tap('accplay',{id:SID}));await waitTxt(p,'Keine Verbindung');
  eq(await ours(p),o0);eq((await state(p)).t,'local');await p.context().close();},
 'Offline mit vorhandenem Zwischenspeicher: trotzdem kein Start ohne Serverprüfung':async(T,eq)=>{
  const {p,st}=await mk(T,{chars:(s,u)=>srvChar(s,u,1,12)});
  await nav(p,tap('accplay',{id:SID}));await nav(p,'localStorage.setItem("ruinwalk_slot","1"),location.reload()');
  await p.evaluate(tap('acct'));await waitTxt(p,'Cloud-Charakterplätze');
  st.offline=true;const o0=await ours(p);await p.evaluate(tap('accplay',{id:SID}));await waitTxt(p,'Keine Verbindung');
  eq(await ours(p),o0);eq((await state(p)).t,'local');await p.context().close();},
 'Server-Listenfehler oder fehlende Zeile: kein Start':async(T,eq)=>{
  const {p,st}=await mk(T,{chars:(s,u)=>srvChar(s,u,1,12)});const o0=await ours(p);
  st.failList=true;await p.evaluate(tap('accplay',{id:SID}));await waitTxt(p,'konnte nicht geprüft');
  st.failList=false;await p.evaluate(tap('accplay',{id:SID2}));await waitTxt(p,'nicht gefunden');
  st.failGet=true;await p.evaluate(tap('accplay',{id:SID}));await waitTxt(p,'nicht vom Server geladen');
  eq(await ours(p),o0);eq((await state(p)).t,'local');await p.context().close();},
 'Ungültige Serverdaten werden nie gestartet (kein leerer Stand per sanitize)':async(T,eq)=>{
  const bads={leer:{},ohneLevel:srvData(1,{lv:undefined}),level0:srvData(0),inv_kaputt:srvData(5,{inv:[]}),stats_kaputt:srvData(5,{stats:'x'}),tools_kaputt:srvData(5,{tools:{}}),text:'hallo',array:[1,2]};
  for(const [n,d] of Object.entries(bads)){
   const {p,st}=await mk(T,{chars:(s,u)=>srvChar(s,u,1,5,{data:d})});const o0=await ours(p);
   await p.evaluate(tap('accplay',{id:SID}));await waitTxt(p,'ungültig');
   eq(await ours(p),o0,n);eq((await state(p)).t,'local',n);await p.context().close();}},
 'Cloud-ID und Kontozugehörigkeit werden geprüft (falsche ID, fremdes Konto, anderer Platz, andere Version, mehrere Zeilen)':async(T,eq)=>{
  const tamper={
   id:out=>out.map(r=>Object.assign({},r,{character_id:SID2})),
   konto:out=>out.map(r=>Object.assign({},r,{account_id:'00000000-0000-4000-8000-999999999999'})),
   platz:out=>out.map(r=>Object.assign({},r,{slot_number:2})),
   version:out=>out.map(r=>Object.assign({},r,{version:9})),
   mehrere:out=>out.concat(out),leer:()=>[]};
  for(const [n,f] of Object.entries(tamper)){
   const {p,st}=await mk(T,{chars:(s,u)=>srvChar(s,u,1,12)});const o0=await ours(p);
   st.tamper=f;await p.evaluate(tap('accplay',{id:SID}));await waitTxt(p,'Dein lokaler Spielstand ist unverändert');
   eq(await ours(p),o0,n);eq((await state(p)).t,'local',n);await p.context().close();}},
 'Ungültige Cloud-ID im Aufruf wird ignoriert (kein Netzwerk)':async(T,eq)=>{
  const {p,st}=await mk(T,{chars:(s,u)=>srvChar(s,u,1,12)});const n0=st.calls.length;
  await p.evaluate(()=>{for(const x of ['../x','',null,undefined,'C0000000-0000-4000-8000-0000000000B1',{}])__RW.acPlay(x);});await p.waitForTimeout(300);
  eq(st.calls.length,n0);await p.context().close();},
 'Gesperrter Platz 3: ohne Berechtigung weder Spielen-Knopf noch Start; Server-Zeile bleibt unberührt':async(T,eq)=>{
  const {p,st}=await mk(T,{chars:(s,u)=>srvChar(s,u,3,20,{locked:true})});const o0=await ours(p);
  const t=await txt(p);eq(t.includes('Gesperrt, solange keine gültige Berechtigung'),true);
  eq(await p.evaluate(()=>!!document.querySelector('#acct [data-a="accplay"]')),false);
  await p.evaluate(tap('accplay',{id:SID3}));await waitTxt(p,'gesperrt');
  eq(rest(st,/^\/rest\/v1\/characters$/).length,0,'gesperrte Daten werden gar nicht erst angefragt');
  eq(await ours(p),o0);eq((await state(p)).t,'local');eq(st.chars[0].data.lv,20);await p.context().close();},
 'Abgelaufene Sitzung beim Starten: Anmeldung verlangt, nichts verändert':async(T,eq)=>{
  const {p,st}=await mk(T,{chars:(s,u)=>srvChar(s,u,1,12)});const o0=pick(await ours(p),/^ruinwalk_(v1|slot|cc_|cm_)/);
  st.expireAccess();st.refresh={};await p.evaluate(tap('accplay',{id:SID}));await waitTxt(p,'Sitzung ist abgelaufen');
  eq(await ours(p),o0);eq((await state(p)).t,'local');await p.context().close();},
 'Zwischenspeicher gleicher Stand wie Server: es wird mit dem lokalen Fortschritt weitergespielt (als nicht synchronisiert markiert)':async(T,eq)=>{
  const {p,st}=await mk(T,{chars:(s,u)=>srvChar(s,u,1,12)});
  await nav(p,tap('accplay',{id:SID}));
  await p.evaluate(()=>{__RW.S.lv=15;__RW.S.inv.holz=99;__RW.save();});
  await nav(p,'localStorage.setItem("ruinwalk_slot","1"),location.reload()');
  await p.evaluate(tap('acct'));await waitTxt(p,'Cloud-Charakterplätze');
  await nav(p,tap('accplay',{id:SID}));
  eq(await p.evaluate(()=>[__RW.S.lv,__RW.S.inv.holz]),[15,99],'lokaler Cache gewinnt bei gleicher Version');
  const m=JSON.parse((await ours(p))['ruinwalk_cm_'+SID]);eq([m.baseVersion,m.dirty],[3,true]);
  eq(st.chars[0].data.lv,12,'Server nicht verändert');await p.context().close();},
 'Server neuer, Zwischenspeicher unverändert: Serverstand ersetzt ihn, der alte Stand bleibt als _replaced erhalten':async(T,eq)=>{
  const {p,st}=await mk(T,{chars:(s,u)=>srvChar(s,u,1,12)});
  await nav(p,tap('accplay',{id:SID}));await nav(p,'localStorage.setItem("ruinwalk_slot","1"),location.reload()');
  st.chars[0].version=4;st.chars[0].data=srvData(20);
  await p.evaluate(tap('acct'));await waitTxt(p,'Cloud-Charakterplätze');
  await nav(p,tap('accplay',{id:SID}));
  eq(await p.evaluate(()=>__RW.S.lv),20);const o=await ours(p),m=JSON.parse(o['ruinwalk_cm_'+SID]);eq([m.baseVersion,m.dirty],[4,false]);
  const rk=Object.keys(o).filter(k=>k.startsWith('ruinwalk_cc_'+SID+'_replaced_'));eq(rk.length,1);eq(JSON.parse(o[rk[0]]).lv,12,'alter Stand erhalten');await p.context().close();},
 'Server neuer, Zwischenspeicher mit Änderungen: Konflikt – nichts überschrieben, nichts gestartet':async(T,eq)=>{
  const {p,st}=await mk(T,{chars:(s,u)=>srvChar(s,u,1,12)});
  await nav(p,tap('accplay',{id:SID}));await p.evaluate(()=>{__RW.S.lv=15;__RW.save();});
  await nav(p,'localStorage.setItem("ruinwalk_slot","1"),location.reload()');
  st.chars[0].version=4;st.chars[0].data=srvData(20);
  await p.evaluate(tap('acct'));await waitTxt(p,'Cloud-Charakterplätze');const o0=await ours(p);
  await p.evaluate(tap('accplay',{id:SID}));await waitTxt(p,'nicht synchronisierte Änderungen');
  eq(await ours(p),o0);eq((await state(p)).t,'local');await p.context().close();},
 'Server älter als Zwischenspeicher, fremder/beschädigter/unvollständiger Zwischenspeicher: Abbruch ohne Änderung':async(T,eq)=>{
  const {p,st,u}=await mk(T,{chars:(s,u)=>srvChar(s,u,1,12)});
  await nav(p,tap('accplay',{id:SID}));await nav(p,'localStorage.setItem("ruinwalk_slot","1"),location.reload()');
  await p.evaluate(tap('acct'));await waitTxt(p,'Cloud-Charakterplätze');
  const mut=async(fn,s)=>{await p.evaluate(fn);const o0=await ours(p);await p.evaluate(tap('accplay',{id:SID}));await waitTxt(p,s);eq(await ours(p),o0,s);eq((await state(p)).t,'local');};
  await mut(()=>{const k='ruinwalk_cm_c0000000-0000-4000-8000-0000000000b1',m=JSON.parse(localStorage.getItem(k));m.baseVersion=8;localStorage.setItem(k,JSON.stringify(m));},'älteren Stand');
  await mut(()=>{const k='ruinwalk_cm_c0000000-0000-4000-8000-0000000000b1',m=JSON.parse(localStorage.getItem(k));m.baseVersion=3;m.uid='00000000-0000-4000-8000-999999999999';localStorage.setItem(k,JSON.stringify(m));},'nicht zu diesem Konto');
  await mut(()=>{const k='ruinwalk_cm_c0000000-0000-4000-8000-0000000000b1',m=JSON.parse(localStorage.getItem(k));m.uid=JSON.parse(localStorage.getItem('ruinwalk_auth')).user.id;localStorage.setItem(k,JSON.stringify(m));localStorage.setItem('ruinwalk_cc_c0000000-0000-4000-8000-0000000000b1','{kaputt');},'beschädigt');
  await mut(()=>localStorage.removeItem('ruinwalk_cc_c0000000-0000-4000-8000-0000000000b1'),'unvollständig');
  await p.context().close();},
 'Wechsel zwischen lokalem und Cloud-Charakter: Fortschritt bleibt getrennt und nichts geht verloren':async(T,eq)=>{
  const {p,st}=await mk(T,{chars:(s,u)=>srvChar(s,u,1,12)});
  await p.evaluate(()=>{__RW.S.lv=9;__RW.S.inv.holz=40;});
  await nav(p,tap('accplay',{id:SID}));await p.evaluate(()=>{__RW.S.lv=13;__RW.S.inv={stein:5};});
  await p.evaluate(tap('chars'));await nav(p,tap('cplay',{slot:'1'}));
  eq(await p.evaluate(()=>[__RW.ACTIVE.type,__RW.S.lv,__RW.S.inv.holz]),['local',9,40]);
  const o=await ours(p);eq(JSON.parse(o['ruinwalk_cc_'+SID]).lv,13);eq(JSON.parse(o['ruinwalk_cc_'+SID]).inv,{stein:5});
  eq(st.chars[0].data.lv,12,'Server wird in 3b nicht beschrieben');await p.context().close();},
 'Konto-Bildschirm: Spielen-Knopf, „aktiv“-Markierung und Hinweis zum Geräte-Fortschritt':async(T,eq)=>{
  const {p}=await mk(T,{chars:(s,u)=>srvChar(s,u,1,12)});
  let t=await txt(p);eq(t.includes('automatisch gespeichert'),true);eq(t.includes('Spielen'),true);eq(t.includes('aktiv'),false);
  eq(await p.evaluate(()=>!!document.querySelector('#acct [data-a="accnew"][data-slot="2"]')),true);
  await nav(p,tap('accplay',{id:SID}));await p.evaluate(tap('acct'));await waitTxt(p,'aktiv');t=await txt(p);eq(t.includes('Weiterspielen'),true);
  const n=await p.evaluate(id=>{const c=document.createElement('i');return 0;},SID);
  await p.evaluate(tap('accplay',{id:SID}));await p.waitForTimeout(200);eq(await p.evaluate(()=>getComputedStyle(document.querySelector('#acct')).display),'none','Weiterspielen schließt nur den Dialog (kein Neuladen)');
  eq(p.errors,[]);await p.context().close();},
 'Hochgeladener lokaler Charakter wird im Charakterbildschirm als „Kopie in der Cloud“ markiert, bleibt aber lokal spielbar':async(T,eq)=>{
  const {p}=await mk(T);await p.evaluate(tap('acup',{slot:'1'}).replace('b.click()','b.dataset.slot="1";b.click()'));
  await p.evaluate(()=>{const s=document.createElement('select');s.id='acsel1';s.innerHTML='<option value="1">1</option>';document.body.appendChild(s);});
  await p.evaluate(tap('acup',{slot:'1'}));await waitTxt(p,'in die Cloud kopiert');
  await p.evaluate(tap('acx'));await p.evaluate(tap('chars'));
  const t=await p.evaluate(()=>document.querySelector('#chars').innerText);eq(t.includes('Kopie liegt in der Cloud'),true);eq(t.includes('Weiterspielen'),true);
  await p.context().close();},
 'Hilfsfunktionen: syncHash ignoriert flüchtige Felder, cloudStartPlan-Matrix':async(T,eq)=>{
  const p=await T.page({lv:2});
  const r=await p.evaluate(()=>{const R=__RW,a={lv:3,inv:{b:1,a:2},last:1,played:5,lp:7,hp:9,en:2},b={inv:{a:2,b:1},lv:3,last:99,played:50,lp:70,hp:1,en:1},c=Object.assign({},a,{lv:4});
    return {gleich:R.syncHash(a)===R.syncHash(b),anders:R.syncHash(a)!==R.syncHash(c),str:typeof R.syncHash(a),
      plan:R.cloudStartPlan('c0000000-0000-4000-8000-0000000000c1','u',1,2),
      cs:[R.cloudState({}),R.cloudState(null),R.cloudState({lv:0,inv:{},stats:{},tools:[]}),R.cloudState([])],
      gut:!!R.cloudState({lv:4,inv:{holz:2},stats:{kills:0,walk:0},tools:[],cls:'jaeger'})};});
  eq(r.gleich,true);eq(r.anders,true);eq(r.plan,{a:'put'});eq(r.cs,[null,null,null,null]);eq(r.gut,true);await p.context().close();},
};
