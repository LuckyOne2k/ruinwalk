const U=require('../util');
module.exports={
 'Status-Symbole des Spielers mit Timer: Gift, Feuer, Betäubung, Wurzeln, Schutz, Erschöpfung':async(T,eq)=>{
  const p=await T.page({lv:10,cls:'krieger',shield:2});await U.install(p);
  const r=await p.evaluate(()=>{const R=__RW,o={};
    R.psn={k:'gift',dps:2,t:8};o.gift=R.playerFx().find(x=>x.id==='gift').left;
    R.psn={k:'feuer',dps:2,t:6};o.feuer=!!R.playerFx().find(x=>x.id==='feuer');
    R.psn=null;R.myStunK='bruell';R.myStun=Date.now()+2500;o.bet=!!R.playerFx().find(x=>x.id==='betaeubt');
    R.myStunK='wurzeln';R.myStun=Date.now()+3500;o.wur=!!R.playerFx().find(x=>x.id==='wurzeln');
    o.sch=R.playerFx().find(x=>x.id==='schutz').n;R.S.exh=Date.now()+90000;o.exh=Math.round(R.playerFx().find(x=>x.id==='erschoepft').left);
    R.fxUI();o.dom=[...document.querySelectorAll('#fx .fxc')].map(c=>c.dataset.id);o.txt=document.querySelector('#fx').textContent;return o;});
  eq([r.gift,r.feuer,r.bet,r.wur,r.sch,r.exh],[8,true,true,true,2,90]);eq(r.dom.includes('schutz')&&r.dom.includes('erschoepft')&&r.dom.includes('wurzeln'),true);eq(/1:30/.test(r.txt),true,'Timer sichtbar: '+r.txt);await p.context().close();},
 'Ohne Effekte ist die Leiste leer':async(T,eq)=>{
  const p=await T.page({lv:10,cls:'krieger'});
  eq(await p.evaluate(()=>{__RW.fxUI();return document.querySelector('#fx').children.length;}),0);await p.context().close();},
 'Monster-Status: Lähmung gehört nur dem gelähmten Monster und wird nur dort verbraucht':async(T,eq)=>{
  const p=await T.page({lv:10,cls:'krieger',hp:500});await U.install(p);
  const r=await p.evaluate(()=>{const R=__RW,id=T.place('rohling');const a=R.sel,m=R.MOBS[a.type];const other={id:'x_other',kind:'mob',type:a.type,lat:a.lat,lon:a.lon};
    R.S.stun=2;R.stunId=a.id;T.rand([],.99);const o={};o.a=R.mobFx(a).map(x=>x.id+x.n);o.b=R.mobFx(other).length;
    const h0=R.S.hp;R.monsterHit(m,other);o.hitOther=R.S.hp<h0&&R.S.stun===2;
    const h1=R.S.hp;R.monsterHit(m,a);o.hitStunned=R.S.hp===h1&&R.S.stun===1;return o;});
  eq(r,{a:['gelaehmt2'],b:0,hitOther:true,hitStunned:true});await p.context().close();},
 'Boss-Status: Harte Haut, Flugphase mit Timer, Sprösslinge, Raserei':async(T,eq)=>{
  const p=await T.page({lv:10,cls:'krieger',hp:500,test:true});await U.install(p);
  const r=await p.evaluate(()=>{const R=__RW;R.setPos(48.3705,10.8978,5);const e=R.areaEnts()[0];const m=R.MOBS[e.type];R.S.mh[e.id]=Math.round(m.hp*.2);
    const f=R.mobFx(e).map(x=>x.id);return {rage:f.includes('raserei')};});
  eq(r,{rage:true});await p.context().close();},
 'Alle Status-Symbole existieren als Bilddatei und sind definiert':async(T,eq)=>{
  const p=await T.page({lv:1});
  const bad=await p.evaluate(async()=>{const o=[];for(const k in __RW.FX){const r=await fetch('status/'+k+'.png');if(!r.ok)o.push(k);const d=__RW.FX[k];if(!d.n||!d.d)o.push('text '+k);}return o;});
  eq(bad,[]);await p.context().close();}
};
