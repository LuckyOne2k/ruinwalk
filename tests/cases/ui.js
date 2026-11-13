const U=require('../util');
module.exports={
 'Spielstand löschen: Doppeltippen löscht nicht, bewusstes zweites Tippen schon':async(T,eq)=>{
  const p=await T.page({lv:9,cls:'krieger'});
  await p.evaluate(()=>document.querySelector('#nav [data-s=set]').click());
  const tap=()=>p.evaluate(()=>document.querySelector('[data-a=reset]').click());
  await tap();await tap();await p.waitForTimeout(150);
  eq(await p.evaluate(()=>__RW.S.lv),9,'nach Doppeltipp');
  await p.waitForTimeout(500);await Promise.all([p.waitForNavigation(),tap()]);await p.waitForFunction(()=>window.__RW);
  eq(await p.evaluate(()=>__RW.S.lv),1,'nach bewusstem Tippen');await p.context().close();},
 'Entwicklerwerkzeuge sind im normalen Spiel nicht nutzbar':async(T,eq)=>{
  const p=await T.page({lv:5,cls:'krieger'});await U.install(p);
  const r=await p.evaluate(()=>{document.querySelector('#nav [data-s=set]').click();const vis=!!document.querySelector('[data-a=cheatmat]');
    T.tap('cheatmat');T.tap('devset',{cls:'magier',path:'',tier:'0'});return [vis,__RW.S.cu,__RW.S.cls];});
  eq(r,[false,0,'krieger']);await p.context().close();},
 'Entwicklerwerkzeuge im Testmodus oder mit ?dev=1 verfügbar':async(T,eq)=>{
  const p=await T.page({lv:5,cls:'krieger',test:true});
  eq(await p.evaluate(()=>{document.querySelector('#nav [data-s=set]').click();return !!document.querySelector('[data-a=cheatmat]');}),true);await p.context().close();
  const q=await T.page({lv:5,cls:'krieger'},'?dev=1');
  eq(await q.evaluate(()=>{document.querySelector('#nav [data-s=set]').click();return !!document.querySelector('[data-a=cheatmat]');}),true);await q.context().close();},
 'Ausrüstung verkaufen: Doppeltippen verkauft nicht, Angelegtes nie':async(T,eq)=>{
  const p=await T.page({lv:10,cls:'krieger'});await U.install(p);
  const r=await p.evaluate(async()=>{const R=__RW,w=R.addGear('w|schwert|1',0).g,z=R.addGear('w|schwert|1',0).g;T.place(null,'shop');
    const id=R.ents&&[...R.ents.values()].find(o=>o.e.kind==='shop');R.S.test=true;const sh=[...R.ents.values()].find(o=>o.e.kind==='shop').e;R.sel=sh;T.tap('shop');
    T.tap('ssellg',{id:String(w.u)});const a=R.S.gear.some(g=>g.u===w.u);
    T.tap('ssellg',{id:String(z.u)});T.tap('ssellg',{id:String(z.u)});const b=R.S.gear.some(g=>g.u===z.u);
    await new Promise(r=>setTimeout(r,500));T.tap('ssellg',{id:String(z.u)});const c=R.S.gear.some(g=>g.u===z.u);return [a,b,c];});
  eq(r,[true,true,false]);await p.context().close();},
 'Upgrade-Taste: schnelles Doppeltippen löst nur einen Versuch aus':async(T,eq)=>{
  const p=await T.page({lv:30,cls:'krieger',cu:1e6,inv:{eisenerz:500,stein:500}});await U.install(p);
  const r=await p.evaluate(()=>{const R=__RW,g=R.addGear('w|schwert|1',0).g;T.rand([],.0001);T.tap('gup',{id:String(g.u)});T.tap('gup',{id:String(g.u)});return g.p;});
  eq(r,1);await p.context().close();}
};
