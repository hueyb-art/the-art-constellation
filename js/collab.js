/* Shared MusicBrainz access: one rate-limited request queue for the whole app
   (discographies + collaborations), plus collaboration lookup.
   MusicBrainz asks for <=1 request/second; mbGet serialises every call >=1.1s apart. */
(function(){
  let last=0, chain=Promise.resolve();
  function mbGet(url){
    const run=chain
      .then(()=>new Promise(res=>setTimeout(res,Math.max(0,1100-(Date.now()-last)))))
      .then(()=>{last=Date.now();return fetch(url).then(r=>{if(!r.ok)throw new Error("http "+r.status);return r.json();});});
    chain=run.catch(()=>{}); // keep the queue alive even if one request fails
    return run;
  }

  /* Shared recordings between two artists — the hard data of "what did they make together".
     MusicBrainz co-credit search catches joint billings and features well; pure uncredited
     sideman sessions can be partial. Deduped by title, earliest year kept, sorted. */
  /* a search term per artist: exact arid: when an MBID is pinned (bypasses the
     name-resolution that fails on punctuation/ambiguity), else artist:"name". */
  function term(x){
    if(x&&typeof x==="object"&&x.mbid)return "arid:"+x.mbid;
    const nm=String((x&&typeof x==="object")?(x.name||""):(x||"")).replace(/"/g,"").trim();
    return 'artist:"'+nm+'"';
  }
  function collab(a,b){
    const q=encodeURIComponent(term(a)+" AND "+term(b));
    const seen={},out=[];
    const add=(title,year)=>{
      title=(title||"").trim();
      const key=title.toLowerCase().replace(/\s*[\(\[].*?[\)\]]\s*/g," ").replace(/[^a-z0-9]+/g," ").trim();
      if(!key)return;
      if(!seen[key]){seen[key]={title,year};out.push(seen[key]);}
      else if(year&&(!seen[key].year||year<seen[key].year))seen[key].year=year;
    };
    /* co-credited recordings AND releases — catches joint billings/features/duo albums.
       (Sideman sessions where only one is the billed artist aren't in MusicBrainz's
       name index, so they can't be found this way — the panel covers that with a
       relationship line + a Discogs/Spotify search.) */
    return mbGet("https://musicbrainz.org/ws/2/recording?query="+q+"&fmt=json&limit=40")
      .then(d=>{(d.recordings||[]).forEach(r=>add(r.title,(r["first-release-date"]||"").slice(0,4)));},()=>{})
      .then(()=>mbGet("https://musicbrainz.org/ws/2/release?query="+q+"&fmt=json&limit=25"))
      .then(d=>{(d.releases||[]).forEach(r=>add(r.title,(r.date||"").slice(0,4)));},()=>{})
      .then(()=>{out.sort((x,y)=>(x.year||"9999").localeCompare(y.year||"9999"));return out;});
  }

  function collabCached(a,b,key){
    let c=null;try{c=JSON.parse(localStorage.getItem(key)||"null");}catch(e){}
    if(c&&c.items&&Date.now()-(c.ts||0)<30*864e5)return Promise.resolve(c.items);
    return collab(a,b).then(items=>{try{localStorage.setItem(key,JSON.stringify({items,ts:Date.now()}));}catch(e){}return items;});
  }

  /* a band's studio/live albums — used when a connection is a band member
     (their recorded work lives under the band's name, invisible to co-credit search) */
  function bandDisco(name,key){
    let c=null;try{c=JSON.parse(localStorage.getItem(key)||"null");}catch(e){}
    if(c&&c.items&&Date.now()-(c.ts||0)<30*864e5)return Promise.resolve(c.items);
    const nm=String(name||"").replace(/"/g,"").trim();
    return mbGet("https://musicbrainz.org/ws/2/artist?query="+encodeURIComponent('artist:"'+nm+'"')+"&fmt=json&limit=5")
      .then(d=>{const list=d.artists||[];if(!list.length)return [];const best=list.find(a=>(a.name||"").toLowerCase()===nm.toLowerCase())||list[0];
        return mbGet("https://musicbrainz.org/ws/2/release-group?artist="+best.id+"&type=album&fmt=json&limit=100").then(d2=>{
          const out=[];(d2["release-groups"]||[]).forEach(rg=>{if((rg["primary-type"]||"")!=="Album")return;if((rg["secondary-types"]||[]).includes("Compilation"))return;out.push({title:rg.title,year:(rg["first-release-date"]||"").slice(0,4)});});
          out.sort((x,y)=>(x.year||"9999").localeCompare(y.year||"9999"));return out;});})
      .then(items=>{try{localStorage.setItem(key,JSON.stringify({items,ts:Date.now()}));}catch(e){}return items;})
      .catch(()=>[]);
  }

  window.MB={get:mbGet,collab:collabCached,bandDisco:bandDisco};
})();
