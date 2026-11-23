/* Quest-Grundlage (Paket 1b): Quest-IDs, Belohnungsgleichheit, Ketten, gemeinsame Auswertung */
const open=async(T,seed)=>{const p=await T.page(seed);await p.evaluate(()=>{});return p;};
const ST=(o={})=>({col:{},nodes:{},kills:0,crafted:{},kt:{normal:0,rare:0,elite:0,boss:0,area:0},walk:0,night:0,faints:0,...o});
module.exports={
 'Quest-IDs: unbekannte bleiben erhalten, ungültige und doppelte fallen weg, Obergrenze 1000':async(T,eq)=>{
  const p=await open(T,{lv:3});
  const r=await p.evaluate(()=>{const R=__RW,san=o=>{const x=R.sanitize(Object.assign(R.def(),o));return [x.qdone,x.qready];};
    return {mix:san({qdone:['q1','st1:k2:q1','q1',5,null,'',' q2','Q3','a'.repeat(81),{id:'q2'}],qready:['q2','st1:k2:q1','st1:k2:q2']}),
      kaputt:san({qdone:'q1',qready:{}}),viele:san({qdone:Array.from({length:1200},(_,i)=>'x'+i)})[0].length,
      bisher:(()=>{const x=R.sanitize(Object.assign(R.def(),{qdone:['q1','q2'],qready:['q3']}));return R.syncHash(x)===R.syncHash(R.sanitize(JSON.parse(JSON.stringify(x))));})()};});
  eq(r,{mix:[['q1','st1:k2:q1'],['q2','st1:k2:q2']],kaputt:[[],[]],viele:1000,bisher:true});await p.context().close();},
 'Unbekannte Quest-IDs überstehen Laden und Speichern; Abzeichen zählt nur bekannte, abholbereite Quests':async(T,eq)=>{
  const p=await open(T,{lv:3,qdone:['q1','st9:neu'],qready:['st9:bereit'],stats:ST({col:{stock:3,stein:2,ranke:2},crafted:{axt:1}})});
  const r=await p.evaluate(()=>{const R=__RW;R.save();R.hud();const raw=JSON.parse(localStorage.getItem('ruinwalk_v1'));
    const b1=document.querySelector('#qb').textContent;R.S.qready.push('q2');R.hud();
    return {d:raw.qdone,rd:raw.qready,b1,b2:document.querySelector('#qb').textContent,known:R.readyQuests().map(q=>q.id)};});
  eq(r,{d:['q1','st9:neu'],rd:['st9:bereit'],b1:'0',b2:'1',known:['q2']});eq(p.errors,[]);await p.context().close();},
 'Belohnungen q1–q4: giveReward wirkt exakt wie die bisherigen Funktionen, Texte unverändert':async(T,eq)=>{
  const p=await open(T,{lv:1,xp:35,cu:7,inv:{trank:1}});
  const r=await p.evaluate(()=>{const R=__RW,base=JSON.stringify(R.S);
    const alt={q1:()=>{R.addXP(10);R.earn(30);},q2:()=>{R.add('trank',2);R.earn(50);},q3:()=>{R.addXP(20);R.earn(80);},q4:()=>{R.addXP(30);R.earn(150);}};
    const altTxt={q1:'10 XP · :i_kupfer:30',q2:'2 Heiltränke · :i_kupfer:50',q3:'20 XP · :i_kupfer:80',q4:'30 XP · :i_silber:1 :i_kupfer:50'};
    const snap=()=>{const o=JSON.parse(JSON.stringify(R.S));delete o.last;return JSON.stringify(o);};
    const out={};for(const q of R.QUESTS){R.S=JSON.parse(base);alt[q.id]();const a=snap();R.S=JSON.parse(base);R.giveReward(q.r);const b=snap();
      R.S=JSON.parse(base);const vorher=snap();
      out[q.id]={gleich:a===b,veraendert:a!==vorher,txt:q.rt===altTxt[q.id]&&R.rewardText(q.r)===altTxt[q.id]};}
    // Reihenfolge wie bisher (Erfahrung, Gegenstände, Kupfer): im Zustand nicht unterscheidbar, daher am Code der Funktion geprüft
    const src=R.giveReward.toString(),ix=['addXP(','add(k','earn('].map(x=>src.indexOf(x));out.reihenfolge=ix.every(i=>i>=0)&&ix[0]<ix[1]&&ix[1]<ix[2];
    return out;});
  for(const k of ['q1','q2','q3','q4'])eq(r[k],{gleich:true,veraendert:true,txt:true},k);eq(r.reihenfolge,true,'Reihenfolge addXP → add → earn');await p.context().close();},
 'Abholen über das Questmenü: Belohnung wie bisher, Quest wandert nach qdone':async(T,eq)=>{
  const p=await open(T,{lv:1,xp:0,cu:0,qdone:['q1'],qready:['q2']});
  const r=await p.evaluate(()=>{const R=__RW;R.claimQuest('q2');R.claimQuest('q2');R.claimQuest('st9:unbekannt');return {inv:R.S.inv.trank,cu:R.S.cu,d:R.S.qdone,rd:R.S.qready};});
  eq(r,{inv:2,cu:50,d:['q1','q2'],rd:[]});eq(p.errors,[]);await p.context().close();},
 'Ketten: q1–q4 bleiben der Reihe nach, eine zweite Kette läuft unabhängig':async(T,eq)=>{
  const p=await open(T,{lv:3,stats:ST({nodes:{baum:3},kills:2})});
  const r=await p.evaluate(()=>{const R=__RW;const vor=R.S.qready.slice();
    R.QUESTS.push({id:'tx1',k:'testkette',t:'T1',d:'',z:[['Bäume fällen','nodes.baum',1]],r:{xp:1},rt:''},{id:'tx2',k:'testkette',t:'T2',d:'',z:[['Siege','kills',99]],r:{xp:1},rt:''},{id:'tx3',k:'testkette',t:'T3',d:'',z:[['Siege','kills',1]],r:{xp:1},rt:''});
    R.checkQuests();const a=R.S.qready.slice();
    R.S.qdone.push('q1');R.checkQuests();const b=R.S.qready.slice();
    // Anzeige: je Kette ist genau die erste offene Quest aktiv, spätere sind gesperrt
    R.S.qdone=[];R.S.qready=[];R.openSheet('quests');const box=[...document.querySelectorAll('#shB .q')].map(x=>x.querySelector('b').textContent+(x.classList.contains('act2')?':aktiv':x.textContent.includes('🔒')?':gesperrt':':?'));
    R.QUESTS.splice(4);return {vor,a,b,box};});
  // q2/q3 erfüllt, aber q1 offen -> gesperrt; Testkette: tx1 bereit, tx2 offen sperrt tx3 trotz erfülltem Ziel
  eq(r,{vor:[],a:['tx1'],b:['tx1','q2','q3'],box:['Erste Schritte:aktiv','Holzfäller:gesperrt','Jäger:gesperrt','Bergmann:gesperrt','T1:aktiv','T2:gesperrt','T3:gesperrt']});await p.context().close();},
 'Ziele als Daten: Anzeige und Prüfung nutzen dieselbe Auswertung wie die bisherigen Ziele':async(T,eq)=>{
  const p=await open(T,{lv:3,stats:ST({col:{stock:5,stein:1},nodes:{baum:2,erz:7},kills:9,crafted:{axt:1}})});
  const r=await p.evaluate(()=>{const R=__RW,s=R.S.stats;
    const alt={q1:[['Stöcke sammeln',s.col.stock||0,3],['Kleine Steine sammeln',s.col.stein||0,2],['Ranken sammeln',s.col.ranke||0,2],['Holzfälleraxt herstellen',s.crafted.axt||0,1]],
      q2:[['Bäume fällen',s.nodes.baum||0,3]],q3:[['Monster besiegen',s.kills||0,2]],q4:[['Spitzhacke herstellen',s.crafted.spitzhacke||0,1],['Eisenerz abbauen',s.nodes.erz||0,2]]};
    R.openSheet('quests');const html=document.querySelector('#shB')?document.querySelector('#shB').innerHTML:document.body.innerHTML;
    return {gleich:R.QUESTS.every(q=>JSON.stringify(R.qGoals(q))===JSON.stringify(alt[q.id])),anzeige:html.includes('Stöcke sammeln 3/3')&&html.includes('Kleine Steine sammeln 1/2'),
      unbekannt:[R.qVal('gibtsnicht'),R.qVal('col.nix'),R.qVal('kt.rare')]};});
  eq(r,{gleich:true,anzeige:true,unbekannt:[0,0,0]});eq(p.errors,[]);await p.context().close();},
};
