/* Charakterplätze: Trennung, Anlegen, Wechsel, Löschen, Premium-Sperre */
const nav=(p,fn)=>Promise.all([p.waitForNavigation(),p.evaluate(fn)]).then(()=>p.waitForFunction(()=>window.__RW));
const tap=(a,d)=>`(()=>{const b=document.createElement('button');b.dataset.a=${JSON.stringify(a)};Object.assign(b.dataset,${JSON.stringify(d||{})});document.body.appendChild(b);b.click();b.remove();})()`;
const keys=p=>p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('ruinwalk_v1')||k==='ruinwalk_slot').sort());
module.exports={
 'Bestehender Spielstand wird Charakter auf Platz 1, bekommt feste ID und Zeitstempel':async(T,eq)=>{
  const p=await T.page({lv:9,cls:'krieger',inv:{holz:4}});
  const a=await p.evaluate(()=>({cid:__RW.S.cid,lv:__RW.S.lv,slot:__RW.SLOT,created:__RW.S.created>0,inv:__RW.S.inv}));
  eq(/^[A-Za-z0-9_-]{8,64}$/.test(a.cid),true);eq(a.lv,9);eq(a.slot,1);eq(a.created,true);eq(a.inv,{holz:4});
  await p.context().close();},
 'ID bleibt über Neustart gleich und ungültige IDs werden ersetzt':async(T,eq)=>{
  const p=await T.page({lv:3,cid:'abc'});
  const a=await p.evaluate(()=>{__RW.save();return [__RW.S.cid,JSON.parse(localStorage.getItem('ruinwalk_v1')).cid];});
  eq(a[0]!=='abc',true);eq(a[0],a[1]);
  await nav(p,()=>location.reload());
  eq(await p.evaluate(()=>__RW.S.cid),a[0]);await p.context().close();},
 'Neuen Charakter auf Platz 2 anlegen: eigener Spielstand, Platz 1 bleibt unverändert':async(T,eq)=>{
  const p=await T.page({lv:9,cls:'krieger',inv:{holz:4}});
  const before=await p.evaluate(()=>{__RW.save();return localStorage.getItem('ruinwalk_v1');});
  await nav(p,()=>{document.querySelector('[data-a=chars]').click();document.querySelector('#cnm2').value='Zweiti';document.querySelector('[data-a=cnew][data-slot="2"]').click();});
  const r=await p.evaluate(()=>({slot:__RW.SLOT,lv:__RW.S.lv,name:__RW.S.name,inv:__RW.S.inv,cls:__RW.S.cls,cid:__RW.S.cid}));
  eq([r.slot,r.lv,r.name,r.inv,r.cls],[2,1,'Zweiti',{},'wanderer']);
  const main=await p.evaluate(()=>localStorage.getItem('ruinwalk_v1'));
  eq(JSON.parse(main).lv,9);eq(JSON.parse(main).cid===r.cid,false,'IDs müssen verschieden sein');
  eq(JSON.parse(main).inv,{holz:4});await p.context().close();},
 'Wechseln zwischen Charakteren überschreibt nichts, Fortschritt bleibt getrennt':async(T,eq)=>{
  const p=await T.page({lv:9,cls:'krieger',inv:{holz:4}});
  await nav(p,()=>{document.querySelector('[data-a=chars]').click();document.querySelector('[data-a=cnew][data-slot="2"]').click();});
  await p.evaluate(()=>{__RW.S.lv=4;__RW.S.inv={stein:7};__RW.S.stats.kills=11;__RW.save();});
  await nav(p,()=>{document.querySelector('[data-a=chars]').click();document.querySelector('[data-a=cplay][data-slot="1"]').click();});
  eq(await p.evaluate(()=>[__RW.SLOT,__RW.S.lv,__RW.S.inv,__RW.S.stats.kills]),[1,9,{holz:4},0]);
  await nav(p,()=>{document.querySelector('[data-a=chars]').click();document.querySelector('[data-a=cplay][data-slot="2"]').click();});
  eq(await p.evaluate(()=>[__RW.SLOT,__RW.S.lv,__RW.S.inv,__RW.S.stats.kills]),[2,4,{stein:7},11]);await p.context().close();},
 'Anlegen überschreibt nie einen belegten Platz':async(T,eq)=>{
  const p=await T.page({lv:9,cls:'krieger'});
  const r=await p.evaluate(()=>{const raw=localStorage.getItem('ruinwalk_v1');__RW.save();const ok=__RW.createChar(1,'Neu');return [ok,JSON.parse(localStorage.getItem('ruinwalk_v1')).lv];});
  eq(r,[false,9]);await p.context().close();},
 'Platz 3 ist ohne Freischaltung gesperrt (auch im Testmodus), mit ?dev=1 nutzbar':async(T,eq)=>{
  const p=await T.page({lv:5,cls:'krieger',test:true});
  const r=await p.evaluate(()=>{document.querySelector('[data-a=chars]').click();const sel='[data-a=cnew][data-slot="3"]';const a=!!document.querySelector(sel);
    const b=__RW.createChar(3,'X');return [a,b,localStorage.getItem('ruinwalk_v1_s3')];});
  eq(r,[false,false,null]);await p.context().close();
  const q=await T.page({lv:5,cls:'krieger'},'?dev=1');
  eq(await q.evaluate(()=>{document.querySelector('[data-a=chars]').click();return !!document.querySelector('[data-a=cnew][data-slot="3"]');}),true);await q.context().close();},
 'Charakter löschen braucht zweites Tippen, Doppeltippen löscht nicht, andere Plätze bleiben':async(T,eq)=>{
  const p=await T.page({lv:9,cls:'krieger'});
  await nav(p,()=>{document.querySelector('[data-a=chars]').click();document.querySelector('[data-a=cnew][data-slot="2"]').click();});
  await p.evaluate(()=>{__RW.S.lv=4;__RW.save();});
  // Platz 1 (nicht aktiv) löschen: erst armen, schnelles zweites Tippen ignorieren
  const r=await p.evaluate(async()=>{document.querySelector('[data-a=chars]').click();
    const d=()=>document.querySelector('[data-a=cdel][data-slot="1"]').click();d();const a=localStorage.getItem('ruinwalk_v1')!==null;d();const b=localStorage.getItem('ruinwalk_v1')!==null;
    await new Promise(r=>setTimeout(r,600));d();return [a,b,localStorage.getItem('ruinwalk_v1'),JSON.parse(localStorage.getItem('ruinwalk_v1_s2')).lv];});
  eq(r,[true,true,null,4]);await p.context().close();},
 'Aktiven Charakter löschen wechselt auf vorhandenen anderen, löscht nur eigene Schlüssel':async(T,eq)=>{
  const p=await T.page({lv:9,cls:'krieger'});
  await nav(p,()=>{document.querySelector('[data-a=chars]').click();document.querySelector('[data-a=cnew][data-slot="2"]').click();});
  await p.evaluate(()=>{__RW.S.lv=4;__RW.save();__RW.S.lv=5;__RW.save();});   // erzeugt Backup für Platz 2
  await p.evaluate(()=>{document.querySelector('[data-a=chars]').click();});
  await Promise.all([p.waitForNavigation(),p.evaluate(async()=>{const d=()=>document.querySelector('[data-a=cdel][data-slot="2"]').click();d();await new Promise(r=>setTimeout(r,600));d();})]);
  await p.waitForFunction(()=>window.__RW);
  eq(await p.evaluate(()=>[__RW.SLOT,__RW.S.lv]),[1,9]);
  eq((await keys(p)).filter(k=>k.includes('_s2')),[]);await p.context().close();},
 'Beschädigter Platz stört andere Plätze nicht und wird als beschädigt angezeigt':async(T,eq)=>{
  const p=await T.page({lv:9,cls:'krieger',test:false});
  await p.evaluate(()=>{localStorage.setItem('ruinwalk_v1_s2','{kaputt');document.querySelector('[data-a=chars]').click();});
  const t=await p.evaluate(()=>document.querySelector('#chars').textContent);
  eq(/beschädigt/.test(t),true);eq(await p.evaluate(()=>__RW.S.lv),9);eq(p.errors,[]);await p.context().close();},
 'Spielzeit und letzte Aktivität werden mitgezählt':async(T,eq)=>{
  const p=await T.page({lv:2});
  const a=await p.evaluate(()=>__RW.S.played);await p.waitForTimeout(2300);
  const b=await p.evaluate(()=>[__RW.S.played,__RW.S.lp]);
  eq(b[0]>a,true);eq(b[1]>Date.now()-5000,true);await p.context().close();}
};
