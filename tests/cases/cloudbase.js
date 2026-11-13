/* Phase 3a – Fundament für Cloud-Charaktere: eigene Schlüssel, eigener Zwischenspeicher, strikte Trennung von den lokalen Plätzen.
   Kein Netzwerk beteiligt. */
const ID='c0000000-0000-4000-8000-0000000000a1',ID2='c0000000-0000-4000-8000-0000000000a2',UID='aaaaaaaa-0000-4000-8000-000000000001';
const META=(id=ID,o)=>Object.assign({v:1,uid:UID,cloudId:id,slot:2,baseVersion:3,dirty:false,syncedAt:1700000000000},o);
/* seed: Schlüssel, die vor dem Laden in localStorage stehen (einmal pro Browser-Sitzung) */
const pre=kv=>async p=>{await p.addInitScript(([kv])=>{if(sessionStorage.getItem('__cs'))return;sessionStorage.setItem('__cs','1');for(const [k,v] of Object.entries(kv))localStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v));},[kv]);};
const nav=(p,fn)=>Promise.all([p.waitForNavigation(),p.evaluate(fn)]).then(()=>p.waitForFunction(()=>window.__RW));
const ours=p=>p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>/^ruinwalk_(v1|slot|cc_|cm_)/.test(k)).sort().map(k=>[k,localStorage.getItem(k)])));
const sub=(o,re)=>Object.fromEntries(Object.entries(o).filter(([k])=>re.test(k)));
const LOCAL=/^ruinwalk_v1/,CLOUD=/^ruinwalk_c[cm]_/;
const cs=(lv,extra)=>Object.assign({lv,cls:'jaeger',inv:{holz:lv},name:'Wolke',cid:ID},extra);
const boot=(T,kv,local)=>T.page(local||{lv:9,cls:'krieger',inv:{holz:4},name:'Lokal'},undefined,undefined,pre(kv));
const tap=(a,d)=>`(()=>{const b=document.createElement('button');b.dataset.a=${JSON.stringify(a)};Object.assign(b.dataset,${JSON.stringify(d||{})});document.body.appendChild(b);b.click();b.remove();})()`;

module.exports={
 'Cloud-Schlüssel sind von den lokalen Schlüsseln getrennt (kein gemeinsamer Name, kein gemeinsames Präfix)':async(T,eq)=>{
  const p=await T.page({lv:2});const k=await p.evaluate(id=>({c:__RW.cloudKey(id),m:__RW.cloudMetaKey(id),l:[1,2,3].map(n=>n===1?'ruinwalk_v1':'ruinwalk_v1_s'+n)}),ID);
  eq(k.c,'ruinwalk_cc_'+ID);eq(k.m,'ruinwalk_cm_'+ID);eq(k.l.some(x=>k.c.startsWith(x)||k.m.startsWith(x)||x.startsWith(k.c)),false);
  eq(await p.evaluate(()=>__RW.ACTIVE.type),'local');await p.context().close();},
 'Aktiver Cloud-Charakter wird aus eigenem Zwischenspeicher geladen; Identität = Cloud-ID; lokaler Platz-Wert ist 0':async(T,eq)=>{
  const p=await boot(T,{ruinwalk_slot:'c:'+ID,['ruinwalk_cc_'+ID]:cs(11,{cid:'fremd-id-xyz'}),['ruinwalk_cm_'+ID]:META()});
  const a=await p.evaluate(()=>({t:__RW.ACTIVE.type,slot:__RW.SLOT,key:__RW.KEY,lv:__RW.S.lv,cid:__RW.S.cid,name:__RW.S.name}));
  eq(a,{t:'cloud',slot:0,key:'ruinwalk_cc_'+ID,lv:11,cid:ID,name:'Wolke'});await p.context().close();},
 'Speichern eines Cloud-Charakters schreibt nur Cloud-Schlüssel; lokale Plätze und Sync-Daten bleiben byte-identisch':async(T,eq)=>{
  const p=await boot(T,{ruinwalk_slot:'c:'+ID,['ruinwalk_cc_'+ID]:cs(11),['ruinwalk_cm_'+ID]:META(),ruinwalk_v1_s2:{lv:5,cls:'magier'},ruinwalk_v1_bak:'{"bak":1}'});
  const before=await ours(p);
  await p.evaluate(()=>{__RW.S.lv=12;__RW.S.inv.holz=77;__RW.save();__RW.S.lv=13;__RW.save();});
  const after=await ours(p);
  eq(sub(after,LOCAL),sub(before,LOCAL),'lokale Schlüssel');eq(after['ruinwalk_cm_'+ID],before['ruinwalk_cm_'+ID],'Sync-Daten unverändert');eq(after.ruinwalk_slot,before.ruinwalk_slot);
  eq(JSON.parse(after['ruinwalk_cc_'+ID]).lv,13);eq(JSON.parse(after['ruinwalk_cc_'+ID+'_bak']).lv,12,'eigenes rollierendes Backup');
  eq(Object.keys(after).filter(k=>!before.hasOwnProperty(k)),[],'keine neuen Schlüssel außerhalb des Cloud-Speichers');await p.context().close();},
 'Cloud-Zwischenspeicher beschädigt, Backup vorhanden: Wiederherstellung aus dem Cloud-Backup, lokale Plätze unberührt':async(T,eq)=>{
  const p=await boot(T,{ruinwalk_slot:'c:'+ID,['ruinwalk_cc_'+ID]:'{kaputt',['ruinwalk_cc_'+ID+'_bak']:cs(8),['ruinwalk_cm_'+ID]:META()});
  const a=await p.evaluate(()=>({lv:__RW.S.lv,t:__RW.ACTIVE.type,corrupt:localStorage.getItem('ruinwalk_cc_'+'c0000000-0000-4000-8000-0000000000a1_corrupt')}));
  eq([a.lv,a.t,a.corrupt],[8,'cloud','{kaputt']);
  eq((await ours(p)).ruinwalk_v1&&JSON.parse((await ours(p)).ruinwalk_v1).lv,9);await p.context().close();},
 'Cloud-Zwischenspeicher unlesbar und ohne Backup: nie ein leerer Stand daraus gespeichert, Ausweichen auf lokalen Platz 1, Rohdaten und Cloud-Daten bleiben':async(T,eq)=>{
  const p=await boot(T,{ruinwalk_slot:'c:'+ID,['ruinwalk_cc_'+ID]:'{kaputt',['ruinwalk_cm_'+ID]:META(ID,{baseVersion:7})});
  await p.waitForFunction(()=>window.__RW&&window.__RW.ACTIVE.type==='local'&&window.__RW.S.lv===9,null,{timeout:8000});
  const o=await ours(p);
  eq(o['ruinwalk_cc_'+ID],'{kaputt','Hauptschlüssel nicht überschrieben');eq(o['ruinwalk_cc_'+ID+'_corrupt'],'{kaputt','Rohdaten separat gesichert');
  eq(JSON.parse(o['ruinwalk_cm_'+ID]).baseVersion,7);eq(JSON.parse(o.ruinwalk_v1).lv,9);
  eq(await p.evaluate(()=>document.querySelector('#toast').textContent.includes('Zwischenspeicher des Cloud-Charakters')),true);await p.context().close();},
 'Ungültige oder unvollständige Cloud-Auswahl fällt auf lokalen Platz 1 zurück, ohne irgendetwas zu verändern':async(T,eq)=>{
  const cases={
   'kein Zwischenspeicher':{ruinwalk_slot:'c:'+ID,['ruinwalk_cm_'+ID]:META()},
   'keine Sync-Daten':{ruinwalk_slot:'c:'+ID,['ruinwalk_cc_'+ID]:cs(11)},
   'Sync-Daten gehören zu anderer ID':{ruinwalk_slot:'c:'+ID,['ruinwalk_cc_'+ID]:cs(11),['ruinwalk_cm_'+ID]:META(ID2)},
   'Sync-Daten ungültig':{ruinwalk_slot:'c:'+ID,['ruinwalk_cc_'+ID]:cs(11),['ruinwalk_cm_'+ID]:META(ID,{baseVersion:0})},
   'Sync-Daten kaputtes JSON':{ruinwalk_slot:'c:'+ID,['ruinwalk_cc_'+ID]:cs(11),['ruinwalk_cm_'+ID]:'{x'},
   'keine UUID':{ruinwalk_slot:'c:../../ruinwalk_v1',ruinwalk_cc_x:cs(3)},
   'Großbuchstaben-ID':{ruinwalk_slot:'c:'+ID.toUpperCase(),['ruinwalk_cc_'+ID.toUpperCase()]:cs(3),['ruinwalk_cm_'+ID.toUpperCase()]:META(ID.toUpperCase())}};
  for(const [n,kv] of Object.entries(cases)){
   const p=await boot(T,kv);const before=await ours(p);
   const a=await p.evaluate(()=>({t:__RW.ACTIVE.type,slot:__RW.SLOT,lv:__RW.S.lv,key:__RW.KEY}));
   eq(a,{t:'local',slot:1,lv:9,key:'ruinwalk_v1'},n);
   await p.evaluate(()=>__RW.save());const after=await ours(p);
   eq(sub(after,CLOUD),sub(before,CLOUD),n+': Cloud-Schlüssel unverändert');eq(after.ruinwalk_slot,before.ruinwalk_slot,n+': Auswahl nicht überschrieben');
   await p.context().close();}},
 'Wechsel Cloud ↔ lokal: Fortschritt bleibt getrennt (lokal → Cloud → lokal)':async(T,eq)=>{
  const p=await boot(T,{['ruinwalk_cc_'+ID]:cs(11),['ruinwalk_cm_'+ID]:META()});
  await p.evaluate(()=>{__RW.S.inv.holz=40;__RW.S.lv=10;});
  await Promise.all([p.waitForNavigation(),p.evaluate(id=>__RW.switchCloud(id),ID)]);await p.waitForFunction(()=>window.__RW);
  eq(await p.evaluate(()=>[__RW.ACTIVE.type,__RW.S.lv,__RW.S.inv.holz,__RW.S.cid]),['cloud',11,11,ID]);
  await p.evaluate(()=>{__RW.S.lv=14;__RW.S.inv={stein:5};});
  await Promise.all([p.waitForNavigation(),p.evaluate(tap('chars')).then(()=>p.evaluate(tap('cplay',{slot:'1'})))]);await p.waitForFunction(()=>window.__RW);
  eq(await p.evaluate(()=>[__RW.ACTIVE.type,__RW.SLOT,__RW.S.lv,__RW.S.inv.holz]),['local',1,10,40],'lokaler Fortschritt (vor dem Wechsel gespeichert)');
  const o=await ours(p);eq(JSON.parse(o['ruinwalk_cc_'+ID]).lv,14,'Cloud-Fortschritt im eigenen Speicher');eq(JSON.parse(o['ruinwalk_cc_'+ID]).inv,{stein:5});
  eq(JSON.parse(o.ruinwalk_v1).lv,10);await p.context().close();},
 'Wechsel zu ungültigem Cloud-Charakter wird verweigert, der aktuelle Charakter bleibt aktiv':async(T,eq)=>{
  const p=await T.page({lv:2});
  eq(await p.evaluate(id=>[__RW.switchCloud(id),__RW.switchCloud('../x'),__RW.switchCloud(null)],ID),[false,false,false]);
  eq(await p.evaluate(()=>localStorage.getItem('ruinwalk_slot')),null);await p.context().close();},
 'Zwischenspeicher anlegen überschreibt nie Vorhandenes und prüft Eingaben':async(T,eq)=>{
  const p=await T.page({lv:2});
  const r=await p.evaluate(([id,meta,st])=>{const R=__RW,o={};
    o.neu=R.cloudCachePut(meta,st);o.stateLv=JSON.parse(localStorage.getItem(R.cloudKey(id))).lv;o.cid=JSON.parse(localStorage.getItem(R.cloudKey(id))).cid;
    const m0=localStorage.getItem(R.cloudMetaKey(id)),s0=localStorage.getItem(R.cloudKey(id));
    o.zweit=R.cloudCachePut(Object.assign({},meta,{baseVersion:9}),{lv:40});o.same=m0===localStorage.getItem(R.cloudMetaKey(id))&&s0===localStorage.getItem(R.cloudKey(id));
    o.badMeta=R.cloudCachePut({v:1},st);o.badId=R.cloudCachePut(Object.assign({},meta,{cloudId:'../x'}),st);
    o.nurState=(()=>{const id2='c0000000-0000-4000-8000-0000000000a9';localStorage.setItem(R.cloudKey(id2),'{"lv":3}');return R.cloudCachePut(Object.assign({},meta,{cloudId:id2}),st);})();
    return o;},[ID,META(),{lv:21,cls:'krieger',cid:'egal'}]);
  eq(r,{neu:true,stateLv:21,cid:ID,zweit:false,same:true,badMeta:false,badId:false,nurState:false});
  eq(await p.evaluate(()=>localStorage.getItem('ruinwalk_cc_c0000000-0000-4000-8000-0000000000a9')),'{"lv":3}');await p.context().close();},
 'Sync-Daten werden streng geprüft, gültige gelesen, cloudCaches() listet nur vollständige Paare':async(T,eq)=>{
  const ID3='c0000000-0000-4000-8000-0000000000a3';
  const p=await boot(T,{['ruinwalk_cc_'+ID]:cs(2),['ruinwalk_cm_'+ID]:META(),['ruinwalk_cm_'+ID2]:META(ID2),['ruinwalk_cc_'+ID3]:cs(3),['ruinwalk_cm_'+ID3]:'{x'});
  const r=await p.evaluate(([a,b,c])=>({list:__RW.cloudCaches().map(m=>m.cloudId),a:__RW.readMeta(a),b:__RW.readMeta(b),c:__RW.readMeta(c),w:__RW.writeMeta({v:1,uid:'x',cloudId:a}),w2:__RW.writeMeta(Object.assign({},__RW.readMeta(a),{dirty:'ja'}))}),[ID,ID2,ID3]);
  eq(r.list,[ID]);eq(r.a.baseVersion,3);eq(r.b!==null,true);eq(r.c,null);eq([r.w,r.w2],[false,false]);await p.context().close();},
 'Schreiben der Sync-Daten ändert nur deren Schlüssel':async(T,eq)=>{
  const p=await boot(T,{['ruinwalk_cc_'+ID]:cs(2),['ruinwalk_cm_'+ID]:META()});const before=await ours(p);
  eq(await p.evaluate(([id,m])=>__RW.writeMeta(Object.assign({},__RW.readMeta(id),m)),[ID,{dirty:true,baseVersion:4}]),true);
  const after=await ours(p);eq(Object.keys(after).filter(k=>after[k]!==before[k]),['ruinwalk_cm_'+ID]);
  eq(JSON.parse(after['ruinwalk_cm_'+ID]).dirty,true);await p.context().close();},
 'Charakterbildschirm bei aktivem Cloud-Charakter: lokale Plätze bleiben bedienbar, kein lokaler Platz gilt als aktiv, Beschriftung zeigt Cloud':async(T,eq)=>{
  const p=await boot(T,{ruinwalk_slot:'c:'+ID,['ruinwalk_cc_'+ID]:cs(11),['ruinwalk_cm_'+ID]:META()});
  await p.evaluate(tap('chars'));
  const t=await p.evaluate(()=>document.querySelector('#chars').innerText);
  eq(t.includes('(aktiv)'),false);eq(t.includes('Lokal'),true);eq(t.includes('Spielen'),true);
  eq(p.errors,[]);await p.context().close();},
 'Löschen eines lokalen Platzes lässt Cloud-Zwischenspeicher unberührt':async(T,eq)=>{
  const p=await boot(T,{ruinwalk_slot:'c:'+ID,['ruinwalk_cc_'+ID]:cs(11),['ruinwalk_cm_'+ID]:META()});const before=await ours(p);
  await p.evaluate(tap('chars'));await p.evaluate(tap('cdel',{slot:'1'}));await p.waitForTimeout(600);await p.evaluate(tap('cdel',{slot:'1'}));
  await p.waitForTimeout(300);const after=await ours(p);
  eq(sub(after,CLOUD),sub(before,CLOUD));eq(after.ruinwalk_v1,undefined,'der lokale Platz wurde bewusst gelöscht');eq(after.ruinwalk_slot,'c:'+ID,'aktiver Cloud-Charakter bleibt aktiv');await p.context().close();},
};
