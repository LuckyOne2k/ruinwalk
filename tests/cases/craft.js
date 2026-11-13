const U=require('../util');
module.exports={
 'Rezepte: eindeutige IDs, positive ganzzahlige Kosten':async(T,eq)=>{
  const p=await T.page({lv:1});
  const bad=await p.evaluate(()=>{const R=__RW,ids=new Set(),o=[];
    for(const r of [...R.GR,...R.RECIPES]){if(ids.has(r.id))o.push('doppelt '+r.id);ids.add(r.id);for(const k in r.cost)if(!(Number.isInteger(r.cost[k])&&r.cost[k]>0))o.push(r.id+':'+k);}
    return o;});
  eq(bad,[]);await p.context().close();},
 'Werkzeug herstellen verbraucht genau die Kosten':async(T,eq)=>{
  const p=await T.page({lv:1,inv:{stock:4,stein:2,ranke:2}});await U.install(p);
  const r=await p.evaluate(()=>{const R=__RW;R.craft('axt');return [R.S.inv,R.S.tools.map(t=>[t.id,t.dur])];});
  eq([r[0].stock,r[0].stein||0,r[0].ranke||0,r[1]],[1,0,0,[['axt',15]]]);await p.context().close();},
 'Ohne Material kein Herstellen, nichts wird negativ':async(T,eq)=>{
  const p=await T.page({lv:1,inv:{stock:2,stein:2,ranke:2}});
  const r=await p.evaluate(()=>{const R=__RW;R.craft('axt');R.craft('trank');return [R.S.inv,R.S.tools.length];});
  eq(r,[{stock:2,stein:2,ranke:2},0]);await p.context().close();},
 'Ausrüstung herstellen: Level-Sperre, Verbrauch, Eintrag im Beutel':async(T,eq)=>{
  const p=await T.page({lv:5,cls:'krieger',inv:{eisenerz:50,holz:20,steinherz:10,drachenschuppe:10,ranke:10}});await U.install(p);
  const r=await p.evaluate(()=>{const R=__RW,a=JSON.stringify(R.S.inv);R.craftGear('a|kopf|schwer|3');const locked=a===JSON.stringify(R.S.inv)&&!R.S.gear.length;
    T.rand([0]);R.craftGear('w|schwert|1');return [locked,R.S.gear.length,R.S.inv.eisenerz,R.S.inv.holz];});
  eq(r,[true,1,46,18]);await p.context().close();},
 'Qualitätsverteilung beim Herstellen entspricht der Tabelle':async(T,eq)=>{
  const p=await T.page({lv:1});
  const r=await p.evaluate(()=>{const R=__RW,c=[0,0,0,0,0],N=20000;for(let i=0;i<N;i++)c[R.rollQ([70,24,5,1,0])]++;return c.map(x=>x/N);});
  eq(Math.abs(r[0]-.7)<.02&&Math.abs(r[1]-.24)<.02&&r[4]===0,true);await p.context().close();},
 'Beute-Tabellen: gültig und vollständig':async(T,eq)=>{
  const p=await T.page({lv:1});
  const bad=await p.evaluate(()=>{const R=__RW,o=[];
    for(const t in R.TIERS){if(R.DROPQ[t]===undefined&&t!=='area'&&t!=='boss'&&t!=='elite'&&t!=='rare'&&t!=='normal')o.push('DROPQ '+t);
      for(const tb of [R.DROPQ,R.RDROPQ])if(tb[t]&&(tb[t].length!==5||tb[t].reduce((a,b)=>a+b,0)<=0))o.push('tabelle '+t);
      if(!R.DROPT[t]||!R.DROPT[t].every(x=>x>=1&&x<=3))o.push('DROPT '+t);if(!(R.COIN[t]&&R.COIN[t][0]<=R.COIN[t][1]))o.push('COIN '+t);}
    return o;});
  eq(bad,[]);await p.context().close();}
};
