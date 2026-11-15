/* Phase A: Gebietsstufen, Heimat-Schutzring, Spawn-Sicherheit, Heimat-Umzug, Spielstand-Kompatibilität */
const U=require('../util');
module.exports={
 'Weltstufe: deterministisch, 1–5, Nachbarn höchstens 1 Stufe auseinander':async(T,eq)=>{
  const p=await T.page({lv:1});
  const r=await p.evaluate(()=>{const R=__RW;let mj=0,bad=0;const seen=new Set();
    for(let x=-60;x<60;x++)for(let y=-60;y<60;y++){const b=R.worldBand(x,y);seen.add(b);if(b<1||b>5)bad++;
      for(const [a,c] of [[1,0],[0,1],[1,1],[1,-1]])mj=Math.max(mj,Math.abs(b-R.worldBand(x+a,y+c)));}
    return {mj,bad,n:seen.size,again:R.worldBand(7,-9)===R.worldBand(7,-9)};});
  eq(r,{mj:1,bad:0,n:5,again:true});await p.context().close();},
 'Schutzring: Heimat+Nachbarn Stufe 1, Chebyshev, Abrundung, ab 8 Regionen Weltstufe':async(T,eq)=>{
  const p=await T.page({lv:1});
  const r=await p.evaluate(()=>{const R=__RW;R.S.home={rx:100,ry:-50,t:1};const o=[];
    const cap=[0,1,2,3,4,5,6,7,8,9].map(d=>R.homeCap(d));
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)if(R.effBand(100+dx,-50+dy)!==1)o.push('ring1');
    for(let dx=-12;dx<=12;dx++)for(let dy=-12;dy<=12;dy++){const d=Math.max(Math.abs(dx),Math.abs(dy)),e=R.effBand(100+dx,-50+dy),w=R.worldBand(100+dx,-50+dy);
      if(e!==Math.min(w,1+Math.floor(d/2)))o.push('formel');if(d>=8&&e!==w)o.push('ab8');if(e>w)o.push('über Welt');}
    return {cap,o:o.slice(0,3)};});
  eq(r,{cap:[1,1,2,2,3,3,4,4,5,5],o:[]});await p.context().close();},
 'Erreichbarkeit: von jedem Startort sind alle 5 Stufen innerhalb von 10 Regionen erreichbar':async(T,eq)=>{
  const p=await T.page({lv:1});
  const bad=await p.evaluate(()=>{const R=__RW;let n=0;
    for(let hx=-40;hx<40;hx+=2)for(let hy=-40;hy<40;hy+=2){R.S.home={rx:hx,ry:hy,t:1};const got=new Set();
      for(let dx=-10;dx<=10;dx++)for(let dy=-10;dy<=10;dy++)got.add(R.effBand(hx+dx,hy+dy));
      if(got.size<5)n++;}
    return n;});
  eq(bad,0);await p.context().close();},
 'Spawn-Sicherheit: nie Gegner über der effektiven Gebietsstufe, Heimat ohne Elite/Boss/Gebietsboss':async(T,eq)=>{
  const p=await T.page({lv:1});
  const r=await p.evaluate(()=>{const R=__RW,MIN=R.BAND_MIN,o=[];let seenTier={},homeMobs=0;
    for(const [hx,hy] of [[0,0],[5,5],[-9,3]]){R.S.home={rx:hx,ry:hy,t:1};R.S.test=false;R.cellCache.clear();
      const cx0=hx*12,cy0=hy*12;
      for(let dx=-60;dx<60;dx++)for(let dy=-60;dy<60;dy++){const cx=cx0+dx,cy=cy0+dy,rx=Math.floor(cx/12),ry=Math.floor(cy/12),eb=R.effBand(rx,ry);
        for(const e of R.cellEnts(cx,cy)){if(e.kind!=='mob')continue;const t=R.MOBS[e.type].tier;seenTier[t]=1;
          if(e.b!==eb)o.push('band '+e.id);if(MIN[t]>eb)o.push('zu stark '+t+' in '+eb);
          if(Math.max(Math.abs(rx-hx),Math.abs(ry-hy))<=1){homeMobs++;if(t!=='normal'&&t!=='rare')o.push('Heimat '+t);}}}
    }
    return {o:[...new Set(o)].slice(0,4),home:homeMobs>0,tiers:Object.keys(seenTier).sort().join()};});
  eq(r.o,[]);eq(r.home,true);eq(r.tiers,'boss,elite,normal,rare');await p.context().close();},
 'Gebietsbosse nur ab effektiver Stufe 4, skaliert und mit gültiger Gebiets-Stufe':async(T,eq)=>{
  const p=await T.page({lv:1});
  const r=await p.evaluate(()=>{const R=__RW;R.S.test=false;let n=0,o=[];
    R.S.home={rx:0,ry:0,t:1};
    for(let rx=-14;rx<=14;rx++)for(let ry=-14;ry<=14;ry++){
      const lat=(ry*12+6)*R.DLAT,lon=(rx*12+6)*R.DLON;R.setPos(lat,lon,5);
      for(const e of R.areaEnts()){const b=R.effBand(Math.floor(Math.floor(e.lon/R.DLON)/12),Math.floor(Math.floor(e.lat/R.DLAT)/12));n++;if(b<4||e.b!==b)o.push('Stufe '+b);
        const m=R.mobOf(e);if(!(m.hp>5000&&m.rec>=32))o.push('Werte');}
      if(n>300)break;}
    return {n:n>0,o:[...new Set(o)].slice(0,3)};});
  eq(r,{n:true,o:[]});await p.context().close();},
 'Skalierung: Stufe 1 unverändert, höhere Stufen stärker, Empfehlung passt zur Stufe':async(T,eq)=>{
  const p=await T.page({lv:1});
  const r=await p.evaluate(()=>{const R=__RW,o=[];
    for(const k in R.MOBS){const m=R.MOBS[k],t=m.tier;let prev=null;
      for(let b=1;b<=5;b++){if(R.BAND_MIN[t]>b)continue;const s=R.mobOf({type:k,b});
        if(b===1&&t!=='area'&&(s.hp!==m.hp||s.min!==m.min||s.xp!==m.xp))o.push('b1 '+k);
        if(prev&&t!=='area'&&(s.hp<=prev.hp||s.max<=prev.max))o.push('steigt nicht '+k+b);
        if(!(s.hp>0&&s.max>=s.min&&s.rec>=1))o.push('ungültig '+k+b);prev=s;}}
    const legacy=R.mobOf({type:'rohling'});return {o:o.slice(0,4),same:legacy===R.MOBS.rohling};});
  eq(r,{o:[],same:true});await p.context().close();},
 'Ressourcen folgen dem Lebensraum (Fels: viel Erz, Wald: viele Bäume), alle Typen bleiben möglich':async(T,eq)=>{
  const p=await T.page({lv:1});
  const r=await p.evaluate(()=>{const R=__RW,m=R.mulberry(5),cnt={};
    const pt=h=>{const c={};for(let i=0;i<4000;i++){const t=R.pickType(m,h);c[t]=(c[t]||0)+1;}return c;};
    return {f:pt('f'),w:pt('w'),g:pt('g'),none:Object.keys(pt('x')).length};});
  eq(r.f.erz>r.w.erz*3,true,'Erz Fels');eq(r.w.baum>r.f.baum*3,true,'Baum Wald');eq(r.g.kraut>r.f.kraut*3,true,'Kraut Wiese');
  eq(['f','w','g'].every(h=>Object.keys(r[h]).length===6),true,'alle Typen');eq(r.none,6);await p.context().close();},
 'Heimat: wird beim ersten echten GPS-Fix gesetzt, nie im Testmodus, nie automatisch überschrieben':async(T,eq)=>{
  const p=await T.page({lv:1});
  const r=await p.evaluate(()=>{const R=__RW;R.S.home=null;R.S.test=true;R.setPos(48.37,10.9,5);R.onPos({coords:{latitude:50,longitude:8,accuracy:5}});const a=R.S.home;
    R.S.test=false;R.onPos({coords:{latitude:48.37,longitude:10.9,accuracy:300}});const b=R.S.home;
    R.onPos({coords:{latitude:48.37,longitude:10.9,accuracy:10}});const c=R.S.home&&{...R.S.home};
    R.onPos({coords:{latitude:52.5,longitude:13.4,accuracy:10}});const d=R.S.home;
    return {a,b,c:!!c,same:JSON.stringify(c)===JSON.stringify(d)};});
  eq(r.a,null);eq(r.b,null);eq(r.c,true);eq(r.same,true);await p.context().close();},
 'Heimat-Umzug: 7 Tage Wartezeit, Bestätigung nötig, Testmodus gesperrt':async(T,eq)=>{
  const p=await T.page({lv:1});await U.install(p);
  const r=await p.evaluate(()=>{const R=__RW,out={};
    R.S.test=false;R.S.home={rx:1,ry:1,t:Date.now()};R.lastGps={lat:48.37,lon:10.9,acc:10};R.lastFixT=Date.now();
    T.tap('homemove');out.wait=JSON.stringify(R.S.home);
    R.S.home.t=Date.now()-8*864e5;const old=JSON.stringify(R.S.home);
    T.tap('homemove');out.armed=JSON.stringify(R.S.home)===old;       // erster Tipp: nur Bestätigung
    R.S.test=true;T.tap('homemove');out.test=JSON.stringify(R.S.home)===old;R.S.test=false;
    T.tap('homemove');out.moved=R.S.home.rx!==1&&Date.now()-R.S.home.t<5000;
    T.tap('homemove');T.tap('homemove');out.again=Date.now()-R.S.home.t<5000;
    return out;});
  eq(r.wait.includes('"rx":1'),true,'Wartezeit');eq(r.armed,true);eq(r.test,true);eq(r.moved,true);eq(r.again,true);await p.context().close();},
 'Spielstand: alter Stand ohne Heimat lädt, defekte Heimat wird verworfen, gültige bleibt':async(T,eq)=>{
  const p=await T.page({lv:1});
  const o=await p.evaluate(()=>{const R=__RW,b=JSON.parse(JSON.stringify(R.def()));delete b.home;
    const mk=h=>{const x=JSON.parse(JSON.stringify(b));x.home=h;return R.sanitize(x).home;};
    return {old:R.sanitize(b).home,bad:[mk('x'),mk({rx:'a',ry:1}),mk([1,2]),mk(5)],ok:mk({rx:3,ry:-4,t:123}),big:mk({rx:1e12,ry:-1e12,t:1}),lv:R.sanitize({lv:7}).lv};});
  eq(o.old,null);eq(o.bad,[null,null,null,null]);eq(o.ok,{rx:3,ry:-4,t:123});eq(o.big.rx,1e6);eq(o.lv,7);await p.context().close();}
};
