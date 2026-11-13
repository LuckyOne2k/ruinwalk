const base={lv:12,xp:5,hp:50,inv:{stock:5},cu:77};
const gearOK=[{u:1,b:'w|schwert|1',q:0,p:0},{u:2,b:'a|kopf|schwer|1',q:1,p:2}];
const open=async(T,seed,q)=>{const p=await T.page(seed,q);await p.evaluate(()=>{});return p;};
module.exports={
 'beschädigtes JSON: neues Spiel, Kopie gesichert, keine Exception':async(T,eq)=>{
  const p=await open(T,'{"lv":12,"inv":{"stock":5},"BROKEN');
  eq(await p.evaluate(()=>__RW.S.lv),1);
  eq(await p.evaluate(()=>localStorage.getItem('ruinwalk_v1_corrupt')),'{"lv":12,"inv":{"stock":5},"BROKEN');
  eq(p.errors,[]);await p.context().close();},
 'falsche Datentypen führen nicht zum Absturz':async(T,eq)=>{
  const p=await open(T,{lv:'x',hp:null,en:'abc',inv:{stock:-3,holz:'x',gibtsnicht:4,kraut:2.9},gear:{},eq:null,gid:'a',tools:[null,{id:'axt',dur:3},{id:'axt',dur:-1}],qdone:'q1',cd:{a:'x',b:5}});
  eq(p.errors,[]);
  const r=await p.evaluate(()=>({lv:__RW.S.lv,hp:__RW.S.hp,en:__RW.S.en,inv:__RW.S.inv,gear:__RW.S.gear,tools:__RW.S.tools.length,qdone:__RW.S.qdone}));
  eq(r.lv,1);eq(Number.isFinite(r.hp),true);eq(Number.isFinite(r.en),true);eq(r.inv,{kraut:2});eq(r.gear,[]);eq(r.tools,1);eq(r.qdone,[]);await p.context().close();},
 'doppelte Gegenstands-IDs werden eindeutig, gid >= größte ID':async(T,eq)=>{
  const p=await open(T,{lv:5,gear:[{u:1,b:'w|schleuder|1',q:0,p:0},{u:2,b:'a|kopf|mittel|1',q:0,p:0},{u:1,b:'u|1',q:0,p:0}],gid:0});
  const r=await p.evaluate(()=>({u:__RW.S.gear.map(g=>g.u),gid:__RW.S.gid}));
  eq(new Set(r.u).size,3);eq(r.gid>=Math.max(...r.u),true);
  const n=await p.evaluate(()=>__RW.addGear('r|1',0,true).g.u);eq(r.u.includes(n),false,'neue ID kollidiert');await p.context().close();},
 'ungültige Gegenstände und falsche Slots in eq fallen weg':async(T,eq)=>{
  const p=await open(T,{lv:20,cls:'krieger',gear:[{u:1,b:'unsinn|x',q:0,p:0},{u:2,b:'w|schwert|1',q:9,p:99}],eq:{waffe:2,kopf:2,ring:1},gid:2});
  const r=await p.evaluate(()=>({n:__RW.S.gear.length,q:__RW.S.gear[0].q,p:__RW.S.gear[0].p,eq:__RW.S.eq}));
  eq(r.n,1);eq(r.q,4);eq(r.p,10);eq(r.eq,{waffe:2});await p.context().close();},
 'Speichern und Laden erhält Level, Inventar, Ausrüstung':async(T,eq)=>{
  const p=await open(T,{...base,gear:gearOK,eq:{waffe:1},gid:2,cls:'krieger'});
  await p.evaluate(()=>{__RW.S.cu+=1;__RW.save();});
  const raw=await p.evaluate(()=>localStorage.getItem('ruinwalk_v1'));
  const p2=await open(T,raw);
  const r=await p2.evaluate(()=>({lv:__RW.S.lv,inv:__RW.S.inv,cu:__RW.S.cu,eq:__RW.S.eq,n:__RW.S.gear.length,cls:__RW.S.cls}));
  eq(r,{lv:12,inv:{stock:5},cu:78,eq:{waffe:1},n:2,cls:'krieger'});await p.context().close();await p2.context().close();},
 'gültiger Stand legt Sicherung an':async(T,eq)=>{
  const p=await open(T,{...base});
  eq(JSON.parse(await p.evaluate(()=>localStorage.getItem('ruinwalk_v1_bak'))).lv,12);await p.context().close();},
 'Zurücksetzen löscht den Stand wirklich (auch nach pagehide)':async(T,eq)=>{
  const p=await open(T,{...base});
  const tap=()=>p.evaluate(()=>document.querySelector('[data-a=reset]').click());
  await p.evaluate(()=>{document.querySelector('#nav [data-s=set]').click();});
  await tap();await p.waitForTimeout(500);
  await Promise.all([p.waitForNavigation(),tap()]);
  await p.waitForFunction(()=>window.__RW);
  eq(await p.evaluate(()=>__RW.S.lv),1);
  eq(await p.evaluate(()=>JSON.parse(localStorage.getItem('ruinwalk_v1')||'{}').lv||1),1);await p.context().close();},
 'negative Zeitsprünge verändern Leben und Energie nicht':async(T,eq)=>{
  const p=await open(T,{...base,en:50});
  const r=await p.evaluate(()=>{__RW.S.en=50;__RW.S.hp=80;__RW.regen(-3600);return [__RW.S.en,__RW.S.hp];});eq(r,[50,80]);await p.context().close();},
 'Zeitpunkte in der Zukunft werden begrenzt':async(T,eq)=>{
  const p=await open(T,{lv:3,cd:{x1:Date.now()+9e9},exh:Date.now()+9e9,last:Date.now()+9e9});
  const r=await p.evaluate(()=>({cd:__RW.S.cd.x1<=Date.now(),exh:__RW.S.exh<=Date.now()+180000,last:__RW.S.last<=Date.now()}));
  eq(r,{cd:true,exh:true,last:true});await p.context().close();},
 'Speicherfehler (Quota) wird gemeldet statt verschluckt':async(T,eq)=>{
  const p=await open(T,{...base});
  const r=await p.evaluate(()=>{const o=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new Error('quota');};const ok=__RW.save();Storage.prototype.setItem=o;return [ok,document.querySelector('#toast').textContent];});
  eq(r[0],false);eq(/Speichern fehlgeschlagen/.test(r[1]),true);await p.context().close();},
 'Abgebrochene Quests und doppelte Einträge werden bereinigt':async(T,eq)=>{
  const p=await open(T,{lv:3,qdone:['q1','q1','nix'],qready:['q1','q2','q2']});
  eq(await p.evaluate(()=>[__RW.S.qdone,__RW.S.qready]),[['q1'],['q2']]);await p.context().close();}
};
