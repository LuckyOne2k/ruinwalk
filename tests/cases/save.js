const base={lv:12,xp:5,hp:50,inv:{stock:5},cu:77};
const gearOK=[{u:1,b:'w|schwert|1',q:0,p:0},{u:2,b:'a|kopf|schwer|1',q:1,p:2}];
/* zweite Seite im selben Browser-Kontext = Neustart mit dem vorhandenen localStorage (ein Reload würde per pagehide neu speichern) */
const restart=async(p)=>{const q=await p.context().newPage();q.errors=[];q.on('pageerror',e=>q.errors.push(e.message));
  await q.addInitScript(()=>{window.__RW_TEST=true;});
  await q.route('**/unpkg.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
  await q.route('**/unpkg.com/leaflet@1.9.4/dist/leaflet.js',r=>r.fulfill({body:require('fs').readFileSync(__dirname+'/../leaflet-stub.js','utf8'),contentType:'application/javascript'}));
  await q.route(/openstreetmap|overpass/,r=>r.abort());await q.goto(p.url());await q.waitForFunction(()=>window.__RW);return q;};
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
  eq(await p.evaluate(()=>[__RW.S.qdone,__RW.S.qready]),[['q1'],['q2']]);await p.context().close();},
 'Backup: gültiger Stand wird bereinigt gesichert, nicht roh':async(T,eq)=>{
  const p=await open(T,{lv:12,hp:50,inv:{stock:5,gibtsnicht:9},cu:77});
  const r=await p.evaluate(()=>JSON.parse(localStorage.getItem('ruinwalk_v1_bak')));
  eq(r.lv,12);eq(r.inv,{stock:5});eq(await p.evaluate(()=>localStorage.getItem('ruinwalk_v1_corrupt')),null);await p.context().close();},
 'Backup: beschädigter Stand überschreibt das letzte gültige Backup nie':async(T,eq)=>{
  const p=await T.page({lv:7,cls:'krieger'});
  const good=await p.evaluate(()=>{__RW.save();return localStorage.getItem('ruinwalk_v1');});
  await p.evaluate(g=>{localStorage.setItem('ruinwalk_v1_bak',g);localStorage.setItem('ruinwalk_v1','{"lv":99,"BROKEN');},good);
  const q=await restart(p);
  const r=await q.evaluate(()=>({lv:__RW.S.lv,cls:__RW.S.cls,bak:JSON.parse(localStorage.getItem('ruinwalk_v1_bak')).lv,corrupt:localStorage.getItem('ruinwalk_v1_corrupt')}));
  eq(r,{lv:7,cls:'krieger',bak:7,corrupt:'{"lv":99,"BROKEN'});await p.context().close();},
 'Backup: strukturell falsches JSON (Array/Zahl) -> Wiederherstellung aus Backup, Rohdaten separat':async(T,eq)=>{
  for(const bad of ['[1,2,3]','42','"text"','null']){
    const p=await T.page({lv:4});
    const good=await p.evaluate(()=>{__RW.save();return localStorage.getItem('ruinwalk_v1');});
    await p.evaluate(([g,b])=>{localStorage.setItem('ruinwalk_v1_bak',g);localStorage.setItem('ruinwalk_v1',b);},[good,bad]);
    const q=await restart(p);
    const r=await q.evaluate(()=>({lv:__RW.S.lv,c:localStorage.getItem('ruinwalk_v1_corrupt')}));
    eq(r.lv,4,'Wiederherstellung bei '+bad);if(bad!=='null')eq(r.c,bad,'Rohdaten '+bad);eq(q.errors,[]);await p.context().close();}},
 'Backup: beschädigt ohne Backup -> neues Spiel, Rohdaten gesichert':async(T,eq)=>{
  const p=await open(T,'{"lv":12,');
  eq(await p.evaluate(()=>[__RW.S.lv,localStorage.getItem('ruinwalk_v1_corrupt'),localStorage.getItem('ruinwalk_v1_bak')]),[1,'{"lv":12,',null]);await p.context().close();},
 'Backup: beschädigtes Backup wird nie als Wiederherstellung genutzt':async(T,eq)=>{
  const p=await T.page({lv:3});
  await p.evaluate(()=>{localStorage.setItem('ruinwalk_v1_bak','{kaputt');localStorage.setItem('ruinwalk_v1','{auch kaputt');});
  const q=await restart(p);
  eq(await q.evaluate(()=>__RW.S.lv),1);eq(q.errors,[]);await p.context().close();},
 'Rollendes Backup: jedes Speichern sichert zuerst den bisherigen Hauptstand':async(T,eq)=>{
  const p=await open(T,{lv:2});
  const r=await p.evaluate(()=>{const R=__RW;R.S.lv=3;R.save();const a=JSON.parse(localStorage.getItem('ruinwalk_v1')).lv,b1=JSON.parse(localStorage.getItem('ruinwalk_v1_bak')).lv;
    R.S.lv=4;const ok=R.save();return [ok,a,b1,JSON.parse(localStorage.getItem('ruinwalk_v1')).lv,JSON.parse(localStorage.getItem('ruinwalk_v1_bak')).lv];});
  eq(r,[true,3,2,4,3]);await p.context().close();},
 'Rollendes Backup: scheitert das Hauptspeichern, bleibt alter Stand in Haupt und Backup':async(T,eq)=>{
  const p=await open(T,{lv:2});
  const r=await p.evaluate(()=>{const R=__RW;R.S.lv=3;R.save();const orig=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){if(k==='ruinwalk_v1')throw new DOMException('voll','QuotaExceededError');return orig.call(this,k,v);};
    R.S.lv=9;let ex=null,ok;try{ok=R.save();}catch(e){ex=e.message;}Storage.prototype.setItem=orig;
    return {ok,ex,main:JSON.parse(localStorage.getItem('ruinwalk_v1')).lv,bak:JSON.parse(localStorage.getItem('ruinwalk_v1_bak')).lv};});
  eq(r,{ok:false,ex:null,main:3,bak:3});await p.context().close();},
 'Rollendes Backup: scheitert das Backup-Schreiben, wird trotzdem gespeichert und altes Backup bleibt':async(T,eq)=>{
  const p=await open(T,{lv:2});
  const r=await p.evaluate(()=>{const R=__RW;R.S.lv=3;R.save();const orig=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){if(k==='ruinwalk_v1_bak')throw new DOMException('voll','QuotaExceededError');return orig.call(this,k,v);};
    R.S.lv=4;const ok=R.save();Storage.prototype.setItem=orig;
    return {ok,main:JSON.parse(localStorage.getItem('ruinwalk_v1')).lv,bak:JSON.parse(localStorage.getItem('ruinwalk_v1_bak')).lv};});
  eq(r,{ok:true,main:4,bak:2});await p.context().close();},
 'Rollendes Backup: gesperrter Speicher (alles wirft) -> kein Absturz, nichts verändert':async(T,eq)=>{
  const p=await open(T,{lv:2});
  const r=await p.evaluate(()=>{const R=__RW;R.S.lv=3;R.save();const before=[localStorage.getItem('ruinwalk_v1'),localStorage.getItem('ruinwalk_v1_bak')];
    const so=Storage.prototype.setItem,go=Storage.prototype.getItem;
    Storage.prototype.setItem=()=>{throw new DOMException('gesperrt','SecurityError');};Storage.prototype.getItem=()=>{throw new DOMException('gesperrt','SecurityError');};
    R.S.lv=7;let ex=null,ok;try{ok=R.save();}catch(e){ex=e.message;}Storage.prototype.setItem=so;Storage.prototype.getItem=go;
    return {ok,ex,same:before[0]===localStorage.getItem('ruinwalk_v1')&&before[1]===localStorage.getItem('ruinwalk_v1_bak')};});
  eq(r,{ok:false,ex:null,same:true});await p.context().close();},
 'Rollendes Backup: beschädigter Hauptstand überschreibt nie das gültige Backup':async(T,eq)=>{
  const p=await open(T,{lv:2});
  const r=await p.evaluate(()=>{const R=__RW;R.S.lv=3;R.save();R.S.lv=4;R.save();            // main=4, bak=3
    localStorage.setItem('ruinwalk_v1','{"lv":99,KAPUTT');R.S.lv=5;const ok=R.save();
    return {ok,main:JSON.parse(localStorage.getItem('ruinwalk_v1')).lv,bak:JSON.parse(localStorage.getItem('ruinwalk_v1_bak')).lv,corrupt:localStorage.getItem('ruinwalk_v1_corrupt')};});
  eq(r,{ok:true,main:5,bak:3,corrupt:'{"lv":99,KAPUTT'});
  await p.context().close();},
 'Rollendes Backup: strukturell falscher Hauptstand ([] / Zahl) wird nicht zum Backup':async(T,eq)=>{
  const p=await open(T,{lv:2});
  const r=await p.evaluate(()=>{const R=__RW;R.S.lv=3;R.save();R.S.lv=4;R.save();const out=[];
    for(const bad of ['[1,2]','7','null']){localStorage.setItem('ruinwalk_v1',bad);R.S.lv++;R.save();out.push(JSON.parse(localStorage.getItem('ruinwalk_v1_bak')).lv);}return out;});
  eq(r,[3,3,3]);await p.context().close();},
 'Rollendes Backup: nach fehlgeschlagenem Speichern + Neustart ist der letzte gespeicherte Stand da':async(T,eq)=>{
  const p=await open(T,{lv:2,cls:'krieger'});
  await p.evaluate(()=>{const R=__RW;R.S.lv=6;R.save();const o=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='ruinwalk_v1')throw new Error('voll');return o.call(this,k,v);};R.S.lv=20;R.save();Storage.prototype.setItem=o;});
  const q=await restart(p);eq(await q.evaluate(()=>__RW.S.lv),6);eq(q.errors,[]);await p.context().close();},
 'Rollendes Backup: beschädigter Hauptstand nach Spielbetrieb -> Neustart stellt aus rollendem Backup her':async(T,eq)=>{
  const p=await open(T,{lv:2,cls:'krieger'});
  await p.evaluate(()=>{const R=__RW;R.S.lv=5;R.save();R.S.lv=6;R.save();localStorage.setItem('ruinwalk_v1','{"zerstört');});
  const q=await restart(p);const r=await q.evaluate(()=>({lv:__RW.S.lv,c:localStorage.getItem('ruinwalk_v1_corrupt')}));
  eq(r,{lv:5,c:'{"zerstört'});eq(q.errors,[]);await p.context().close();}
};
