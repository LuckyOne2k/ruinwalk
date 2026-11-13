/* Hilfsfunktionen, die im Browser-Kontext laufen */
exports.install=p=>p.evaluate(()=>{
  const R=window.__RW;
  window.T={
    /* Math.random liefert nacheinander die Werte aus seq, danach dflt */
    rand(seq,dflt=.99){const q=[...seq];Math.random=()=>q.length?q.shift():dflt;},
    /* simuliert Tippen auf ein Element mit data-a */
    tap(a,data={}){const b=document.createElement('button');b.dataset.a=a;Object.assign(b.dataset,data);document.body.appendChild(b);b.click();b.remove();},
    /* setzt den Spieler auf ein Monster des Typs und wählt es aus; liefert die Monster-ID */
    place(type,kind='mob'){
      R.S.test=true;const cx0=Math.floor(10.8978/R.DLON),cy0=Math.floor(48.3705/R.DLAT);
      for(let r=0;r<60;r++)for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++){
        if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
        for(const e of R.cellEnts(cx0+dx,cy0+dy))if(e.kind===kind&&(!type||e.type===type)){
          R.setPos(e.lat,e.lon,5);R.refreshWorld();if(kind==='mob')R.select(e.id);return e.id;}}
      return null;}
  };
});
