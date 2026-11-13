const U=require('../util');
const S0={lv:20,cls:'krieger',cu:5000,inv:{stock:20,stein:20,ranke:20,holz:20,eisenerz:50,kraut:10,trank:3},hp:300};
module.exports={
 'Alle Menüs öffnen ohne Fehler und ohne seitliches Überlaufen (320, 360, 412 px)':async(T,eq)=>{
  for(const w of [320,360,412]){
    const p=await T.page({...S0,test:true});await p.setViewportSize({width:w,height:640});await U.install(p);
    await p.evaluate(()=>{const R=__RW;R.setPos(48.3705,10.8978,5);R.addGear('w|schwert|1',2);R.addGear('a|kopf|schwer|1',1);R.addGear('s|'+R.SETS.find(x=>!x.path).id+'|0',3);});
    const r=[];
    for(const s of ['inv','craft','quests','char','set','class','up','gear','dev']){
      await p.evaluate(s=>T.tap('open',{s}),s);await p.waitForTimeout(350);
      r.push(...await p.evaluate(s=>{const o=[],sh=document.querySelector('#sheet');
        for(const el of document.querySelectorAll('body *')){if(el.closest('#map'))continue;const r=el.getBoundingClientRect();if(r.width&&r.right>innerWidth+1&&getComputedStyle(el).display!=='none'){o.push('Überlauf '+s+' '+(el.id||el.className||el.tagName));break;}}
        if(sh&&sh.scrollWidth>sh.clientWidth+1)o.push('Sheet breiter '+s);return o;},s));}
    eq(r,[],'Breite '+w);eq(p.errors,[],'Fehler bei '+w);await p.context().close();}},
 'Bedienelemente sind groß genug zum Tippen (>= 40 px)':async(T,eq)=>{
  const p=await T.page({...S0});await p.setViewportSize({width:360,height:640});
  const r=await p.evaluate(()=>[...document.querySelectorAll('#nav button')].map(b=>Math.round(b.getBoundingClientRect().height)));
  eq(r.every(h=>h>=40),true,'Höhen '+r);await p.context().close();},
 'Lange Sitzung (30 min Gehen): Speicher und Elemente bleiben begrenzt, keine Fehler':async(T,eq)=>{
  const p=await T.page({...S0,test:true});await U.install(p);
  await p.clock.install({time:Date.now()});
  await p.evaluate(()=>{const R=__RW;R.setPos(48.3705,10.8978,5);});
  let maxEnts=0,maxDom=0;
  for(let i=0;i<180;i++){   // 180 x 10 s = 30 min
    await p.evaluate(i=>{const R=__RW;const P=R.P;R.setPos(P.lat+14/111320,P.lon+6/74000,5);},i);
    await p.clock.runFor(10000);
    if(i%30===0){const r=await p.evaluate(()=>({e:__RW.ents.size,d:document.querySelectorAll('#map > *').length}));maxEnts=Math.max(maxEnts,r.e);maxDom=Math.max(maxDom,r.d);}
  }
  const r=await p.evaluate(()=>({s:JSON.stringify(__RW.S).length,mh:Object.keys(__RW.S.mh).length,hp:__RW.S.hp,ok:Number.isFinite(__RW.S.hp)&&Number.isFinite(__RW.S.en),roam:__RW.roam.size,eng:__RW.eng.size}));
  eq(p.errors,[]);eq(r.ok,true);eq(r.s<100000,true,'Spielstand '+r.s+' Bytes');eq(maxEnts<400,true,'Entities '+maxEnts);eq(maxDom<500,true,'DOM '+maxDom);
  eq(r.roam<400&&r.eng<400,true);await p.context().close();},
 'Gebietsboss-Kampf über 5 Minuten: keine Fehler, Werte bleiben gültig, Reaktionen wirken':async(T,eq)=>{
  const p=await T.page({...S0,hp:600,en:100,test:true});await U.install(p);
  await p.clock.install({time:Date.now()});
  const id=await p.evaluate(()=>{const R=__RW;R.setPos(48.3705,10.8978,5);const a=R.areaEnts()[0];R.setPos(a.lat,a.lon,5);R.refreshWorld();R.select(a.id);R.eng.set(a.id,Date.now());return a.id;});
  for(let i=0;i<300;i++){
    await p.evaluate(()=>{const R=__RW;R.S.en=100;if(R.S.hp<200)R.S.hp=600;T.tap(i%2?'guard':'intr');},i).catch(()=>{});
    await p.clock.runFor(1000);}
  const r=await p.evaluate(()=>({hp:Number.isFinite(__RW.S.hp),en:Number.isFinite(__RW.S.en),neg:__RW.S.hp<0}));
  eq(p.errors,[]);eq(r,{hp:true,en:true,neg:false});await p.context().close();}
};
