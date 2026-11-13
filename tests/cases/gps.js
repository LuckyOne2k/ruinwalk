module.exports={
 'Laufstrecke: echtes Gehen (1,4 m je GPS-Update) wird gezählt':async(T,eq)=>{
  const p=await T.page({lv:1});
  const r=await p.evaluate(()=>{const R=__RW;R.S.test=false;R.S.stats.walk=0;let lat=48.37;for(let i=0;i<100;i++){lat+=1.4/111320;R.countWalk(lat,10.9,5);}return R.S.stats.walk;});
  eq(r>=120&&r<=140,true,'gezählt '+r);await p.context().close();},
 'Laufstrecke: Stehen mit GPS-Rauschen zählt nicht':async(T,eq)=>{
  const p=await T.page({lv:1});
  const r=await p.evaluate(()=>{const R=__RW;R.S.test=false;R.S.stats.walk=0;for(let i=0;i<2000;i++){const a=Math.random()*6.283,d=Math.random()*10;R.countWalk(48.37+Math.sin(a)*d/111320,10.9+Math.cos(a)*d/74000,15);}return R.S.stats.walk;});
  eq(r,0);await p.context().close();},
 'Laufstrecke: GPS-Sprünge, schlechte Genauigkeit und Testmodus zählen nicht':async(T,eq)=>{
  const p=await T.page({lv:1});
  const r=await p.evaluate(()=>{const R=__RW;R.S.test=false;R.S.stats.walk=0;R.countWalk(48.37,10.9,5);R.countWalk(48.38,10.9,5);R.countWalk(48.3801,10.9,200);R.countWalk(48.3802,10.9,200);
    R.S.test=true;R.countWalk(48.40,10.9,5);R.countWalk(48.4001,10.9,5);return R.S.stats.walk;});
  eq(r,0);await p.context().close();},
 'GPS-Ausfall wird erkannt und nach Rückkehr beendet':async(T,eq)=>{
  const p=await T.page({lv:1});
  const r=await p.evaluate(()=>{const R=__RW;R.S.test=false;R.setWatch(1);R.setLastFix(Date.now()-60000);R.gpsWatch();const a=R.gpsLost,t=document.querySelector('#gps').textContent;
    R.setLastFix(Date.now());R.gpsWatch();return [a,/Kein GPS/.test(t),R.gpsLost];});
  eq(r,[true,true,false]);await p.context().close();},
 'Bei GPS-Ausfall greifen Monster nicht an, danach wieder':async(T,eq)=>{
  const p=await T.page({lv:10,cls:'krieger',hp:500});await require('../util').install(p);
  const r=await p.evaluate(()=>{const R=__RW,id=T.place('rohling');T.rand([],.99);R.S.test=false;R.eng.set(id,Date.now());R.gpsLost=true;const h0=R.S.hp;
    for(let i=0;i<8;i++)R.roamTick(1);const a=R.S.hp===h0;R.gpsLost=false;for(let i=0;i<8;i++){R.eng.set(id,Date.now());R.roamTick(1);}return [a,R.S.hp<h0];});
  eq(r,[true,true]);await p.context().close();},
 'GPS: Watch-ID 0 gilt als aktive Ortung (Ausfall wird erkannt)':async(T,eq)=>{
  const p=await T.page({lv:1});
  const r=await p.evaluate(()=>{const R=__RW;R.S.test=false;R.setWatch(0);R.setLastFix(Date.now()-60000);R.gpsWatch();return [R.gpsLost,/Kein GPS/.test(document.querySelector('#gps').textContent)];});
  eq(r,[true,true]);await p.context().close();},
 'GPS: Ortung nicht gestartet (watchId null) meldet keinen Ausfall':async(T,eq)=>{
  const p=await T.page({lv:1});
  const r=await p.evaluate(()=>{const R=__RW;R.S.test=false;R.setWatch(null);R.setLastFix(0);R.gpsWatch();return R.gpsLost;});
  eq(r,false);await p.context().close();},
 'GPS: kein einziger Fix nach Start -> Ausfall nach 45 s und Neustart der Ortung':async(T,eq)=>{
  const p=await T.page({lv:1});
  const r=await p.evaluate(()=>{const R=__RW;let starts=0,cleared=[];
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(){starts++;return 0;},clearWatch(id){cleared.push(id);}}});
    R.S.test=false;R.startGPS();const s1=starts;R.gpsWatch();const early=R.gpsLost;
    R.setWatchStart(Date.now()-70000);R.gpsWatch();const lost=R.gpsLost,txt=document.querySelector('#gps').textContent;
    const restarted=starts===2&&cleared.includes(0)&&R.watchId===0;
    R.gpsWatch();const noSpam=starts===2;           // Neustart nur alle 60 s
    R.onPos({coords:{latitude:48.37,longitude:10.9,accuracy:5}});R.gpsWatch();
    return {s1,early,lost,kein:/Kein GPS/.test(txt),restarted,noSpam,back:R.gpsLost};});
  eq(r,{s1:1,early:false,lost:true,kein:true,restarted:true,noSpam:true,back:false});await p.context().close();},
 'GPS: verweigerte Berechtigung -> klare Meldung, kein Neustart, Monster greifen nicht an':async(T,eq)=>{
  const p=await T.page({lv:1});
  const r=await p.evaluate(()=>{const R=__RW;let starts=0;
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(){starts++;return 0;},clearWatch(){}}});
    R.S.test=false;R.startGPS();R.onErr({code:1});
    const t=()=>document.querySelector('#gps').textContent;const a=[R.gpsDenied,R.gpsLost,R.watchId,/verweigert/.test(t())];
    R.setLastFix(Date.now()-120000);for(let i=0;i<3;i++)R.gpsWatch();
    const b=[starts,/verweigert/.test(t()),!/Kein GPS/.test(t())];
    document.querySelector('#gps').textContent='';R.gpsWatch();const c=/verweigert/.test(t());
    R.startGPS();const d=[starts,R.gpsDenied];R.onPos({coords:{latitude:48.37,longitude:10.9,accuracy:5}});R.gpsWatch();
    return {a,b,c,d,after:[R.gpsDenied,R.gpsLost]};});
  eq(r,{a:[true,true,null,true],b:[1,true,true],c:true,d:[2,false],after:[false,false]});await p.context().close();}
};
