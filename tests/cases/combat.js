const U=require('../util');
const P=async(T,s)=>{const p=await T.page({lv:10,cls:'krieger',hp:500,en:100,...s});await U.install(p);return p;};
module.exports={
 'Schaden = (Angriff + Zufall) x Klassenfaktor, Monster-Leben sinkt entsprechend':async(T,eq)=>{
  const p=await P(T);
  const r=await p.evaluate(()=>{const R=__RW,id=T.place('rohling');T.rand([],.99);R.S.mh[id]=5000;const atk=R.atk(),mult=R.effClass().dmg;
    R.nextAtk=0;R.shoot();return [R.S.mh[id],5000-Math.round((atk+8)*mult)];});
  eq(r[0],r[1]);await p.context().close();},
 'Kritischer Treffer verdoppelt den Schaden':async(T,eq)=>{
  const p=await P(T);
  const r=await p.evaluate(()=>{const R=__RW,id=T.place('rohling');R.S.mh[id]=5000;const atk=R.atk(),mult=R.effClass().dmg;
    T.rand([.99,0]);R.nextAtk=0;R.shoot();return [R.S.mh[id],5000-Math.round((atk+8)*mult)*2];});
  eq(r[0],r[1]);await p.context().close();},
 'Angriff kostet Energie; ohne Energie kein Schaden und kein Kampfeintritt':async(T,eq)=>{
  const p=await P(T,{en:1});
  const r=await p.evaluate(()=>{const R=__RW,id=T.place('rohling');R.S.en=1;R.eng.delete(id);R.nextAtk=0;R.shoot();return [R.S.mh[id]===undefined,R.S.en,R.eng.has(id)];});
  eq(r,[true,1,false]);await p.context().close();},
 'Außer Reichweite oder erschöpft: kein Angriff':async(T,eq)=>{
  const p=await P(T);
  const r=await p.evaluate(()=>{const R=__RW,id=T.place('rohling');const e=R.sel;R.S.mh[id]=5000;R.setPos(e.lat+.0003,e.lon,5);R.nextAtk=0;R.shoot();const a=R.S.mh[id]===5000;
    R.setPos(e.lat,e.lon,5);R.S.exh=Date.now()+60000;R.shoot();return [a,R.S.mh[id]===5000];});
  eq(r,[true,true]);await p.context().close();},
 'Besiegtes Monster: Belohnung, Statistik, Respawn-Sperre, kein Rest-Leben':async(T,eq)=>{
  const p=await P(T);
  const r=await p.evaluate(()=>{const R=__RW,id=T.place('rohling'),m=R.MOBS[R.sel.type];R.S.mh[id]=1;T.rand([],.99);const cu=R.S.cu,xp=R.S.xp,k=R.S.stats.kills;R.nextAtk=0;R.shoot();
    return {mh:R.S.mh[id],cd:!!R.S.cd[id],kills:R.S.stats.kills-k,xp:R.S.xp-xp===m.xp,coins:R.S.cu-cu>=R.COIN.normal[0]&&R.S.cu-cu<=R.COIN.normal[1],sel:R.sel};});
  eq(r,{kills:1,xp:true,coins:true,cd:true,sel:null});await p.context().close();},
 'Erfahrung: Mehrfach-Levelaufstieg, Rest bleibt, Obergrenze Stufe 50':async(T,eq)=>{
  const p=await P(T,{lv:1,xp:39});
  const r=await p.evaluate(()=>{const R=__RW;R.addXP(1);const a=[R.S.lv,R.S.xp];R.S.lv=1;R.S.xp=0;R.addXP(100);const b=[R.S.lv,R.S.xp];
    R.S.lv=R.LV_CAP;R.S.xp=5;R.addXP(1e6);return [a,b,[R.S.lv,R.S.xp]];});
  eq(r,[[2,0],[2,60],[50,0]]);await p.context().close();},
 'Monsterangriff: Rüstung senkt höchstens 75 %, Mindestschaden 1':async(T,eq)=>{
  const p=await P(T,{hp:500});
  const r=await p.evaluate(()=>{const R=__RW,id=T.place('rohling'),m=R.MOBS[R.sel.type];R.S.def=1000;T.rand([],.99);const h0=R.S.hp;R.monsterHit(m,R.sel);return [h0-R.S.hp,Math.max(1,Math.ceil(m.max*.25))];});
  eq(r[0],r[1]);await p.context().close();},
 'Schild reduziert den Schaden und wird verbraucht':async(T,eq)=>{
  const p=await P(T,{shield:2,hp:500});
  const r=await p.evaluate(()=>{const R=__RW,id=T.place('rohling'),m=R.MOBS[R.sel.type];T.rand([],.99);R.S.def=0;const h0=R.S.hp;R.monsterHit(m,R.sel);
    const raw=m.max,h=Math.max(1,Math.ceil(raw*.25),raw-R.defense());return [h0-R.S.hp,Math.max(1,Math.round(h*.3)),R.S.shield];});
  eq(r,[r[1]===r[0]?r[0]:-1,r[1],1]);await p.context().close();},
 'Ohnmacht: Leben 30 %, Erfahrung nie negativ, Erschöpfung, Monster erholt sich':async(T,eq)=>{
  const p=await P(T,{xp:7,hp:1});
  const r=await p.evaluate(()=>{const R=__RW,id=T.place('rohling'),m=R.MOBS[R.sel.type];R.S.mh[id]=3;R.faint(m,R.sel);
    return [R.S.hp===Math.round(R.maxHP()*.3),R.S.xp>=0,R.S.exh>Date.now(),R.S.mh[id]===undefined,R.S.shield];});
  eq(r,[true,true,true,true,0]);await p.context().close();},
 'Tödlicher Treffer löst genau eine Ohnmacht aus, Leben bleibt positiv':async(T,eq)=>{
  const p=await P(T,{hp:1});
  const r=await p.evaluate(()=>{const R=__RW,id=T.place('rohling'),m=R.MOBS[R.sel.type];T.rand([],.99);R.S.hp=1;R.S.def=0;const f=R.S.stats.faints||0;R.monsterHit(m,R.sel);return [R.S.hp>0,R.S.stats.faints-f];});
  eq(r,[true,1]);await p.context().close();},
 'Heiltrank: Abklingzeit gilt auch im Inventar, bei vollem Leben nicht verbraucht':async(T,eq)=>{
  const p=await P(T,{hp:10,inv:{trank:3}});
  const r=await p.evaluate(()=>{const R=__RW;R.usePotion();const a=[R.S.inv.trank,R.S.hp>10];R.S.hp=10;R.useItem('trank');const b=R.S.inv.trank;
    R.S.hp=R.maxHP();const c=R.have('trank');return [a,b,c];});
  eq(r,[[2,true],2,2]);await p.context().close();},
 'Klassen und Pfade: alle Wertekombinationen endlich, Fähigkeiten gültig':async(T,eq)=>{
  const p=await T.page({lv:50});
  const bad=await p.evaluate(()=>{const R=__RW,o=[];
    for(const cls of ['krieger','bogen','magier','heiler'])for(const path of ['',...Object.keys(R.PATHS).filter(k=>R.PATHS[k].b===cls)])for(let tier=0;tier<=(path?3:0);tier++){
      Object.assign(R.S,{cls,path,tier});const id=cls+path+tier,C=R.effClass();
      for(const f of [R.maxHP(),R.atk(),R.defense(),R.critCh(),C.dmg,C.range,C.cd,C.en])if(!isFinite(f)||f<0)o.push('wert '+id);
      if(R.critCh()>.75)o.push('krit '+id);const seen=new Set();
      for(const s of C.sk||[]){if(seen.has(s.id))o.push('skill doppelt '+id+s.id);seen.add(s.id);if(!(s.lv>0&&s.en>0&&s.cd>0&&s.n&&s.i))o.push('skill '+id+s.id);}}
    return o;});
  eq(bad,[]);await p.context().close();},
 'Gebietsbosse: Spezialangriffe konsistent':async(T,eq)=>{
  const p=await T.page({lv:1});
  const bad=await p.evaluate(()=>{const R=__RW,o=[];const areas=Object.keys(R.MOBS).filter(k=>R.MOBS[k].tier==='area');if(!areas.length)o.push('keine Gebietsbosse');
    for(const k of areas){const m=R.MOBS[k];if(!(m.hp>0&&m.max>=m.min))o.push('werte '+k);}return o;});
  eq(bad,[]);await p.context().close();}
};
