/* D4 – Konto löschen: nur die kritischen Fälle (Ablauf, Fehler, unklarer Netzstand, Datenintegrität, Passwortschutz). Funktion ist im normalen Spiel bis D6 ausgeblendet. */
const fake=require('../fake_supabase');
const PW='Gut#Pass1',CID='c0000000-0000-4000-8000-0000000000a1';
const tap=(a,d)=>`(()=>{const b=document.createElement('button');b.dataset.a=${JSON.stringify(a)};Object.assign(b.dataset,${JSON.stringify(d||{})});document.body.appendChild(b);b.click();b.remove();})()`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(f,what,ms=12000)=>{const t=Date.now();let v;while(Date.now()-t<ms){v=await f();if(v)return v;await sleep(100);}throw new Error('Zeit überschritten: '+what);};
const acct=p=>p.evaluate(()=>{const e=document.querySelector('#acct');return e.style.display==='none'?'':e.innerText;});
const LOCAL={lv:7,cls:'krieger',inv:{holz:3},name:'Held'};
/* angemeldet, mit lokalem Spielstand, Cloud-Zwischenspeicher eines Charakters und Erkundungsdaten; Dialog geöffnet */
async function mk(T,opt){
  opt=opt||{};const st=fake(),u=st.addUser('anna@test.de',PW,'Anna_1');
  st.chars.push({id:CID,account:u.id,slot:1,name:'Wolke',data:{lv:12,cls:'jaeger',name:'Wolke',inv:{holz:5},stats:{kills:1,walk:0},tools:[],cid:CID},cls:'jaeger',level:12,version:3});
  const p=await T.page(LOCAL,undefined,undefined,pg=>st.install(pg));
  await p.evaluate(()=>{localStorage.setItem('ruinwalk_hab',JSON.stringify({k:{a:1}}));localStorage.setItem('ruinwalk_v1_s2',JSON.stringify({lv:3,cls:'jaeger',inv:{},stats:{kills:0,walk:0},tools:[],name:'Zwei'}));});
  await p.evaluate(tap('acct'));await p.waitForSelector('#ac_email');await p.fill('#ac_email','anna@test.de');await p.fill('#ac_pw',PW);await p.evaluate(tap('aclog'));
  await until(async()=>{const t=await acct(p);return t.includes('Cloud-Charakterplätze')&&!t.includes('Lade Cloud');},'Konto geladen');
  const snap=()=>p.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(/^ruinwalk_(v1_s|cc_|cm_)/.test(k))o[k]=localStorage.getItem(k);}const a=JSON.parse(localStorage.getItem('ruinwalk_v1')||'null')||{};o.__aktiv=[a.lv,a.name,JSON.stringify(a.inv)].join('|');return Object.fromEntries(Object.entries(o).sort());});
  const before=await snap();
  await p.evaluate(tap('acdel'));await p.waitForSelector('#ac_dn');
  return {p,st,u,snap,before};}
const fill=async(p,o)=>{o=Object.assign({ck:true,name:'Anna_1',pw:PW,hab:false},o);
  await p.fill('#ac_dn',o.name);await p.fill('#ac_dpw',o.pw);if(o.ck)await p.check('#ac_dck');if(o.hab)await p.check('#ac_dhab');};
const go=p=>p.evaluate(()=>document.querySelector('#ac_dgo').click());

module.exports={
 'Konto löschen: Erfolg – Login dann delete_account, Anmeldung weg, lokale Spielstände und Zwischenspeicher byte-gleich, Hinweis, Kopie als „ohne Cloud-Verbindung“ gekennzeichnet':async(T,eq)=>{
  const {p,st,snap,before}=await mk(T);await p.evaluate(tap('acexport'));
  // Zwischenspeicher eines Cloud-Charakters dieses Kontos (Normalfall nach dem Spielen)
  await p.evaluate(([id,uid])=>{localStorage.setItem('ruinwalk_cc_'+id,JSON.stringify({lv:12,cls:'jaeger',name:'Wolke',inv:{holz:5},stats:{kills:1,walk:0},tools:[],cid:id}));
    localStorage.setItem('ruinwalk_cm_'+id,JSON.stringify({v:1,cloudId:id,uid,slot:1,baseVersion:3,dirty:false,syncedAt:1,baseHash:'x:1'}));},[CID,st.users[0].id]);
  const b2=await snap();await p.evaluate(tap('acv',{v:'home'}));await p.evaluate(tap('acdel'));await p.waitForSelector('#ac_dn');
  eq(await p.evaluate(()=>document.querySelector('#ac_dgo').disabled),true,'ohne Eingaben gesperrt');
  await fill(p);eq(await p.evaluate(()=>document.querySelector('#ac_dgo').disabled),false);
  const n0=st.calls.length;
  await Promise.all([p.waitForNavigation(),go(p)]);await p.waitForFunction(()=>window.__RW);
  const c=st.calls.slice(n0).map(x=>x.m+' '+x.path);
  eq(c.filter(x=>/token|delete_account/.test(x)),['POST /auth/v1/token','POST /rest/v1/rpc/delete_account'],'Reihenfolge');
  eq(st.users.length,0);eq(await p.evaluate(()=>localStorage.getItem('ruinwalk_auth')),null);
  const a=await snap();eq(a,b2,'lokale Plätze, Backups und Zwischenspeicher byte-gleich');
  eq(await p.evaluate(()=>localStorage.getItem('ruinwalk_hab')),'{"k":{"a":1}}','Erkundungsdaten bleiben');
  eq(await p.evaluate(()=>document.querySelector('#startNote').innerText.includes('Konto wurde gelöscht')),true);
  await p.evaluate(tap('chars'));const t=await p.evaluate(()=>document.querySelector('#chars').innerText);
  eq([t.includes('ohne aktive Cloud-Verbindung'),t.includes('Wolke')],[true,true]);eq(p.errors,[]);await p.context().close();},
 'Konto löschen: mit Häkchen werden auch die Erkundungsdaten entfernt, Charaktere bleiben':async(T,eq)=>{
  const {p,snap,before}=await mk(T);await fill(p,{hab:true});await Promise.all([p.waitForNavigation(),go(p)]);await p.waitForFunction(()=>window.__RW);
  eq(await p.evaluate(()=>localStorage.getItem('ruinwalk_hab')),null);eq(await snap(),before);await p.context().close();},
 'Konto löschen: falsches Passwort, falscher Name, OTP-Sitzung, abgelaufenes Fenster → nichts gelöscht, Sitzung bleibt':async(T,eq)=>{
  const {p,st,snap,before}=await mk(T);
  await fill(p,{pw:'Falsch#Pass9'});let d0=st.delCalls||0;await go(p);
  await until(async()=>(await acct(p)).includes('Passwort ist falsch'),'falsches Passwort');eq([st.users.length,st.delCalls||0],[1,d0]);
  await p.evaluate(tap('acdel'));await p.waitForSelector('#ac_dn');
  await fill(p,{name:'Jemand_Anders'});await go(p);await until(async()=>(await acct(p)).includes('Benutzername stimmt nicht'),'falscher Name');eq([st.users.length,st.delCalls||0],[1,d0],'lokal abgelehnt, kein Aufruf');
  st.amrMethod='otp';await p.evaluate(tap('acdel'));await p.waitForSelector('#ac_dn');await fill(p);await go(p);
  await until(async()=>(await acct(p)).includes('Sicherheitsprüfung'),'OTP');eq([st.users.length,st.delCalls||0],[1,d0],'OTP-Sitzung: kein delete_account');st.amrMethod=null;
  st.del={mode:'reauth'};await p.evaluate(tap('acdel'));await p.waitForSelector('#ac_dn');await fill(p);await go(p);
  await until(async()=>(await acct(p)).includes('Sicherheitsfrist'),'abgelaufen');eq(st.users.length,1);
  eq(await p.evaluate(()=>!!localStorage.getItem('ruinwalk_auth')),true,'Sitzung bleibt');eq(await snap(),before);eq(p.errors,[]);await p.context().close();},
 'Konto löschen: Verbindung bricht ab – nie fälschlich „gelöscht“; nur bei bewiesener Löschung Erfolgsweg':async(T,eq)=>{
  // a) Abbruch vor dem Server, Konto besteht → klare Meldung, kein Erfolg
  const a=await mk(T);a.st.del={mode:'net_before'};await fill(a.p);await go(a.p);
  await until(async()=>(await acct(a.p)).includes('Dein Konto besteht weiter'),'Konto besteht');eq([a.st.users.length,await a.p.evaluate(()=>!!localStorage.getItem('ruinwalk_auth'))],[1,true]);await a.p.context().close();
  // b) Antwort geht verloren, Löschung ist aber passiert, Prüfung beweist es → Erfolgsweg
  const b=await mk(T);b.st.del={mode:'net_after'};await fill(b.p);await Promise.all([b.p.waitForNavigation(),go(b.p)]);await b.p.waitForFunction(()=>window.__RW);
  eq(await b.p.evaluate(()=>localStorage.getItem('ruinwalk_auth')),null);eq(await b.snap(),b.before);await b.p.context().close();
  // c) Antwort verloren UND Prüfung nicht möglich → unklar: nicht als gelöscht behandelt, Anmeldung bleibt
  const c=await mk(T);c.st.del={mode:'net_after'};await c.p.route('**/auth/v1/user',r=>r.abort());await fill(c.p);await go(c.p);
  await until(async()=>(await acct(c.p)).includes('nicht sicher'),'unklar');eq(await c.p.evaluate(()=>!!localStorage.getItem('ruinwalk_auth')),true);
  eq(await c.p.evaluate(()=>document.querySelector('#startNote').style.display),'none');eq(await c.snap(),c.before);await c.p.context().close();},
 'Konto löschen: Doppelklick löst genau eine Anmeldung und eine Löschung aus; Passwort wird nirgends gespeichert oder protokolliert':async(T,eq)=>{
  const {p,st}=await mk(T);const logs=[];p.on('console',m=>logs.push(m.text()));
  await fill(p);const n0=st.calls.length;
  await Promise.all([p.waitForNavigation(),p.evaluate(()=>{const b=document.querySelector('#ac_dgo');b.click();b.click();document.querySelector('#acct').dispatchEvent(new Event('click'));})]);
  await p.waitForFunction(()=>window.__RW);
  const c=st.calls.slice(n0);eq(c.filter(x=>x.path==='/auth/v1/token'&&x.q.includes('password')).length,1);eq(st.delCalls,1);
  const dump=await p.evaluate(()=>JSON.stringify([localStorage,sessionStorage,location.href,document.body.innerHTML]));
  eq(dump.includes(PW),false,'Passwort nicht im Speicher/DOM');eq(logs.join('\n').includes(PW),false);
  eq(c.filter(x=>JSON.stringify(x.body).includes(PW)).map(x=>x.path),['/auth/v1/token'],'Passwort nur an den Anmelde-Endpunkt');await p.context().close();},
 'Konto löschen: nach der Löschung scheitert die Anmeldung mit altem Konto, gleicher Name/E-Mail lässt sich neu registrieren; Export enthält keine Tokens':async(T,eq)=>{
  const {p,st}=await mk(T);
  const [dl]=await Promise.all([p.waitForEvent('download'),p.evaluate(tap('acexport'))]);const f=await dl.createReadStream();let txt='';for await(const ch of f)txt+=ch;
  const j=JSON.parse(txt);eq([j.konto.email,j.charaktere.length,j.charaktere[0].character_name,/ruinwalk_konto_export_\d{4}-\d{2}-\d{2}\.json/.test(dl.suggestedFilename())],['anna@test.de',1,'Wolke',true]);
  eq(/access_token|refresh_token|Bearer|Gut#Pass1/.test(txt),false,'keine Tokens/Passwörter im Export');
  await p.evaluate(tap('acdel'));await p.waitForSelector('#ac_dn');await fill(p);await Promise.all([p.waitForNavigation(),go(p)]);await p.waitForFunction(()=>window.__RW);
  await p.evaluate(tap('acct'));await p.waitForSelector('#ac_email');await p.fill('#ac_email','anna@test.de');await p.fill('#ac_pw',PW);await p.evaluate(tap('aclog'));
  await until(async()=>(await acct(p)).includes('E-Mail oder Passwort ist falsch'),'alter Zugang');
  await p.evaluate(tap('acv',{v:'register'}));await p.waitForSelector('#ac_user');await p.fill('#ac_user','Anna_1');await p.fill('#ac_email','anna@test.de');await p.fill('#ac_pw',PW);await p.fill('#ac_pw2',PW);await p.evaluate(tap('acreg'));
  await until(async()=>st.users.some(u=>u.username==='Anna_1'),'Neuregistrierung');await p.context().close();},
 'Konto löschen: im normalen Spiel (ohne Test-Schalter) ist der Löschbereich bis D6 nicht sichtbar':async(T,eq)=>{
  const r=await T.page(LOCAL,undefined,undefined);
  eq(await r.evaluate(()=>[typeof DEL_ON,document.querySelector('#acct').innerHTML.includes('acdel')]).catch(()=>null)!==undefined,true);
  const src=require('fs').readFileSync(require('path').join(__dirname,'..','..','index.html'),'utf8');
  eq(/const DEL_ON=!!window\.__RW_TEST/.test(src),true,'Schalter hängt nur am Test-Schalter');await r.context().close();}
};
