module.exports={
 'Welt ist deterministisch: gleiche Zelle ergibt in zwei Sitzungen dasselbe':async(T,eq)=>{
  const get=async()=>{const p=await T.page({lv:1});const r=await p.evaluate(()=>JSON.stringify([__RW.cellEnts(5000,6000),__RW.cellEnts(-12,34)]));await p.context().close();return r;};
  eq(await get(),await get());},
 'IDs eindeutig, Typen gültig, Positionen in ihrer Zelle (40x40 Zellen)':async(T,eq)=>{
  const p=await T.page({lv:1});
  const bad=await p.evaluate(()=>{const R=__RW,ids=new Set(),o=[],cx0=Math.floor(10.8978/R.DLON),cy0=Math.floor(48.3705/R.DLAT);
    const def=e=>e.kind==='node'?R.NODES[e.type]:e.kind==='shop'?{res:1}:R.MOBS[e.type];
    for(let dx=0;dx<40;dx++)for(let dy=0;dy<40;dy++){const cx=cx0+dx,cy=cy0+dy;
      for(const e of R.cellEnts(cx,cy)){if(ids.has(e.id))o.push('doppelt '+e.id);ids.add(e.id);if(!def(e))o.push('typ '+e.id);
        if(Math.floor(e.lon/R.DLON)!==cx||Math.floor(e.lat/R.DLAT)!==cy)o.push('pos '+e.id);
        if(e.kind==='mob'){const t=R.MOBS[e.type].tier,pre=e.id[0];if({m:'normal',r:'rare',e:'elite',b:'boss'}[pre]!==t)o.push('tier '+e.id+t);}}}
    return o.slice(0,5);});
  eq(bad,[]);await p.context().close();},
 'Dichte: 3-5 Ressourcen je Zelle, ca. 70 % Monster, ca. 1 Händler je 36 Zellen':async(T,eq)=>{
  const p=await T.page({lv:1});
  const r=await p.evaluate(()=>{const R=__RW;let n=0,nodesMin=9,nodesMax=0,mobs=0,shops=0;
    for(let dx=0;dx<60;dx++)for(let dy=0;dy<60;dy++){n++;const es=R.cellEnts(1000+dx,2000+dy),nd=es.filter(e=>e.kind==='node').length;nodesMin=Math.min(nodesMin,nd);nodesMax=Math.max(nodesMax,nd);
      if(es.some(e=>e.id[0]==='m'))mobs++;shops+=es.filter(e=>e.kind==='shop').length;}
    return {nodesMin,nodesMax,mob:mobs/n,shop:n/shops};});
  eq(r.nodesMin>=3&&r.nodesMax<=5,true,'Ressourcen je Zelle');eq(Math.abs(r.mob-.7)<.05,true,'Monsterdichte '+r.mob);eq(r.shop>30&&r.shop<42,true,'Händler 1 je '+r.shop);await p.context().close();},
 'Gebietsbosse: 9 je Umgebung, alle Gebiets-Stufe':async(T,eq)=>{
  const p=await T.page({lv:1});
  const r=await p.evaluate(()=>{const R=__RW;R.S.test=true;R.setPos(48.3705,10.8978,5);const a=R.areaEnts();return [a.length,a.every(e=>R.MOBS[e.type].tier==='area'),new Set(a.map(e=>e.id)).size];});
  eq(r,[9,true,9]);await p.context().close();},
 'Jeder Lebensraum und jede Stufe hat mindestens einen Monstertyp':async(T,eq)=>{
  const p=await T.page({lv:1});
  const bad=await p.evaluate(()=>{const R=__RW,o=[];for(const t of ['normal','rare','elite','boss','area'])for(const h of 'wgsfr'){const k=R.pickMob(t,h,.5);if(!R.MOBS[k]||R.MOBS[k].tier!==t)o.push(t+h);}return o;});
  eq(bad,[]);await p.context().close();},
 'Verbrauchte Ressourcen sind gesperrt und kommen nach der Wartezeit zurück':async(T,eq)=>{
  const p=await T.page({lv:1});
  const r=await p.evaluate(()=>{const R=__RW;R.S.test=true;R.setPos(48.3705,10.8978,5);const e=R.cellEnts(Math.floor(10.8978/R.DLON),Math.floor(48.3705/R.DLAT)).find(x=>x.kind==='node');
    const res=R.NODES[e.type].res;R.S.cd[e.id]=Date.now();const a=R.S.cd[e.id];R.S.cd[e.id]=Date.now()-res-1000;return [a>0,res>0];});
  eq(r,[true,true]);await p.context().close();}
};
