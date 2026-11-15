/* D1 – Datenfluss belegen: welche Hosts/Endpunkte/Daten gehen in welchem Szenario nach außen?
   Alle Anfragen werden mitgeschnitten (nichts erreicht das echte Internet), gegen eine Whitelist geprüft und in einen Bericht geschrieben
   (Umgebungsvariable DATENFLUSS_BERICHT=<Pfad>). Ein neuer, unbekannter Host oder Koordinaten in Anfragen lassen den Test fehlschlagen. */
const fs=require('fs'),path=require('path');
const fake=require('../fake_supabase');
const ROOT=path.join(__dirname,'..','..');
const LAT=48.370512,LON=10.897834;                       // Teststandort (Augsburg); darf nirgends exakt auftauchen
const ALLOWED={'unpkg.com':'Leaflet (Skript/CSS)','overpass-api.de':'Lebensraumdaten (Overpass)','malbiahllucctiafzydv.supabase.co':'Konto/Cloud (Supabase)','tile.openstreetmap.org':'Kartenkacheln (OSM)'};
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
const tap=(a,d)=>`(()=>{const b=document.createElement('button');b.dataset.a=${JSON.stringify(a)};Object.assign(b.dataset,${JSON.stringify(d||{})});document.body.appendChild(b);b.click();b.remove();})()`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const STUB=fs.readFileSync(path.join(__dirname,'..','leaflet-stub.js'),'utf8');
const REPORT={};
async function scenario(T,name,opts,fn){
  const ctx=await T.browser.newContext({viewport:{width:390,height:800},geolocation:opts.geo?{latitude:LAT,longitude:LON,accuracy:12}:undefined,permissions:opts.geo?['geolocation']:[]});
  const p=await ctx.newPage();p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));
  const reqs=[],own=new URL(T.url).host;
  p.on('request',r=>{const u=new URL(r.url());const h=r.headers();
    reqs.push({host:u.host,own:u.host===own,method:r.method(),path:u.pathname,query:u.search,type:r.resourceType(),body:r.postData()||'',referer:h.referer||null,hasAuth:!!h.authorization,apikey:h.apikey||null,cookie:!!h.cookie});});
  const st=fake();await st.install(p);
  await p.route('**/unpkg.com/**',r=>r.request().url().endsWith('.js')?r.fulfill({body:STUB,contentType:'application/javascript'}):r.fulfill({body:'',contentType:'text/css'}));
  await p.route(/overpass-api\.de/,r=>r.fulfill({status:200,contentType:'application/json',body:'{"elements":[]}'}));
  await p.route(/tile\.openstreetmap\.org/,r=>r.fulfill({status:200,contentType:'image/png',body:PNG}));
  await p.addInitScript(()=>{window.__RW_TEST=true;});
  await p.goto(T.url+'/index.html');await p.waitForFunction(()=>window.__RW);
  await fn(p,st);await sleep(400);
  const ext=reqs.filter(r=>!r.own);
  const storage=await p.evaluate(()=>({ls:Object.keys(localStorage).map(k=>k.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g,'<id>').replace(/_\d{10,}$/,'_<ts>')),ss:Object.keys(sessionStorage)}));
  const cookies=await ctx.cookies();
  REPORT[name]={hosts:[...new Set(ext.map(r=>r.host))].sort(),requests:ext.map(r=>({host:r.host,method:r.method,path:r.path,query:r.query.replace(/(redirect_to=)[^&]*/,'$1<Seite>'),bodyBytes:r.body.length,bodyKeys:keys(r.body),referer:r.referer,hasAuth:r.hasAuth,apikey:r.apikey&&r.apikey.slice(0,16)+'…'})),ownRequests:reqs.filter(r=>r.own).length,cookies:cookies.length,storage,errors:p.errors};
  const all=JSON.stringify(reqs.map(r=>[r.host,r.path,r.query,r.body]));
  await ctx.close();return {reqs,ext,all,storage,cookies,errors:p.errors,st};}
function keys(b){try{const j=JSON.parse(b);return Object.keys(j).sort().concat(j.data&&typeof j.data==='object'?['data.'+Object.keys(j.data).join('+')]:[]);}catch(e){return b?['(Formular/Text)']:[];}}
const hostsOk=(eq,r)=>eq(r.ext.map(x=>x.host).filter(h=>!ALLOWED[h]),[],'unbekannte Hosts');
const noCoords=(eq,r)=>{eq(/48\.3705|10\.8978/.test(r.all),false,'exakte Koordinaten in einer Anfrage');};

module.exports={
 'Gast mit Teststandort: nur Leaflet-CDN und Overpass, keine Konto-Anfragen, keine Cookies, keine exakte Position':async(T,eq)=>{
  const r=await scenario(T,'gast_teststandort',{},async p=>{await p.evaluate(tap('starttest'));await sleep(1200);});
  hostsOk(eq,r);eq([...new Set(r.ext.map(x=>x.host))].sort(),['overpass-api.de','unpkg.com']);
  eq(r.cookies.length,0);noCoords(eq,r);eq(r.errors,[]);},
 'Echtes GPS: Position gelangt nur als Rasterfeld (ca. 1,3 km) an Overpass, nie exakt, nie an Supabase':async(T,eq)=>{
  const r=await scenario(T,'gps_echt',{geo:true},async p=>{await p.evaluate(tap('start'));await p.waitForFunction(()=>window.__RW.S&&document.querySelector('#start').style.display==='none');await sleep(1800);});
  hostsOk(eq,r);noCoords(eq,r);
  const ov=r.ext.filter(x=>x.host==='overpass-api.de');if(!ov.length)throw new Error('kein Overpass-Aufruf bei GPS-Start');
  for(const x of ov){const m=/\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/.exec(decodeURIComponent(x.body));if(!m)throw new Error('keine Bounding Box gefunden');
    const [s,w,n,e]=m.slice(1).map(Number);const dLat=(n-s)*111320,dLon=(e-w)*111320*Math.cos(s*Math.PI/180);
    if(dLat>1500||dLon>1500)throw new Error('Zelle größer als erwartet: '+dLat.toFixed(0)+' x '+dLon.toFixed(0)+' m');
    REPORT.gps_echt.overpassZelleMeter=[Math.round(dLat),Math.round(dLon)];}
  eq(r.ext.some(x=>/supabase/.test(x.host)),false,'ohne Konto keine Supabase-Anfragen');eq(r.errors,[]);},
 'Registrierung, Anmeldung und Cloud-Speichern: nur Supabase-Endpunkte, keine Standort-/Gerätedaten im Inhalt, Anfragen nachvollziehbar':async(T,eq)=>{
  const PW='Gut#Pass1';
  const r=await scenario(T,'konto_cloud',{geo:true},async(p,st)=>{
    await p.evaluate(tap('starttest'));await sleep(600);
    st.users.push({id:'00000000-0000-4000-8000-0000000000aa',email:'anna@test.de',password:PW,username:'Anna_1',confirmed:true});
    await p.evaluate(tap('acct'));await p.waitForSelector('#ac_email');await p.fill('#ac_email','anna@test.de');await p.fill('#ac_pw',PW);await p.evaluate(tap('aclog'));
    await p.waitForFunction(()=>document.querySelector('#acct').innerText.includes('Cloud-Charakterplätze')&&!document.querySelector('#acct').innerText.includes('Lade Cloud'));
    await p.fill('#accn1','Wolke');await Promise.all([p.waitForNavigation(),p.evaluate(tap('accnew',{slot:'1'}))]);await p.waitForFunction(()=>window.__RW&&window.__RW.S);
    await p.evaluate(()=>{__RW.S.inv.holz=5;});await sleep(4500);});
  hostsOk(eq,r);noCoords(eq,r);
  const sb=r.ext.filter(x=>/supabase/.test(x.host));const paths=[...new Set(sb.map(x=>x.method+' '+x.path))].sort();REPORT.konto_cloud.supabasePfade=paths;
  const allowedPath=/^(POST \/auth\/v1\/(token|logout)|GET \/auth\/v1\/user|POST \/rest\/v1\/rpc\/(create_character|save_character|list_characters|touch_login)|GET \/rest\/v1\/(characters|profiles|account_entitlements))$/;
  eq(paths.filter(x=>!allowedPath.test(x)),[],'unerwartete Supabase-Endpunkte');
  for(const x of sb){if(x.apikey&&!/^sb_publishable_/.test(r.reqs.find(q=>q.host===x.host&&q.path===x.path).apikey||'sb_publishable_'))throw new Error('anderer Schlüssel als publishable');}
  const bad=r.reqs.filter(q=>/supabase/.test(q.host)&&/geo|coords|latitude|longitude|"lat"|"lon"|gps/i.test(q.body+q.query));eq(bad.length,0,'Standortbegriffe in Supabase-Anfragen');
  const save=r.reqs.filter(q=>/save_character|create_character/.test(q.path));if(!save.length)throw new Error('kein Cloud-Speichern beobachtet');
  const dk=Object.keys(JSON.parse(save[save.length-1].body.replace(/^$/,'{}')).p_data||{}).sort();REPORT.konto_cloud.spielstandFelder=dk;
  eq(dk.some(k=>/^(lat|lon|pos|position|coords|gps|loc)$/i.test(k)),false,'Positionsfeld im Spielstand');
  eq(r.errors,[]);},
 'Browser-Speicher: keine Cookies; nur erwartete localStorage-Schlüssel':async(T,eq)=>{
  const R=REPORT.konto_cloud;if(!R)throw new Error('Szenario fehlt');eq(R.cookies,0);
  const ok=/^(ruinwalk_v1(_s\d)?(_bak|_corrupt)?|ruinwalk_slot|ruinwalk_auth|ruinwalk_cloudmap|ruinwalk_hab|ruinwalk_cc_<id>(_bak|_corrupt|_replaced_<ts>|_srvcopy_<ts>)?|ruinwalk_cm_<id>|ruinwalk_tl_<id>)$/;
  eq(R.storage.ls.filter(k=>!ok.test(k)),[],'unerwartete localStorage-Schlüssel');},
 'Quelltext: alle festen Adressen im Code sind bekannt (neue Hosts fallen sofort auf)':async(T,eq)=>{
  const files=['index.html','pxdom.js','sprites.js','sprites_skills.js','sprites_gear.js','sprites_items.js','sprites_mobs.js','sprites_chars.js','sprites_figs.js','figs/manifest.js','items/manifest.js'].filter(f=>fs.existsSync(path.join(ROOT,f)));
  const found={};for(const f of files){const t=fs.readFileSync(path.join(ROOT,f),'utf8');for(const m of t.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)){const h=m[1].toLowerCase();(found[h]=found[h]||new Set()).add(f);}}
  const known=Object.keys(ALLOWED).concat(['www.w3.org']);   // w3.org nur als SVG-Namensraum (kein Abruf)
  eq(Object.keys(found).filter(h=>!known.includes(h)),[],'unbekannte Adressen im Quelltext');
  REPORT.quelltext=Object.fromEntries(Object.entries(found).map(([h,s])=>[h,[...s]]));
  if(process.env.DATENFLUSS_BERICHT)fs.writeFileSync(process.env.DATENFLUSS_BERICHT,JSON.stringify(REPORT,null,1));},
};
