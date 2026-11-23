/* CI-Probe (Zweig ci-probe/rot-spieltests-986d1d6, NICHT mergen): ein absichtlich roter Spieltest.
   Nachweis: Ist spieltests rot, werden die Pflichtprüfungen pages-positivliste und bestehende-tests rot und Pages deployt nicht. */
module.exports={
 'CI-Rotprobe: absichtlich rot (Nachweis Pflicht- und Pages-Tor)':async(T,eq)=>{eq('rot','gruen','absichtlich fehlgeschlagen – nur Zweig ci-probe/rot-spieltests-986d1d6');},
};
