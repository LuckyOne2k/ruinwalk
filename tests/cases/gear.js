const U=require('../util');
const P=async T=>{const p=await T.page({lv:30,cls:'krieger',cu:100000,inv:{eisenerz:500,stein:500,kristall:20,steinherz:20,rune0:2,tyrannenzahn:2,moorperle:2,gebietsherz:2,drachenschuppe:4}});await U.install(p);return p;};
module.exports={
 'alle herstellbaren Basen und Set-Teile haben endliche, positive Werte':async(T,eq)=>{
  const p=await P(T);
  const bad=await p.evaluate(()=>{const R=__RW,out=[];
    for(const g of R.GR){const b=R.getBase(g.id);for(const k in b.st)if(!(isFinite(b.st[k])&&b.st[k]>=0))out.push(g.id+':'+k);if(!Object.keys(b.st).length)out.push(g.id+' ohne Werte');}
    for(const d of R.SETS)for(let ix=0;ix<8;ix++){let b;try{b=R.getBase('s|'+d.id+'|'+ix);}catch(e){if(ix===7)continue;out.push('set '+d.id+' '+ix);continue;}
      for(const k in b.st)if(!isFinite(b.st[k]))out.push(d.id+ix+':'+k);}
    return out;});
  eq(bad,[]);await p.context().close();},
 'Ausrüstungsregeln: Level, Waffenart, Rüstungsart':async(T,eq)=>{
  const p=await T.page({lv:5,cls:'krieger'});
  const r=await p.evaluate(()=>{const R=__RW,c=b=>R.canEquip({b,q:0,p:0,u:1});
    return [c('w|schwert|1'),c('w|schwert|2'),c('w|bogen|1'),c('a|kopf|schwer|1'),c('a|kopf|leicht|1'),c('o|schild|1'),c('o|koecher|1')];});
  eq(r[0],'');eq(r[1],'Ab Level 10');eq(r[2],'Falsche Waffenart');eq(r[3],'');eq(/nicht erlaubt/.test(r[4]),true);eq(r[5],'');eq(r[6]!=='',true);await p.context().close();},
 'Neue Ausrüstung wird nur in einen leeren Slot automatisch angelegt':async(T,eq)=>{
  const p=await T.page({lv:5,cls:'krieger'});
  const r=await p.evaluate(()=>{const R=__RW,a=R.addGear('w|schwert|1',0),b=R.addGear('w|schwert|1',2);return [a.auto,b.auto,R.S.eq.waffe===a.g.u];});
  eq(r,[true,false,true]);await p.context().close();},
 'Werte: Qualität und +Stufen skalieren korrekt':async(T,eq)=>{
  const p=await T.page({lv:5,cls:'krieger'});
  const r=await p.evaluate(()=>{const R=__RW;const g={b:'w|schwert|1',q:2,p:3,u:1};return [R.gStats(g).atk,R.gStats({...g,q:0,p:0}).atk,R.gStats({...g,q:4,p:10}).atk];});
  eq(r,[Math.round(3*1.6*1.3),3,Math.round(3*2.6*2)]);await p.context().close();},
 'Upgrade: Erfolg zieht Material und Gebühr ab und erhöht die Stufe':async(T,eq)=>{
  const p=await P(T);
  const r=await p.evaluate(()=>{const R=__RW,g=R.addGear('w|schwert|1',0).g,c=R.UPCOST(0,1),cu=R.S.cu,e=R.S.inv.eisenerz;T.rand([0]);R.upgradeGear(g.u);
    return {p:g.p,eis:e-R.S.inv.eisenerz,cost:c.eisenerz,fee:cu-R.S.cu,feeE:R.UPFEE(0)};});
  eq(r.p,1);eq(r.eis,r.cost);eq(r.fee,r.feeE);await p.context().close();},
 'Upgrade: Misserfolg verbraucht Material, Stufe bleibt, nie unter 0':async(T,eq)=>{
  const p=await P(T);
  const r=await p.evaluate(()=>{const R=__RW,g=R.addGear('w|schwert|1',0).g;g.p=5;const e=R.S.inv.eisenerz;T.rand([],.9999);R.upgradeGear(g.u);return [g.p,e>R.S.inv.eisenerz];});
  eq(r,[5,true]);await p.context().close();},
 'Upgrade: ohne Material/Geld und ab +10 passiert nichts':async(T,eq)=>{
  const p=await T.page({lv:30,cls:'krieger',cu:5,inv:{eisenerz:1}});await U.install(p);
  const r=await p.evaluate(()=>{const R=__RW,g=R.addGear('w|schwert|1',0).g;const s=JSON.stringify([R.S.inv,R.S.cu]);R.upgradeGear(g.u);const a=s===JSON.stringify([R.S.inv,R.S.cu]);
    R.S.inv.eisenerz=999;R.S.cu=1e6;g.p=10;R.upgradeGear(g.u);return [a,g.p,R.S.inv.eisenerz,R.S.cu];});
  eq(r,[true,10,999,1e6]);await p.context().close();},
 'Upgrade: Rune erhöht die Chance und wird verbraucht':async(T,eq)=>{
  const p=await P(T);
  const r=await p.evaluate(()=>{const R=__RW,g=R.addGear('w|schwert|1',0).g;g.p=5;T.tap('rune',{q:'0'});T.rand([],.0001);const n=R.S.inv.rune0;R.upgradeGear(g.u);return [n-R.S.inv.rune0,g.p];});
  eq(r,[1,6]);await p.context().close();},
 'Set-Boni: 2/4/6 Teile und Waffe+Nebenhand':async(T,eq)=>{
  const p=await P(T);
  const r=await p.evaluate(()=>{const R=__RW,d=R.SETS.find(x=>!x.path&&x.b2&&x.b4&&x.b6&&x.bw);const o=[];
    const put=ix=>{const g=R.addGear('s|'+d.id+'|'+ix,0,true).g;R.S.eq[R.getBase(g.b).slot]=g.u;};
    const keys=()=>JSON.stringify(R.SB());
    put(0);o.push(keys());put(1);o.push(keys()===JSON.stringify(d.b2));
    put(2);put(3);o.push(keys());put(4);put(5);o.push(keys());
    return {d:d.id,n1:o[0]==='{}',n2:o[1],full:o[3]!=='{}'};});
  eq(r.n1,true);eq(r.n2,true);eq(r.full,true);await p.context().close();},
 'Pfad-Set: nur mit passendem Pfad und Stufe tragbar, fixEq legt falsches ab':async(T,eq)=>{
  const p=await T.page({lv:50,cls:'krieger',path:'ritter',tier:1});
  const r=await p.evaluate(()=>{const R=__RW,a=R.addGear('s|p_ritter_1|0',0,true).g,b=R.addGear('s|p_ritter_2|0',0,true).g,c=R.addGear('s|p_berserker_1|0',0,true).g;
    const o=[R.canEquip(a),R.canEquip(b)!=='',R.canEquip(c)!==''];R.S.eq.kopf=b.u;R.fixEq();o.push(!R.S.eq.kopf);return o;});
  eq(r,['',true,true,true]);await p.context().close();},
 'Preise: Verkauf liegt immer unter Kauf, höhere Qualität/Stufe ist mehr wert':async(T,eq)=>{
  const p=await P(T);
  const bad=await p.evaluate(()=>{const R=__RW,o=[];
    for(const k in R.BUY)if(!(R.SELL[k]<R.BUY[k]))o.push('mat '+k);
    for(const g of R.GR){if(!(R.gSell({b:g.id,q:0,p:0})<R.gBuyPrice(g.id)))o.push('gear '+g.id);
      let last=0;for(let q=0;q<5;q++){const v=R.gVal({b:g.id,q,p:0});if(v<=last)o.push('q '+g.id);last=v;}
      last=0;for(let p=0;p<=10;p++){const v=R.gVal({b:g.id,q:0,p});if(v<last)o.push('p '+g.id);last=v;}}
    return o;});
  eq(bad,[]);await p.context().close();},
 'Klassenwechsel/fixGear: unpassende Ausrüstung wird abgelegt, bleibt im Beutel':async(T,eq)=>{
  const p=await T.page({lv:10,cls:'krieger'});
  const r=await p.evaluate(()=>{const R=__RW,w=R.addGear('w|schwert|1',0).g;R.S.cls='magier';R.fixGear();return [R.S.eq.waffe,R.S.gear.some(g=>g.u===w.u)];});
  eq(r,[undefined,true]);await p.context().close();}
};
