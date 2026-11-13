/* Test-Harness: startet einen kleinen statischen Server, öffnet das Spiel in Chrome (Playwright)
   und ersetzt Leaflet durch eine Attrappe. Voraussetzung: Node 18+, Playwright, Chrome (CHROME_PATH). */
const http=require('http'),fs=require('fs'),path=require('path');
let chromium;try{({chromium}=require('playwright'));}catch(e){({chromium}=require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright'));}
const ROOT=path.join(__dirname,'..');
const MIME={'.html':'text/html','.js':'application/javascript','.png':'image/png','.css':'text/css'};
exports.serve=()=>new Promise(res=>{
  const srv=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/,'/index.html'));
    if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
  srv.listen(0,'127.0.0.1',()=>res({srv,url:'http://127.0.0.1:'+srv.address().port}));});
exports.launch=async()=>chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
/* Neue Seite; seed = Objekt, das als Spielstand in localStorage steht (oder String für Rohdaten) */
exports.page=async(browser,url,seed,query)=>{
  const ctx=await browser.newContext({viewport:{width:390,height:800}});
  const p=await ctx.newPage();p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));
  await p.route('**/unpkg.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
  await p.route('**/unpkg.com/leaflet@1.9.4/dist/leaflet.js',r=>r.fulfill({body:fs.readFileSync(path.join(__dirname,'leaflet-stub.js'),'utf8'),contentType:'application/javascript'}));
  await p.route(/openstreetmap|overpass/,r=>r.abort());
  await p.addInitScript(([seed])=>{window.__RW_TEST=true;
    if(seed!==undefined&&!sessionStorage.getItem('__seeded')){sessionStorage.setItem('__seeded','1');localStorage.setItem('ruinwalk_v1',typeof seed==='string'?seed:JSON.stringify(seed));}},[seed]);
  await p.goto(url+'/index.html'+(query||''));
  await p.waitForFunction(()=>window.__RW);
  return p;};
