/* Hilfsfunktionen, die im Browser-Kontext laufen */
exports.install=p=>p.evaluate(()=>{
  const R=window.__RW;
  window.T={
    /* Math.random liefert nacheinander die Werte aus seq, danach dflt */
    rand(seq,dflt=.99){const q=[...seq];Math.random=()=>q.length?q.shift():dflt;},
    /* simuliert Tippen auf ein Element mit data-a */
    tap(a,data={}){const b=document.createElement('button');b.dataset.a=a;Object.assign(b.dataset,data);document.body.appendChild(b);b.click();b.remove();},
    /* setzt den Spieler auf ein Monster des Typs und wählt es aus; liefert die Monster-ID */
    /* stellt den Spieler in eine Region mit Weltstufe >= 4 (Heimat weit weg, kein Schutzring) und liefert die Gebietsbosse dort */
    area(){
      R.S.test=true;R.S.home={rx:9999,ry:9999,t:1};R.cellCache.clear();
      const c=R.posReg(48.3705,10.8978);
      for(let r=0;r<40;r++)for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++){
        if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
        if(R.worldBand(c.rx+dx,c.ry+dy)>=4){R.setPos(((c.ry+dy)*12+6)*R.DLAT,((c.rx+dx)*12+6)*R.DLON,5);const a=R.areaEnts();if(a.length)return a;}}
      return [];},
    place(type,kind='mob'){
      R.S.test=true;const cx0=Math.floor(10.8978/R.DLON),cy0=Math.floor(48.3705/R.DLAT);
      for(let r=0;r<60;r++)for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++){
        if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
        for(const e of R.cellEnts(cx0+dx,cy0+dy))if(e.kind===kind&&(!type||e.type===type)){
          R.setPos(e.lat,e.lon,5);R.refreshWorld();if(kind==='mob')R.select(e.id);return e.id;}}
      return null;}
  };
});
