/* The Music Constellation — shared engine.
   Renders any genre dataset registered on window.GENRE_DATA (see js/data/*.js).
   One engine, many skies: the genre switcher swaps data + theme in place. */

/* ----------  GENRE REGISTRY & ACTIVE STATE  ---------- */
const GENRES=window.GENRE_DATA||{};
const CFG=window.MC_CONFIG||{};
const BRAND=CFG.brand||"The Music Constellation", TAGLINE=CFG.tagline||"who shaped whom";
const GENRE_ORDER=((CFG.genres&&CFG.genres.length)?CFG.genres:["jazz","hiphop","reggae"]).filter(k=>GENRES[k]);
/* single-brand mode: one dataset / tabs off → the brand becomes the headline */
const SINGLE=(CFG.showTabs===false)||GENRE_ORDER.length<=1;
let G=null;
let ERAS={},NODES=[],EDGES=[],LIB={},CRITICS=[],RESOURCES=[],ARCHIVES=[],RADIO=[],FILMS=[],DEEPCUTS=[],REFS=[],WIKI={},SYM=[];
let byId={},adj={};
const lsKey=s=>"tmc_"+G.key+"_"+s;

const canvas=document.getElementById("c"),ctx=canvas.getContext("2d");
let W,H,DPR;
function resize(){DPR=window.devicePixelRatio||1;W=innerWidth;H=innerHeight;canvas.width=W*DPR;canvas.height=H*DPR;canvas.style.width=W+"px";canvas.style.height=H+"px";ctx.setTransform(DPR,0,0,DPR,0,0);}
addEventListener("resize",resize);resize();

const radius=nd=>6+Math.sqrt(nd.deg)*3.0;
let activeEras=new Set();
let instrFilter=null;
const visible=nd=>activeEras.has(nd.era)&&(!instrFilter||nd.instr===instrFilter);

/* Directional relationship words across all genres; symmetric ones come from data (sym). */
const REL_DIR={
  mentored:["mentored","mentored by"],
  influenced:["influenced","influenced by"],
  "influenced by":["influenced by","influenced"],
  "arranged for":["arranged for","used arranger"],
  produced:["produced","produced by"],
  engineered:["engineered","engineered by"],
  member:["member of","includes"],
  founded:["founded","founded by"],
  signed:["signed to","signed"],
  dj:["DJ for","backed by"],
  taught:["taught","studied under"],
  championed:["championed","championed by"],
};
function relWord(ed,nd){const dir=ed.a===nd.id;if(SYM.includes(ed.rel))return ed.rel;const m=REL_DIR[ed.rel];return m?m[dir?0:1]:ed.rel;}
/* Connection taxonomy for line styling */
function kindOf(rel){if(rel==="mentored")return"mentor";if(/influenc/.test(rel))return"influence";if(rel==="rivals"||rel==="beef")return"rivalry";return"collab";}
const KIND_LABEL={collab:"Collaboration",mentor:"Mentorship",influence:"Influence",rivalry:"Rivalry"};
const KIND_DASH={collab:[],mentor:[],influence:[6,5],rivalry:[2,5]};
/* warm gold = working together, bright gold = the torch passed, cool silver-blue = indirect influence, rose = rivalry */
const KIND_COLOR={collab:"224,177,90",mentor:"245,222,150",influence:"150,180,215",rivalry:"217,96,122"};

let yaw=0,pitch=0,tyaw=null,tpitch=0,vyaw=0.0012,vpitch=0,zoom=1,tzoom=1,tick=0,pulse=0,spread=1.5,viewY=0,tviewY=0;
let viewMode="globe",viewX=0,tviewX=0;
/* ----------  CHORD-WEB VIEW  ---------- */
let chordSpin=0,chordIdle=0,chordLabelBoxes=[];
const CHORD_R=520;
const SPACE_STARS=[];for(let i=0;i<220;i++)SPACE_STARS.push({x:Math.random(),y:Math.random(),r:Math.random()*Math.random()*1.8+0.25,tw:Math.random()*6.28,sp:0.3+Math.random()*0.9,warm:Math.random()<0.18});
const GALAXIES=[
  {x:0.14,y:0.22,r:260,e:0.45,rot:0.5,col:"150,130,210",a:0.07},
  {x:0.86,y:0.72,r:340,e:0.5,rot:-0.7,col:"96,150,205",a:0.06},
  {x:0.66,y:0.10,r:190,e:0.6,rot:1.2,col:"205,120,165",a:0.055},
  {x:0.30,y:0.82,r:150,e:0.7,rot:-1.4,col:"120,200,180",a:0.045},
];
/* short tie label from the focus artist's view, + its line-colour kind */
function relInfo(focusId,otherId){
  const es=EDGES.filter(e=>(e.a===focusId&&e.b===otherId)||(e.a===otherId&&e.b===focusId));
  if(!es.length)return null;
  const e=es[0],kind=kindOf(e.rel);
  if(SYM.includes(e.rel))return{word:e.rel,kind};
  const m=REL_DIR[e.rel];
  return{word:m?(e.a===focusId?m[0]:m[1]):e.rel,kind};
}
const CAM=760;
const MOBILE=(typeof window!=="undefined"&&window.matchMedia&&window.matchMedia("(max-width:700px)").matches)||false;
const BLURK=MOBILE?0.5:1;
let pointer={x:0,y:0,down:false,moved:false};
const stars=[];for(let i=0;i<240;i++){const u=Math.random(),v=Math.random(),th=Math.acos(2*u-1),ph=2*Math.PI*v;stars.push({x:Math.sin(th)*Math.cos(ph),y:Math.sin(th)*Math.sin(ph),z:Math.cos(th),r:Math.random()*1.1+0.25,tw:Math.random()*6.28});}

let alpha=1;
function step(){
  const vis=NODES.filter(visible);
  const rep=5200*spread,link=120*spread;
  for(let i=0;i<vis.length;i++){
    const a=vis[i];
    a.vx-=a.x*0.0010*alpha;a.vy-=a.y*0.0010*alpha;a.vz-=a.z*0.0010*alpha;
    for(let j=i+1;j<vis.length;j++){
      const b=vis[j];let dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z,d2=dx*dx+dy*dy+dz*dz||.01,d=Math.sqrt(d2);
      const minD=26;let f=rep/d2;if(d<minD)f+=(minD-d)*0.6/d;
      const fx=dx/d*f,fy=dy/d*f,fz=dz/d*f;a.vx+=fx;a.vy+=fy;a.vz+=fz;b.vx-=fx;b.vy-=fy;b.vz-=fz;
    }
  }
  EDGES.forEach(ed=>{if(!ed.s||!visible(ed.s)||!visible(ed.t))return;let dx=ed.t.x-ed.s.x,dy=ed.t.y-ed.s.y,dz=ed.t.z-ed.s.z,d=Math.sqrt(dx*dx+dy*dy+dz*dz)||.01;const f=(d-link)*0.010,fx=dx/d*f,fy=dy/d*f,fz=dz/d*f;ed.s.vx+=fx;ed.s.vy+=fy;ed.s.vz+=fz;ed.t.vx-=fx;ed.t.vy-=fy;ed.t.vz-=fz;});
  vis.forEach(nd=>{nd.vx*=0.85;nd.vy*=0.85;nd.vz*=0.85;nd.x+=nd.vx;nd.y+=nd.vy;nd.z+=nd.vz;});
  if(alpha>0.05)alpha*=0.992;
}

let hoverNode=null,selNode=null,focusSet=null,pageOpen=false,curId=null;
function computeFocus(nd){if(!nd){focusSet=null;return;}focusSet=new Set([nd.id]);adj[nd.id].forEach(id=>focusSet.add(id));}
function hexA(hex,a){const v=parseInt(hex.slice(1),16);return`rgba(${v>>16&255},${v>>8&255},${v&255},${a})`;}
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ----------  GENRE-SWITCH TRANSITION  ---------- */
let fade=1,trans=null;
const easeF=t=>t*t*(3-2*t);
function switchGenre(key){
  if(trans||!GENRES[key]||(G&&G.key===key))return;
  const h="#/"+key+(viewMode==="globe"?"":"/"+viewMode);
  if(location.hash!==h)location.hash=h;
  trans={to:key,phase:"out"};
}

/* ----------  PHOTOS ON ZOOM (Wikipedia thumbnails)  ---------- */
const PHOTO_ZOOM=1.5,PHOTO_MAX=14;
const photoMem={};let photoActive=0;
function photoState(nd){
  const k=G.key+"_"+nd.id;
  let st=photoMem[k];
  if(st)return st;
  let cached=null;try{cached=localStorage.getItem(lsKey("photo_"+nd.id));}catch(e){}
  if(cached==="none")return photoMem[k]={ok:false};
  if(cached){const img=new Image();img.crossOrigin="anonymous";st=photoMem[k]={ok:false,img};img.onload=()=>{st.ok=true;};img.onerror=()=>{st.ok=false;st.img=null;};img.src=cached;return st;}
  if(photoActive>=2)return null; // try again on a later frame
  photoActive++;st=photoMem[k]={ok:false};
  const title=WIKI[nd.id]||nd.name,key=lsKey("photo_"+nd.id);
  fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
    .then(r=>r.ok?r.json():Promise.reject())
    .then(d=>{photoActive--;const url=(d.type==="standard"&&d.thumbnail&&d.thumbnail.source)?d.thumbnail.source:"none";try{localStorage.setItem(key,url);}catch(e){}
      if(url!=="none"){const img=new Image();img.crossOrigin="anonymous";st.img=img;img.onload=()=>{st.ok=true;};img.src=url;}})
    .catch(()=>{photoActive--;delete photoMem[k];});
  return st;
}

/* ----------  CHORD-WEB RENDERING  ---------- */
function drawChordSpace(){
  const t=tick*0.02, px=Math.max(-70,Math.min(70,viewX*0.03)), py=Math.max(-70,Math.min(70,viewY*0.03));
  for(const g of GALAXIES){
    ctx.save();ctx.translate(g.x*W-px*0.5,g.y*H-py*0.5);ctx.rotate(g.rot+tick*0.0004);ctx.scale(1,g.e);
    const grd=ctx.createRadialGradient(0,0,0,0,0,g.r);
    grd.addColorStop(0,"rgba("+g.col+","+(g.a*1.8).toFixed(3)+")");
    grd.addColorStop(0.35,"rgba("+g.col+","+(g.a*0.7).toFixed(3)+")");
    grd.addColorStop(1,"rgba("+g.col+",0)");
    ctx.fillStyle=grd;ctx.beginPath();ctx.arc(0,0,g.r,0,6.283);ctx.fill();ctx.restore();
  }
  for(const s of SPACE_STARS){
    const x=s.x*W-px*s.sp,y=s.y*H-py*s.sp,a=0.15+0.55*Math.abs(Math.sin(t*s.sp+s.tw));
    ctx.beginPath();ctx.arc(x,y,s.r,0,6.283);
    ctx.fillStyle=(s.warm?"rgba(255,224,180,":"rgba(220,224,245,")+(a*0.8).toFixed(3)+")";ctx.fill();
  }
}
function drawSunCorona(cx,cy,R){
  const t=tick*0.03, coreR=Math.max(24,R*0.13), pulse=0.86+0.14*Math.sin(t*1.7)+0.05*Math.sin(t*0.9+1);
  let g=ctx.createRadialGradient(cx,cy,0,cx,cy,coreR*5.6*pulse);
  g.addColorStop(0,"rgba(255,205,120,0.44)");g.addColorStop(0.26,"rgba(240,150,60,0.20)");
  g.addColorStop(0.6,"rgba(220,90,40,0.06)");g.addColorStop(1,"rgba(220,90,40,0)");
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,coreR*5.6*pulse,0,6.283);ctx.fill();
  ctx.save();ctx.globalCompositeOperation="lighter";
  for(let i=0;i<20;i++){const a=i/20*6.283+t*0.12,len=coreR*(1.8+1.3*Math.sin(t*2.1+i*1.7)),fr=coreR*1.7,x=cx+Math.cos(a)*len,y=cy+Math.sin(a)*len;
    const fg=ctx.createRadialGradient(x,y,0,x,y,fr);fg.addColorStop(0,"rgba(255,180,90,0.09)");fg.addColorStop(1,"rgba(255,180,90,0)");
    ctx.fillStyle=fg;ctx.beginPath();ctx.arc(x,y,fr,0,6.283);ctx.fill();}
  ctx.restore();
  let cg=ctx.createRadialGradient(cx,cy,0,cx,cy,coreR*pulse);
  cg.addColorStop(0,"rgba(255,246,214,0.96)");cg.addColorStop(0.45,"rgba(255,200,112,0.55)");cg.addColorStop(1,"rgba(255,160,70,0)");
  ctx.fillStyle=cg;ctx.beginPath();ctx.arc(cx,cy,coreR*pulse,0,6.283);ctx.fill();
}
function drawRingFire(cx,cy,R){
  const t=tick*0.05, base=R+18, M=84;
  ctx.save();ctx.globalCompositeOperation="lighter";ctx.lineCap="round";
  for(let i=0;i<M;i++){const a=i/M*6.283,fl=Math.max(0,0.55*Math.sin(t*1.4+i*0.8)+0.32*Math.sin(t*2.3+i*2.1)+0.2*Math.sin(t*0.7+i*0.3));
    const len=7+fl*22,x0=cx+Math.cos(a)*base,y0=cy+Math.sin(a)*base,x1=cx+Math.cos(a)*(base+len),y1=cy+Math.sin(a)*(base+len);
    const g=ctx.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,"rgba(255,170,70,0.20)");g.addColorStop(0.5,"rgba(240,110,40,0.11)");g.addColorStop(1,"rgba(220,70,30,0)");
    ctx.strokeStyle=g;ctx.lineWidth=Math.max(2,R*0.028);ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();}
  ctx.strokeStyle="rgba(255,140,55,"+(0.07+0.03*Math.sin(t*1.7)).toFixed(3)+")";ctx.lineWidth=Math.max(2,R*0.02);
  ctx.beginPath();ctx.arc(cx,cy,base,0,6.283);ctx.stroke();ctx.restore();
}
function drawChordView(){
  const cx=W/2+viewX, cy=H/2+viewY, R=CHORD_R*zoom;
  /* ambient slow spin; pauses on any interaction, resumes after ~2s idle */
  const interacting=pointer.down||hoverNode||selNode||Math.abs(zoom-tzoom)>0.001||Math.abs(viewX-tviewX)>0.5||Math.abs(viewY-tviewY)>0.5;
  if(interacting)chordIdle=0;else chordIdle++;
  if(chordIdle>120)chordSpin+=0.0012;
  for(const nd of NODES){const ea=nd._cang+chordSpin;nd._cea=ea;nd._sx=cx+Math.cos(ea)*CHORD_R*zoom;nd._sy=cy+Math.sin(ea)*CHORD_R*zoom;nd._r=Math.max(2,radius(nd)*0.8*zoom);nd._d=0;}
  drawChordSpace();
  drawSunCorona(cx,cy,R);
  /* the ANCHOR sticks: once you've clicked a star its web stays put so you can
     follow the lines and click its collaborators. Hover only previews names
     before anything is anchored (selNode null). */
  const active=selNode||hoverNode, aid=active&&active.id, neigh=aid?adj[aid]:null;
  chordLabelBoxes=[];   /* tappable name targets, rebuilt below when a star is active */
  const ekeys=Object.keys(ERAS);let i=0;const N=NODES.length;
  ekeys.forEach(k=>{const cnt=NODES.filter(n=>n.era===k).length;if(!cnt)return;const a0=i/N*6.2832-1.5708+chordSpin,a1=(i+cnt)/N*6.2832-1.5708+chordSpin;i+=cnt;
    ctx.strokeStyle=hexA(ERAS[k].color,0.85);ctx.lineWidth=4;ctx.beginPath();ctx.arc(cx,cy,R+14,a0+0.01,a1-0.01);ctx.stroke();
    if(!active){const am=(a0+a1)/2;ctx.fillStyle=hexA(ERAS[k].color,0.7);ctx.font="9px Helvetica Neue, Arial";ctx.textAlign="center";ctx.save();ctx.translate(cx+Math.cos(am)*(R+40),cy+Math.sin(am)*(R+40));ctx.fillText(ERAS[k].label,0,0);ctx.restore();}});
  drawRingFire(cx,cy,R);
  EDGES.forEach(ed=>{if(!ed.s||!ed.t||!visible(ed.s)||!visible(ed.t))return;const lit=aid&&(ed.a===aid||ed.b===aid);
    ctx.strokeStyle="rgba("+KIND_COLOR[ed.kind]+","+(lit?0.92:(active?0.03:0.07))+")";ctx.lineWidth=lit?1.6:0.7;
    ctx.beginPath();ctx.moveTo(ed.s._sx,ed.s._sy);ctx.quadraticCurveTo(cx,cy,ed.t._sx,ed.t._sy);ctx.stroke();});
  for(const nd of NODES){if(!visible(nd))continue;const isF=nd===active,isN=neigh&&neigh.has(nd.id),col=ERAS[nd.era].color;
    ctx.save();ctx.globalAlpha=active?(isF||isN?1:0.22):0.9;ctx.shadowColor=col;ctx.shadowBlur=(isF||isN?8:5)*BLURK;
    ctx.beginPath();ctx.arc(nd._sx,nd._sy,isF?6:isN?4.5:nd._r,0,6.283);ctx.fillStyle=col;ctx.fill();ctx.restore();}
  if(active){
    const items=[];
    const pushL=(nd,big)=>{if(!nd)return;const ox=Math.cos(nd._cea),oy=Math.sin(nd._cea),rax=cx+ox*(CHORD_R+26)*zoom;
      items.push({nd,big,nx:nd._sx,ny:nd._sy,rax,ax:rax,ay0:cy+oy*(CHORD_R+26)*zoom,side:ox>=0?1:-1});};
    if(neigh)neigh.forEach(id=>{if(byId[id]&&visible(byId[id]))pushL(byId[id],false);});
    pushL(active,true);
    items.forEach(it=>it.ay=it.ay0);
    /* bigger names + wider spacing on touch, where the names are the tap targets */
    const NFS=MOBILE?13.5:11.5, BFS=MOBILE?15.5:13, RFS=MOBILE?11:9.5;
    const gap=MOBILE?31:26,top=MOBILE?152:80,bot=H-(MOBILE?92:54),margin=MOBILE?10:14;  /* wider: each label is now name + instrument */
    /* vertical de-collision per side */
    [1,-1].forEach(s=>{const col=items.filter(it=>it.side===s).sort((a,b)=>a.ay-b.ay);
      for(let j=1;j<col.length;j++)if(col[j].ay<col[j-1].ay+gap)col[j].ay=col[j-1].ay+gap;
      if(col.length){if(col[col.length-1].ay>bot){col[col.length-1].ay=bot;for(let j=col.length-2;j>=0;j--)if(col[j].ay>col[j+1].ay-gap)col[j].ay=col[j+1].ay-gap;}
        if(col[0].ay<top){col[0].ay=top;for(let j=1;j<col.length;j++)if(col[j].ay<col[j-1].ay+gap)col[j].ay=col[j-1].ay+gap;}}});
    /* measure each label, then clamp its x so the whole name (+relationship) stays
       on screen — stops left/right names clipping off the edges on narrow viewports */
    items.forEach(it=>{const nf=it.big?BFS:NFS;ctx.font=(it.big?"600 ":"")+nf+"px Helvetica Neue, Arial";it.nameW=ctx.measureText(it.nd.name).width;
      it.ri=it.big?null:relInfo(aid,it.nd.id);it.relTextW=0;
      if(it.ri){ctx.font=RFS+"px Helvetica Neue, Arial";it.relTextW=ctx.measureText("· "+it.ri.word).width;}
      const ext=it.nameW+(it.ri?5+it.relTextW:0);
      if(it.side>=0)it.ax=Math.max(margin,Math.min(it.ax,W-margin-ext));
      else it.ax=Math.min(W-margin,Math.max(it.ax,margin+ext));});
    /* leader line from the star to its (possibly moved) name */
    items.forEach(it=>{if(!it.big&&Math.hypot(it.ax-it.rax,it.ay-it.ay0)>3){ctx.strokeStyle="rgba(243,236,224,0.14)";ctx.lineWidth=0.7;ctx.beginPath();ctx.moveTo(it.nx,it.ny);ctx.lineTo(it.ax,it.ay);ctx.stroke();}});
    ctx.textBaseline="middle";
    const TGS=MOBILE?11:10;   /* instrument-tag font size */
    items.forEach(it=>{const align=it.side>=0?"left":"right";ctx.textAlign=align;const nm=it.nd.name,nf=it.big?BFS:NFS,tagY=it.ay+nf*0.95;
      ctx.save();ctx.shadowColor="rgba(0,0,0,0.92)";ctx.shadowBlur=3;   /* keep names legible if they land over the ring */
      ctx.font=(it.big?"600 ":"")+nf+"px Helvetica Neue, Arial";
      ctx.fillStyle=it.big?"rgba(245,222,150,.98)":"rgba(243,236,224,.94)";
      ctx.fillText(nm,it.ax,it.ay);
      if(it.ri){ctx.font=RFS+"px Helvetica Neue, Arial";ctx.fillStyle="rgba("+(KIND_COLOR[it.ri.kind]||KIND_COLOR.collab)+",0.95)";
        if(align==="left")ctx.fillText("· "+it.ri.word,it.ax+it.nameW+5,it.ay);else ctx.fillText(it.ri.word+" ·",it.ax-it.nameW-5,it.ay);}
      if(it.nd.roleTag){ctx.font=TGS+"px Helvetica Neue, Arial";ctx.fillStyle="rgba(224,177,90,"+(it.big?0.9:0.66)+")";ctx.fillText(it.nd.roleTag,it.ax,tagY);}
      ctx.restore();
      if(!it.big){const padX=MOBILE?18:8,total=it.nameW+(it.ri?5+it.relTextW:0),hh=gap/2,lg=nf*0.95/2;
        const x0=align==="left"?it.ax-padX:it.ax-total-padX, x1=align==="left"?it.ax+total+padX:it.ax+padX;
        chordLabelBoxes.push({id:it.nd.id,x0,y0:it.ay+lg-hh,x1,y1:it.ay+lg+hh});}});
  }
}
/* ========== TIMELINE VIEW — movements as dated clusters on a year axis ==========
   x = the movement's mid-year; movements that overlap in time stack into lanes
   (a Gantt-style packing); each movement's artists cluster around its anchor;
   connections are drawn between them, so directional ties flow left→right in time. */
let _tlKey="", timelineMoves=[], tlMaxLane=0;
/* Wide year-scale so the century is broad enough to PAN across rather than being
   squeezed onto one screen; a radius cap keeps big/catch-all clusters from
   ballooning a lane. TL_TOP leaves room for the top year labels. */
const TL_MIN=1895, TL_XSCALE=44, TL_LANEH=80, TL_TOP=90, TL_RCAP=58;
const tlX=yr=>(yr-TL_MIN)*TL_XSCALE;
function layoutTimeline(){
  if(_tlKey===G.key)return;
  const M=G.movements||{}, byMove={};
  NODES.forEach(nd=>{(byMove[nd.movement]=byMove[nd.movement]||{name:nd.movement,nodes:[]}).nodes.push(nd);});
  const list=Object.values(byMove).map(mv=>{const d=M[mv.name]||{},er=ERAS[mv.nodes[0].era]||{};const s=d.s||er.s||1950,e=d.e||er.e||s;mv.s=s;mv.e=e;mv.mid=(s+e)/2;mv.rad=Math.min(TL_RCAP,Math.sqrt(mv.nodes.length)*7+8);return mv;}).sort((a,b)=>a.s-b.s||a.mid-b.mid);
  const laneEnd=[];
  for(const mv of list){
    let lane=0;for(;lane<laneEnd.length;lane++)if(tlX(mv.mid)-mv.rad>=laneEnd[lane]+12)break;
    if(lane===laneEnd.length)laneEnd.push(-1e9);
    laneEnd[lane]=tlX(mv.mid)+mv.rad; mv.lane=lane;
    const bx=tlX(mv.mid), by=TL_TOP+lane*TL_LANEH;
    mv.lx=bx; mv.ly=by;
    mv.nodes.forEach((nd,i)=>{const a=i*2.399963,r=Math.min(TL_RCAP-6,Math.sqrt(i)*7);nd._tx=bx+Math.cos(a)*r;nd._ty=by+Math.sin(a)*r;});
  }
  timelineMoves=list; tlMaxLane=Math.max(0,laneEnd.length-1); _tlKey=G.key;
}
/* Clamp a pan (x,y) at zoom z so you can't scroll off into empty space: the
   x-range spans ~1897→2003; vertically the lane stack is centred if it fits,
   otherwise it's pannable. Returns the clamped [x,y]. */
function clampTL(x,y,z){
  const xL=W*0.04+tlX(1897)*z, xR=W*0.04+tlX(2003)*z, loX=(W-40)-xR, hiX=40-xL;
  x=hiX<loX?(loX+hiX)/2:Math.max(loX,Math.min(hiX,x));
  const yT=(TL_TOP-64)*z, yB=(TL_TOP+tlMaxLane*TL_LANEH+64)*z, ch=yB-yT;
  if(ch<=H-40)y=(H-ch)/2-yT; else{const loY=(H-30)-yB, hiY=30-yT;y=Math.max(loY,Math.min(hiY,y));}
  return [x,y];
}
/* Open the timeline at a comfortable fixed zoom (fit the lanes vertically, NOT
   the whole century horizontally) parked at the century's start — the user pans
   right through the decades. */
function frameTimeline(){
  layoutTimeline();
  const contentH=TL_TOP+(tlMaxLane+1)*TL_LANEH+64;
  tzoom=Math.max(0.55,Math.min(1.25,(H-48)/contentH));
  tviewX=28-W*0.04-tlX(1899)*tzoom;
  const yT=(TL_TOP-64)*tzoom, yB=(TL_TOP+tlMaxLane*TL_LANEH+64)*tzoom, ch=yB-yT;
  tviewY=ch<=H-40?(H-ch)/2-yT:28-yT;
  [tviewX,tviewY]=clampTL(tviewX,tviewY,tzoom);
}
function drawTimelineView(){
  layoutTimeline();
  const z=zoom, ox=viewX, oy=viewY;
  const SX=x=>W*0.04+x*z+ox, SY=y=>y*z+oy;
  ctx.textAlign="center";ctx.textBaseline="alphabetic";
  for(let yr=1900;yr<=2000;yr+=10){const sx=SX(tlX(yr));
    ctx.strokeStyle="rgba(255,255,255,0.045)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(sx,44);ctx.lineTo(sx,H-30);ctx.stroke();
    ctx.fillStyle="rgba(243,236,224,0.32)";ctx.font="11px Helvetica Neue, Arial";ctx.fillText(yr,sx,H-12);ctx.fillText(yr,sx,34);}
  const active=selNode||hoverNode, aid=active&&active.id, neigh=aid?adj[aid]:null;
  EDGES.forEach(ed=>{if(!ed.s||!ed.t||!visible(ed.s)||!visible(ed.t))return;const lit=aid&&(ed.a===aid||ed.b===aid);
    ctx.strokeStyle="rgba("+KIND_COLOR[ed.kind]+","+(lit?0.85:(active?0.02:0.05))+")";ctx.lineWidth=lit?1.5:0.55;
    ctx.beginPath();ctx.moveTo(SX(ed.s._tx),SY(ed.s._ty));ctx.lineTo(SX(ed.t._tx),SY(ed.t._ty));ctx.stroke();});
  for(const nd of NODES){if(!visible(nd))continue;const isF=nd===active,isN=neigh&&neigh.has(nd.id),col=ERAS[nd.era].color;
    const sx=SX(nd._tx),sy=SY(nd._ty),r=Math.max(1.5,radius(nd)*0.62*z);
    nd._sx=sx;nd._sy=sy;nd._r=r;nd._d=0;
    ctx.save();ctx.globalAlpha=active?(isF||isN?1:0.16):0.88;ctx.shadowColor=col;ctx.shadowBlur=(isF||isN?8:4)*BLURK;
    ctx.beginPath();ctx.arc(sx,sy,isF?6:isN?4.5:r,0,6.283);ctx.fillStyle=col;ctx.fill();ctx.restore();}
  if(!active){ctx.textAlign="center";ctx.textBaseline="middle";
    timelineMoves.forEach(mv=>{const sx=SX(mv.lx),sy=SY(mv.ly-mv.rad-8);if(sx<-140||sx>W+140)return;
      ctx.font="10px Helvetica Neue, Arial";ctx.fillStyle="rgba(224,177,90,0.55)";
      ctx.fillText(mv.name.length>30?mv.name.slice(0,28)+"…":mv.name,sx,sy);});}
  if(active){ctx.textBaseline="middle";
    const show=[active].concat(neigh?[...neigh].map(id=>byId[id]).filter(n=>n&&visible(n)):[]);
    show.forEach(nd=>{const big=nd===active;ctx.save();ctx.shadowColor="rgba(0,0,0,0.92)";ctx.shadowBlur=3;
      const right=nd._sx>W-160;ctx.textAlign=right?"right":"left";
      ctx.font=(big?"600 ":"")+(big?13:11)+"px Helvetica Neue, Arial";
      ctx.fillStyle=big?"rgba(245,222,150,.98)":"rgba(243,236,224,.95)";
      ctx.fillText(nd.name,nd._sx+(right?-8:8),nd._sy);ctx.restore();});}
}
function draw(){
  ctx.clearRect(0,0,W,H);
  if(viewMode==="timeline"){drawTimelineView();return;}
  if(viewMode==="chord"){drawChordView();return;}
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),spp=Math.sin(pitch);
  const Rstar=0.62*Math.max(W,H);
  for(const st of stars){
    let rx=st.x*cy-st.z*sy,rz=st.x*sy+st.z*cy,ry=st.y*cp-rz*spp;rz=st.y*spp+rz*cp;
    const t=(rz+1)/2,a=(0.10+0.42*t)*(0.6+0.4*Math.sin(tick*0.02+st.tw));
    const px=W/2+rx*Rstar,py=H/2+ry*Rstar;
    ctx.beginPath();ctx.arc(px,py,st.r*(0.5+t),0,6.283);
    ctx.fillStyle="rgba(226,212,184,"+a.toFixed(3)+")";ctx.fill();
  }
  const F=easeF(fade);
  if(F<=0.01)return;
  const vis=[];
  for(const nd of NODES){
    if(!visible(nd)){nd._sx=null;continue;}
    let x=nd.x*cy-nd.z*sy,z=nd.x*sy+nd.z*cy,y=nd.y*cp-z*spp;z=nd.y*spp+z*cp;
    const zz=z*zoom,pf=CAM/Math.max(120,CAM-zz);
    nd._sx=W/2+viewX+x*zoom*pf;nd._sy=H/2+viewY+y*zoom*pf;nd._d=zz;nd._pf=pf;
    vis.push(nd);
  }
  let dmin=1e9,dmax=-1e9;for(const nd of vis){if(nd._d<dmin)dmin=nd._d;if(nd._d>dmax)dmax=nd._d;}
  const dr=Math.max(1,dmax-dmin),bright=nd=>(nd._d-dmin)/dr;
  const key=hoverNode||selNode;
  EDGES.forEach(ed=>{
    if(!ed.s||!visible(ed.s)||!visible(ed.t))return;
    const s=ed.s,t=ed.t,on=!focusSet||(focusSet.has(ed.a)&&focusSet.has(ed.b)),lit=key&&(ed.a===key.id||ed.b===key.id);
    const tb=(bright(s)+bright(t))/2;
    ctx.beginPath();ctx.moveTo(s._sx,s._sy);ctx.lineTo(t._sx,t._sy);
    ctx.setLineDash(KIND_DASH[ed.kind]);
    const cc=KIND_COLOR[ed.kind];
    if(lit){ctx.strokeStyle=`rgba(${cc},${((0.25+0.45*tb)*F).toFixed(3)})`;ctx.lineWidth=ed.kind==="mentor"?2:1.6;}
    else if(on){ctx.strokeStyle=`rgba(${cc},${((0.05+0.12*tb)*F).toFixed(3)})`;ctx.lineWidth=ed.kind==="mentor"?1.25:1;}
    else{ctx.strokeStyle=`rgba(${cc},${((0.02+0.03*tb)*F).toFixed(3)})`;ctx.lineWidth=0.8;}
    ctx.stroke();
    if(lit){const tt=(pulse+(ed.a===key.id?0:0.5))%1;ctx.setLineDash([]);ctx.beginPath();ctx.arc(s._sx+(t._sx-s._sx)*tt,s._sy+(t._sy-s._sy)*tt,2.4,0,6.283);ctx.fillStyle=`rgba(245,225,170,${(0.9*F).toFixed(3)})`;ctx.fill();}
  });
  ctx.setLineDash([]);
  vis.sort((a,b)=>a._d-b._d);
  for(const nd of vis){
    const dim=focusSet&&!focusSet.has(nd.id),col=ERAS[nd.era].color,b=bright(nd);
    const twk=0.9+0.1*Math.sin(tick*0.045+nd.twp);
    const r=Math.max(1.3,radius(nd)*nd._pf*zoom*0.9*(1+0.5*nd.hl));nd._r=r;
    ctx.save();
    ctx.globalAlpha=(dim?0.28:Math.min(1,(0.45+0.55*b)*twk))*F;
    ctx.shadowColor=col;ctx.shadowBlur=(dim?2:(6+16*nd.hl)*twk)*(0.6+b)*BLURK;
    ctx.beginPath();ctx.arc(nd._sx,nd._sy,r,0,6.283);ctx.fillStyle=col;ctx.fill();
    ctx.restore();
    if(nd===selNode||nd===hoverNode){ctx.globalAlpha=F;ctx.lineWidth=2;ctx.strokeStyle="#f3ece0";ctx.beginPath();ctx.arc(nd._sx,nd._sy,r+1,0,6.283);ctx.stroke();ctx.globalAlpha=1;}
  }
  const cand=vis.filter(nd=>!focusSet||focusSet.has(nd.id)||nd===hoverNode||nd===selNode);
  cand.sort((a,b)=>prio(b)-prio(a));
  /* photos fade in on close zoom: the stars become faces */
  const showPhotos=zoom>PHOTO_ZOOM&&!trans;
  let shown=0;
  for(const nd of cand){
    const onScreen=nd._sx>-40&&nd._sx<W+40&&nd._sy>-40&&nd._sy<H+40;
    const want=showPhotos&&onScreen&&shown<PHOTO_MAX&&!(focusSet&&!focusSet.has(nd.id));
    let st=null;
    if(want){st=photoState(nd);shown++;}
    const ok=st&&st.ok&&st.img;
    nd._pa=nd._pa||0;nd._pa+=(((want&&ok)?1:0)-nd._pa)*0.12;
    if(nd._pa>0.02&&ok){
      const pr=Math.max(12,nd._r*1.7),pa=nd._pa*F;
      ctx.save();ctx.globalAlpha=pa;
      ctx.beginPath();ctx.arc(nd._sx,nd._sy,pr,0,6.283);ctx.clip();
      ctx.drawImage(st.img,nd._sx-pr,nd._sy-pr,pr*2,pr*2);
      ctx.restore();
      ctx.save();ctx.globalAlpha=pa;ctx.lineWidth=1.5;ctx.strokeStyle=ERAS[nd.era].color;ctx.beginPath();ctx.arc(nd._sx,nd._sy,pr,0,6.283);ctx.stroke();ctx.restore();
    }
  }
  const placed=[];ctx.textAlign="center";ctx.textBaseline="top";
  for(const nd of cand){
    const big=nd===hoverNode||nd===selNode,b=bright(nd);
    const inFocus=!!(focusSet&&focusSet.has(nd.id))&&!!nd.roleTag;  /* instrument shows only while exploring */
    const fs=Math.max(10.5,(9+3*b)*(0.85+0.35*zoom));
    const nameFont=(big?"600 ":"400 ")+fs.toFixed(1)+"px Helvetica Neue, Arial";ctx.font=nameFont;
    const off=nd._pa>0.02?Math.max(12,nd._r*1.7):nd._r;
    const nameW=ctx.measureText(nd.name).width;
    const tagFs=Math.max(8.5,fs*0.8);let tagW=0;
    if(inFocus){ctx.font=tagFs.toFixed(1)+"px Helvetica Neue, Arial";tagW=ctx.measureText(nd.roleTag).width;}
    const w=Math.max(nameW,tagW),y=nd._sy+off+3,rc={x:nd._sx-w/2-3,y:y-1,w:w+6,h:fs+3+(inFocus?tagFs+2:0)};
    let clash=false;if(!big)for(const o of placed){if(rc.x<o.x+o.w&&rc.x+rc.w>o.x&&rc.y<o.y+o.h&&rc.y+rc.h>o.y){clash=true;break;}}
    if(clash)continue;placed.push(rc);
    const dim=focusSet&&!focusSet.has(nd.id);
    ctx.font=nameFont;
    ctx.fillStyle=dim?`rgba(243,236,224,${(0.18*F).toFixed(3)})`:`rgba(243,236,224,${((0.4+0.5*b)*F).toFixed(2)})`;
    ctx.fillText(nd.name,nd._sx,y);
    if(inFocus){ctx.font=tagFs.toFixed(1)+"px Helvetica Neue, Arial";ctx.fillStyle=`rgba(224,177,90,${(0.8*F).toFixed(2)})`;ctx.fillText(nd.roleTag,nd._sx,y+fs+2);}
  }
}
function prio(nd){return (nd===hoverNode||nd===selNode?1e9:0)+(focusSet&&focusSet.has(nd.id)?1e6:0)+nd.deg*120+(nd._d||0);}
function loop(){
  tick++;pulse=(pulse+0.012)%1;
  if(trans){
    if(trans.phase==="out"){fade=Math.max(0,fade-0.055);if(fade<=0){loadGenre(trans.to);trans.phase="in";}}
    else{fade=Math.min(1,fade+0.04);if(fade>=1)trans=null;}
  }
  if(viewMode==="holo"){ if(!pageOpen)step(); if(window.HOLO)window.HOLO.frame(); requestAnimationFrame(loop); return; }
  if(viewMode==="timeline"){
    zoom+=(tzoom-zoom)*0.12;viewX+=(tviewX-viewX)*0.12;viewY+=(tviewY-viewY)*0.12;
    [viewX,viewY]=clampTL(viewX,viewY,zoom);
    draw();requestAnimationFrame(loop);return;
  }
  if(viewMode==="chord"){
    zoom+=(tzoom-zoom)*0.12;viewX+=(tviewX-viewX)*0.12;viewY+=(tviewY-viewY)*0.12;
    const lim=CHORD_R*zoom+220;
    tviewX=Math.max(-lim,Math.min(lim,tviewX));viewX=Math.max(-lim,Math.min(lim,viewX));
    tviewY=Math.max(-lim,Math.min(lim,tviewY));viewY=Math.max(-lim,Math.min(lim,viewY));
    NODES.forEach(nd=>{nd.hl+=(((nd===hoverNode||nd===selNode)?1:0)-nd.hl)*0.16;});
    draw();requestAnimationFrame(loop);return;
  }
  if(!pointer.down){
    if(tyaw!=null){const dd=((tyaw-yaw+Math.PI*3)%(Math.PI*2))-Math.PI;yaw+=dd*0.12;pitch+=(tpitch-pitch)*0.12;vyaw=0;vpitch=0;if(Math.abs(dd)<0.01&&Math.abs(tpitch-pitch)<0.01)tyaw=null;}
    else{yaw+=vyaw;pitch+=vpitch;vyaw+=(0.0012-vyaw)*0.03;vpitch*=0.9;}
    pitch=Math.max(-1.3,Math.min(1.3,pitch));
  }
  zoom+=(tzoom-zoom)*0.12;viewY+=(tviewY-viewY)*0.12;viewX+=(tviewX-viewX)*0.12;
  NODES.forEach(nd=>{nd.hl+=(((nd===hoverNode||nd===selNode)?1:0)-nd.hl)*0.16;});
  if(!pageOpen)step();
  draw();requestAnimationFrame(loop);
}

/* pointer */
/* a connection name shown beside an anchored star is a big, de-collided tap
   target — check it first so tapping the second name selects exactly that
   artist (crucial on touch, where you can't hover to aim). */
function chordLabelAt(px,py){for(let i=0;i<chordLabelBoxes.length;i++){const b=chordLabelBoxes[i];if(px>=b.x0&&px<=b.x1&&py>=b.y0&&py<=b.y1)return byId[b.id];}return null;}
function nodeAt(px,py){
  /* chord: the stars are tiny dots on a thin ring, so hit-testing against each
     dot makes hover/click frustrating — you have to land exactly on one. Since
     every star sits on the ring at a known angle (_cea), instead pick the star
     whose angle is nearest the cursor's, as long as the cursor is anywhere in
     the ring band. Moving around the circle then always reveals a name. */
  if(viewMode==="chord"){
    const lab=chordLabelAt(px,py);if(lab)return lab;
    const cx=W/2+viewX, cy=H/2+viewY, R=CHORD_R*zoom, dx=px-cx, dy=py-cy, dist=Math.hypot(dx,dy);
    if(dist<R*0.6||dist>R*1.25)return null;        /* not near the ring (deep centre / far outside) */
    const ang=Math.atan2(dy,dx);let best=null,bd=1e9;
    for(const nd of NODES){if(!visible(nd)||nd._cea==null)continue;const da=Math.abs(((nd._cea-ang+Math.PI*3)%(Math.PI*2))-Math.PI);if(da<bd){bd=da;best=nd;}}
    return best;
  }
  if(viewMode==="timeline"){let best=null,bd=1e9;for(const nd of NODES){if(!visible(nd)||nd._sx==null)continue;const d=Math.hypot(px-nd._sx,py-nd._sy);if(d<bd){bd=d;best=nd;}}return bd<18?best:null;}
  let best=null,bz=-1e9;for(const nd of NODES){if(!visible(nd)||nd._sx==null)continue;const r=(nd._r||6)+6;if(Math.hypot(px-nd._sx,py-nd._sy)<r&&nd._d>bz){bz=nd._d;best=nd;}}return best;}
canvas.addEventListener("mousemove",ev=>{
  const px=ev.clientX,py=ev.clientY;
  if(pointer.down){const dx=px-pointer.x,dy=py-pointer.y;if(Math.abs(dx)+Math.abs(dy)>1){pointer.moved=true;tyaw=null;
    if(viewMode==="chord"){tviewX=viewX+=dx;tviewY=viewY+=dy;}
    else if(viewMode==="timeline"){[viewX,viewY]=clampTL(viewX+dx,viewY+dy,zoom);tviewX=viewX;tviewY=viewY;}
    else{yaw+=dx*0.005;pitch=Math.max(-1.3,Math.min(1.3,pitch+dy*0.005));vyaw=dx*0.005;vpitch=dy*0.005;}}
    pointer.x=px;pointer.y=py;return;}
  const nd=nodeAt(px,py);if(nd!==hoverNode){hoverNode=nd;if(!selNode)computeFocus(nd);canvas.style.cursor=nd?"pointer":"grab";}
  pointer.x=px;pointer.y=py;
});
canvas.addEventListener("mousedown",ev=>{unlockAudio();pointer.down=true;pointer.moved=false;pointer.x=ev.clientX;pointer.y=ev.clientY;canvas.style.cursor="grabbing";});
addEventListener("mouseup",ev=>{if(pointer.down&&!pointer.moved){const nd=nodeAt(ev.clientX,ev.clientY);if(viewMode==="chord")chordPick(nd);else if(nd)select(nd);else deselect();}pointer.down=false;canvas.style.cursor="grab";});
canvas.addEventListener("dblclick",ev=>{if(viewMode==="chord")return;const nd=nodeAt(ev.clientX,ev.clientY);if(nd)openPage(nd);});
canvas.addEventListener("wheel",ev=>{ev.preventDefault();
  const f=ev.deltaY<0?1.1:0.91;tzoom=Math.max(0.3,Math.min(3,tzoom*f));},{passive:false});
/* touch */
let touchMode=0,pinchD=0,tapXY=null,lastTap=0;
canvas.addEventListener("touchstart",ev=>{
  ev.preventDefault();unlockAudio();
  if(ev.touches.length===1){pointer.down=true;pointer.moved=false;pointer.x=ev.touches[0].clientX;pointer.y=ev.touches[0].clientY;tapXY={x:pointer.x,y:pointer.y};touchMode=1;}
  else if(ev.touches.length>=2){touchMode=2;pointer.down=false;pinchD=Math.hypot(ev.touches[0].clientX-ev.touches[1].clientX,ev.touches[0].clientY-ev.touches[1].clientY);}
},{passive:false});
canvas.addEventListener("touchmove",ev=>{
  ev.preventDefault();
  if(touchMode===1&&ev.touches.length===1){
    const px=ev.touches[0].clientX,py=ev.touches[0].clientY;
    /* tap-slop: ignore small finger wobble so a tap isn't misread as a drag
       (and the selection cancelled) — only start panning past ~10px of travel. */
    if(!pointer.moved&&tapXY&&Math.abs(px-tapXY.x)+Math.abs(py-tapXY.y)>10)pointer.moved=true;
    if(pointer.moved){const dx=px-pointer.x,dy=py-pointer.y;tyaw=null;
      if(viewMode==="chord"){tviewX=viewX+=dx;tviewY=viewY+=dy;}
      else if(viewMode==="timeline"){[viewX,viewY]=clampTL(viewX+dx,viewY+dy,zoom);tviewX=viewX;tviewY=viewY;}
      else{yaw+=dx*0.006;pitch=Math.max(-1.3,Math.min(1.3,pitch+dy*0.006));vyaw=dx*0.006;vpitch=dy*0.006;}}
    pointer.x=px;pointer.y=py;
  } else if(touchMode===2&&ev.touches.length>=2){
    const d=Math.hypot(ev.touches[0].clientX-ev.touches[1].clientX,ev.touches[0].clientY-ev.touches[1].clientY);
    if(pinchD>0)tzoom=Math.max(0.3,Math.min(3,tzoom*(d/pinchD)));
    pinchD=d;
  }
},{passive:false});
canvas.addEventListener("touchend",ev=>{
  if(touchMode===1&&!pointer.moved&&tapXY){const now=Date.now(),nd=nodeAt(tapXY.x,tapXY.y);if(viewMode==="chord"){chordPick(nd);}else if(now-lastTap<300&&nd){openPage(nd);}else if(nd){select(nd);}else{deselect();}lastTap=now;}
  pointer.down=false;
  if(ev.touches.length===0)touchMode=0;
  else if(ev.touches.length===1){touchMode=1;pointer.down=true;pointer.moved=true;pointer.x=ev.touches[0].clientX;pointer.y=ev.touches[0].clientY;}
},{passive:false});

/* quick card panel */
const panel=document.getElementById("panel"),panelBody=document.getElementById("panelBody");
function select(nd,quiet){selNode=nd;computeFocus(nd);renderPanel(nd);panel.classList.add("open");if(MOBILE){tviewY=-H*0.24;centerOn(nd);}if(!quiet)playClip(nd);}
function deselect(){selNode=null;chordAnchor=null;if(!hoverNode)focusSet=null;panel.classList.remove("open");tviewY=0;if(clip)clip.pause();clipNote("");}
/* In chord view, closing the breakout card returns to the anchored-and-silent
   state (the star stays lit) rather than clearing the whole selection. */
document.getElementById("close").onclick=()=>{if(viewMode==="chord"){panel.classList.remove("open");clipFor=null;if(clip)clip.pause();clipNote("");}else deselect();};
function connsFor(nd){return EDGES.filter(ed=>ed.a===nd.id||ed.b===nd.id).map(ed=>({other:ed.a===nd.id?byId[ed.b]:byId[ed.a],rel:relWord(ed,nd),note:ed.note||""})).sort((a,b)=>b.other.deg-a.other.deg);}
function renderPanel(nd){
  const era=ERAS[nd.era],cs=connsFor(nd);
  panelBody.innerHTML=`
    <span class="pill" style="background:${hexA(era.color,0.18)};color:${era.color}">${era.label}</span>
    <h2>${nd.name}</h2><div class="role">${nd.role}</div><div class="life">${nd.life}</div>
    <div class="bio">${nd.blurb}</div>
    <button class="openpage" id="opBtn">Open full page <span>&rarr;</span></button>
    <div class="sec">Connections (${cs.length})${G.noAudio?"":` <span class="sechint">— tap ♪ for shared records</span>`}</div>
    <div class="conns">${cs.map((c,i)=>G.noAudio
      ? `<div class="conn" data-id="${c.other.id}"><span class="rel">${esc(c.rel)}</span><span class="nm">${esc(c.other.name)}</span></div>${c.note?`<div class="connnote">${esc(c.note)}</div>`:""}`
      : `<div class="conn" data-id="${c.other.id}"><span class="rel">${c.rel}</span><span class="nm">${c.other.name}</span><span class="cx" data-i="${i}" title="Shared recordings">♪</span></div><div class="collab" id="cb${i}"></div>`).join("")}</div>`;
  document.getElementById("opBtn").onclick=()=>openPage(nd);
  panelBody.querySelectorAll(".conn").forEach(el=>{el.onclick=ev=>{if(ev.target.classList.contains("cx"))return;const t=byId[el.dataset.id];centerOn(t);select(t);};});
  if(!G.noAudio)panelBody.querySelectorAll(".cx").forEach(el=>{el.onclick=ev=>{ev.stopPropagation();const i=+el.dataset.i;toggleCollab(document.getElementById("cb"+i),nd,byId[cs[i].other.id],el);};});
}
function collabKey(a,b){const ids=[a,b].sort();return lsKey("collab2_"+ids[0]+"_"+ids[1]);}
function toggleCollab(box,a,b,chev){
  if(!box)return;
  if(box.style.display==="block"){box.style.display="none";chev.classList.remove("on");return;}
  box.style.display="block";chev.classList.add("on");
  if(box.dataset.loaded)return;
  box.innerHTML='<div class="cbnote">finding records together…</div>';
  loadCollabInto(box,a,b);
}
/* Shared records loader — fills `box` with the recordings a & b made together
   (or a band's catalogue when one is a member of the other), each with listen
   links, plus a "hear them together" search row. Used both by the card's ♪
   expanders and by the chord-web breakout card. */
function loadCollabInto(box,a,b,onLoad){
  const sq=encodeURIComponent((a.name+" "+b.name).replace(/\s+/g," ").trim());
  const searchRow=`<div class="cbsearch">Hear them together — <a href="https://open.spotify.com/search/${sq}" target="_blank" rel="noopener">Spotify</a> · <a href="https://music.apple.com/us/search?term=${sq}" target="_blank" rel="noopener">Apple</a> · <a href="https://www.youtube.com/results?search_query=${sq}" target="_blank" rel="noopener">YouTube</a> · <a href="https://www.discogs.com/search/?q=${sq}&type=release" target="_blank" rel="noopener">Discogs</a></div>`;
  /* band members: their catalogue lives under the band's name, invisible to co-credit search */
  const dA=a.discoAs,dB=b.discoAs,lc=s=>(s||"").toLowerCase();
  let band=null;
  if(dA&&(dA===dB||lc(dA).includes(lc(b.name))))band=dA;
  else if(dB&&(dA===dB||lc(dB).includes(lc(a.name))))band=dB;
  /* curated shared records — for pairs MusicBrainz misses (one played sideman on the
     other's leader dates, family sessions, etc.), keyed by the sorted id pair in
     G.collabs. Authoritative, so it short-circuits the co-credit lookup. */
  const cur=(G.collabs||{})[[a.id,b.id].sort().join("_")];
  if(cur&&cur.length&&!band){box.dataset.loaded="1";
    const citems=cur.map(c=>({year:c[0]||"",title:c[1]||"",note:c[2]||""}));
    box.innerHTML='<div class="cbnote" style="color:var(--gold)">Records together</div>'+citems.map(it=>`<div class="cbrow"><span class="cbyear">${esc(it.year)||"—"}</span><span class="cbmain"><span class="cbtitle">${esc(it.title)}</span>${svc(a.name+" "+b.name+" "+it.title)}</span></div>`).join("")+searchRow;
    wireApple(box);if(onLoad)onLoad(citems,band);return;}
  const records=band?window.MB.bandDisco(band,lsKey("bd_"+band.replace(/[^a-z0-9]+/gi,""))):window.MB.collab({name:a.name,mbid:a.mbid},{name:b.name,mbid:b.mbid},collabKey(a.id,b.id));
  const secRow=band?`<div class="cbnote" style="color:var(--gold)">Records together · as ${esc(band)}</div>`:"";
  records.then(items=>{
    box.dataset.loaded="1";
    if(!items.length){box.innerHTML='<div class="cbnote">No co-credited records on MusicBrainz — sideman sessions often aren\'t listed there.</div>'+searchRow;return;}
    const top=items.slice(0,14);
    box.innerHTML=secRow+top.map(it=>`<div class="cbrow"><span class="cbyear">${esc(it.year)||"—"}</span><span class="cbmain"><span class="cbtitle">${esc(it.title)}</span>${svc((band||a.name+" "+b.name)+" "+it.title)}</span></div>`).join("")
      +(items.length>14?`<div class="cbnote">+${items.length-14} more</div>`:"")+searchRow;
    wireApple(box);
    if(onLoad)onLoad(items,band);
  }).catch(()=>{box.innerHTML='<div class="cbnote">Couldn\'t load — tap again to retry.</div>';box.dataset.loaded="";});
}
/* Chord-web: when a collab card opens, play a preview of one of the records the
   two actually made together (verified to a collaborator or the band) — so the
   tie you opened is also something you hear. Cached per pair. */
function playCollabClip(a,b,items,band){
  if(!clip||!items||!items.length)return;
  const id=[a.id,b.id].sort().join("_"),tag="cc:"+id,key=lsKey("cclip_"+id);
  clipFor=tag;
  /* honour only a *successful* cache ({url,name}); ignore old "none"/garbage so a
     pair that missed once (strict match, transient blip) is retried next time. */
  try{const c=JSON.parse(localStorage.getItem(key)||"null");if(c&&c.url){playPreview(c.url,c.year?c.name+"  ("+c.year+")":c.name);return;}}catch(e){}
  const names=[a.name,b.name].concat(band?[band]:[]).map(pnorm);
  const ok=an=>{an=pnorm(an);return !!an&&names.some(n=>n&&(an===n||an.includes(n)||n.includes(an)));};
  /* strip "(feat. …)" / "[Live]" / " - Remastered" style qualifiers that stop a
     MusicBrainz title from matching the Deezer track name. */
  const clean=s=>String(s||"").replace(/\s*[\(\[].*?[\)\]]\s*/g," ")
    .replace(/\s*[-–—]\s*(remaster(ed)?|live|mono|stereo|single|edit|version|take\b.*|alt(ernate)?).*$/i,"")
    .replace(/["]/g,"").replace(/\s+/g," ").trim();
  const recs=items.slice(0,8).map(r=>clean(r.title)).filter(Boolean);
  /* precise Deezer queries first (artist + track, by either name or the band),
     then looser free-text — drawn from several records, so one miss isn't fatal. */
  const tries=[];
  recs.forEach(T=>{if(band)tries.push(`artist:"${band}" track:"${T}"`);tries.push(`artist:"${a.name}" track:"${T}"`);tries.push(`artist:"${b.name}" track:"${T}"`);});
  recs.forEach(T=>{tries.push((band||a.name)+" "+T);tries.push(b.name+" "+T);});
  const list=tries.slice(0,20);let i=0;
  clipNote("♪  finding a track…",8000);
  const tryNext=()=>{
    if(clipFor!==tag)return;
    if(i>=list.length){clipNote("No preview for their records — try the listen links");return;} /* never cache "none": stay retryable */
    dzSearch(list[i++],arr=>{
      if(clipFor!==tag)return;
      const t=(arr||[]).find(x=>x&&x.preview&&ok(x.artist&&x.artist.name));
      if(t){const ct=clean(t.title);let yr="";for(const r of items){const rc=clean(r.title);if(rc&&(rc===ct||rc.indexOf(ct)>=0||ct.indexOf(rc)>=0)){yr=String(r.year||"").trim();break;}}
        try{localStorage.setItem(key,JSON.stringify({url:t.preview,name:t.title,year:yr}));}catch(e){}playPreview(t.preview,yr?t.title+"  ("+yr+")":t.title);}
      else tryNext();
    });
  };
  tryNext();
}
/* ----- chord-web two-step interaction -----
   1st click anchors a star and lights its ties — in silence, no card, no audio.
   2nd click on one of those lit ties opens a collab breakout card (the shared
   records + listen links, or "no co-credited records"). Clicking a star that
   isn't a tie re-anchors to it; clicking empty space clears the anchor. */
let chordAnchor=null;
function chordPick(nd){
  if(!nd){chordAnchor=null;selNode=null;focusSet=null;panel.classList.remove("open");clipFor=null;if(clip)clip.pause();clipNote("");return;}
  if(chordAnchor&&nd!==chordAnchor&&adj[chordAnchor.id]&&adj[chordAnchor.id].has(nd.id)){renderChordCollab(chordAnchor,nd);return;}
  /* anchoring (or re-anchoring) is silent — stop any collab clip still playing */
  chordAnchor=nd;selNode=nd;computeFocus(nd);panel.classList.remove("open");clipFor=null;if(clip)clip.pause();clipNote("");
}
function renderChordCollab(a,b){
  const ri=relInfo(a.id,b.id),kc=(ri&&KIND_COLOR[ri.kind])||KIND_COLOR.collab;
  panelBody.innerHTML=`
    <div class="ccpair"><span>${esc(a.name)}</span><span class="ccx">&times;</span><span>${esc(b.name)}</span></div>
    ${ri?`<div class="ccrel"><span class="ccchip" style="background:rgba(${kc},0.16);color:rgb(${kc})">${esc(ri.word)}</span></div>`:""}
    <div class="sec">Records together</div>
    <div class="collab ccbox" id="ccbox"><div class="cbnote">finding records together…</div></div>`;
  panel.classList.add("open");
  const box=document.getElementById("ccbox");box.style.display="block";
  loadCollabInto(box,a,b,(items,band)=>playCollabClip(a,b,items,band));
}
function centerOn(nd){
  if(viewMode==="timeline"){layoutTimeline();[tviewX,tviewY]=clampTL(W/2-W*0.04-nd._tx*tzoom,H/2-nd._ty*tzoom,tzoom);return;}
  if(viewMode==="chord")return; /* chord has its own framing; don't rotate the globe */
  const R=Math.hypot(nd.x,nd.z);tyaw=Math.atan2(nd.x,nd.z);tpitch=Math.max(-1.3,Math.min(1.3,Math.atan2(nd.y,R)));tzoom=Math.max(tzoom,1.2);}

/* full encyclopedia page */
const pageEl=document.getElementById("page"),pageInner=document.getElementById("pageInner");
function openPage(nd){
  const era=ERAS[nd.era],cs=connsFor(nd);
  pageInner.innerHTML=`
    <button class="back" id="backBtn"><span>&larr;</span> Back to the constellation</button>
    <div class="phead">
      <div class="pavcol"><div class="pavatar" id="pavatar" style="background:${era.color}">${mono(nd.name)}</div><a id="pcredit" class="pcredit" target="_blank" rel="noopener"></a></div>
      <div class="pheadtext">
        <span class="pill" style="background:${hexA(era.color,0.18)};color:${era.color}">${era.label}</span>
        <h1>${nd.name}</h1>
        <div class="prole">${nd.role}</div>
        <div class="plife">${nd.life}</div>
      </div>
    </div>
    <p class="pbio">${nd.bio}</p>
    ${G.noAudio?"":`<h3>Discography</h3>
    <div id="discoBox"><div class="discoloading">Loading the full discography from MusicBrainz…</div></div>`}
    ${(()=>{const L=LIB[nd.id]||{};const bs=(t,a)=>(a&&a.length)?`<h3>${t}</h3><div>`+a.map(b=>`<div class="brow"><span class="btitle">${b[1]}</span> <span class="bmeta">— ${b[0]}, ${b[2]}</span></div>`).join("")+`</div>`:"";return bs("Biographies & memoirs",L.bios)+bs("Further reading",L.reads);})()}
    <h3>Connections (${cs.length})</h3>
    <div class="chips">${cs.map(c=>`<span class="chip" data-id="${c.other.id}"><span class="cd" style="background:${ERAS[c.other.era].color}"></span><span class="cr">${c.rel}</span> ${c.other.name}</span>`).join("")}</div>`;
  document.getElementById("backBtn").onclick=closePage;
  pageInner.querySelectorAll(".chip").forEach(el=>{el.onclick=()=>{openPage(byId[el.dataset.id]);pageEl.scrollTop=0;};});
  curId=nd.id;loadDisco(nd);loadPhoto(nd);
  pageEl.scrollTop=0;pageEl.classList.add("open");pageOpen=true;
  selNode=nd;computeFocus(nd);centerOn(nd);
}
function closePage(){pageEl.classList.remove("open");pageOpen=false;if(typeof closeReadBook==="function")closeReadBook();}
/* ----------  THE ROOMS: Reading / Films / Deep Cuts (one tabbed page)  ---------- */
let roomTab="read";
const ROOM_TABS=[["read","Reading"],["watch","Films & docs"],["cuts","Deep cuts"]];
function roomReadingHTML(){
  const reslist=arr=>`<div class="reslist">${arr.map(r=>`<a class="reslink" href="${esc(r[2])}" target="_blank" rel="noopener"><span class="rt">${esc(r[0])}</span><span class="rn">${esc(r[1])}</span><span class="ra">&#8599;</span></a>`).join("")}</div>`;
  const sec=`${ARCHIVES.length?`<h3 style="margin-top:34px">Archives &amp; primary sources</h3>${reslist(ARCHIVES)}`:""}
    <h3 style="margin-top:34px">Periodicals &amp; community</h3>${reslist(RESOURCES)}
    ${RADIO.length?`<h3 style="margin-top:34px">Radio &amp; airwaves</h3>${reslist(RADIO)}`:""}`;
  return `<div class="reading-room">
    <p class="lead">A shelf of the writers who shaped how we hear this music — tap a spine to see the book and who wrote it.</p>
    <div class="bookcase">
      <div class="rlamp l"><div class="rl-arm"></div><div class="rl-head"></div></div>
      <div class="rlamp r"><div class="rl-arm"></div><div class="rl-head"></div></div>
      <div class="rcase" id="readcase"></div>
      <div class="rwash"></div><div class="rshade"></div>
    </div>
    <div class="readmore">${sec}</div>
  </div>`;
}
function roomFilmsHTML(){
  if(!FILMS.length)return `<p class="lead">Film picks for this constellation are on the way.</p>`;
  return `<div class="films-room">
    <p class="lead">Documentaries and films that bring this music to life — tap a case to see the poster and where to watch.</p>
    <div class="bookcase">
      <div class="rlamp l"><div class="rl-arm"></div><div class="rl-head"></div></div>
      <div class="rlamp r"><div class="rl-arm"></div><div class="rl-head"></div></div>
      <div class="rcase" id="filmcase"></div>
      <div class="rwash"></div><div class="rshade"></div>
    </div>
  </div>`;
}
function roomCutsHTML(){
  if(!DEEPCUTS.length)return `<p class="lead">Deep cuts for this constellation are on the way.</p>`;
  return `<p class="lead">Deep cuts — essential but under-the-radar records and tracks, the ones aficionados press into your hands. Tap a service to listen; tap a name in the constellation to open their page.</p>
    ${DEEPCUTS.map(d=>{const artist=(d.id&&byId[d.id])?`<a class="dcartist" data-id="${d.id}">${esc(d.artist)}</a>`:esc(d.artist);
      return `<div class="dc"><div class="dcrow"><span class="dctitle">${esc(d.title)}</span> <span class="dcby">${artist}</span> <span class="dcmeta">${[d.year,d.kind].filter(Boolean).map(esc).join(" · ")}</span></div><div class="dcnote">${esc(d.note)}</div><div class="dclinks">${svc(d.artist+" "+d.title)}</div></div>`;}).join("")}
    ${REFS.length?`<h3 style="margin-top:40px">Reference shelf</h3>
    ${REFS.map(r=>`<div class="film"><div class="frow"><span class="ftitle">${esc(r.title)}</span><span class="fmeta">${[r.author,r.year].filter(Boolean).map(esc).join(" · ")}</span></div><div class="fnote">${esc(r.note)}</div></div>`).join("")}`:""}`;
}
function openRooms(tab){
  if(tab)roomTab=tab;
  const body=roomTab==="watch"?roomFilmsHTML():roomTab==="cuts"?roomCutsHTML():roomReadingHTML();
  pageInner.innerHTML=`<button class="back" id="backBtn"><span>&larr;</span> Back to the constellation</button>
    <span class="pill" style="background:rgba(224,177,90,.18);color:#e0b15a">The rooms</span>
    <div class="roomtabs">${ROOM_TABS.map(([k,l])=>`<button class="roomtab${k===roomTab?" on":""}" data-tab="${k}">${l}</button>`).join("")}</div>
    <div class="roombody">${body}</div>`;
  document.getElementById("backBtn").onclick=closePage;
  pageInner.querySelectorAll(".roomtab").forEach(b=>b.onclick=()=>openRooms(b.dataset.tab));
  pageInner.querySelectorAll(".dcartist[data-id]").forEach(el=>el.onclick=()=>{const nd=byId[el.dataset.id];if(nd)openPage(nd);});
  wireApple(pageInner);
  if(roomTab==="watch")buildFilmShelf(); else if(roomTab!=="cuts")buildReadingShelf();
  pageEl.scrollTop=0;pageEl.classList.add("open");pageOpen=true;
}

/* ----------  Rooms: a media shelf (real covers/posters + gilded fallback)  ---------- */
const RS_PAL=['#6e2b2b','#2f4a39','#283a5a','#3a2a24','#6a4a2a','#4a2a44','#26474a','#5a3a1e','#34303a','#7a5a2e','#5a2236','#2e3a2a'];
let _shelf=null,rsToken=0,rsRT=0,_rsCard=null;
const rsLast=n=>String(n).replace(/\s*\(.*\)\s*/,"").trim();
const rsWidth=b=>Math.min(54,Math.max(34,Math.round(32+(b.main||"").length*0.85)));
const rsWidthThin=b=>Math.min(30,Math.max(22,Math.round(20+(b.main||"").length*0.32)));  /* DVD-thin spines for the film shelf */
function buildShelf(caseId,items,coverFn,onClick,thin){
  const caseEl=document.getElementById(caseId); if(!caseEl)return;
  _shelf={caseId,items,coverFn,onClick,thin}; layoutShelf(); loadShelfCovers();
}
function layoutShelf(){
  const s=_shelf; if(!s)return; const caseEl=document.getElementById(s.caseId); if(!caseEl)return; caseEl.innerHTML="";
  const avail=caseEl.clientWidth-28; let bk=null,used=0,idx=0;
  const newShelf=()=>{const sh=document.createElement("div");sh.className="rshelf";
    const b=document.createElement("div");b.className="rbooks";sh.appendChild(b);
    const p=document.createElement("div");p.className="rplank";sh.appendChild(p);caseEl.appendChild(sh);used=0;return b;};
  bk=newShelf();
  s.items.forEach((b,i)=>{const w=s.thin?rsWidthThin(b):rsWidth(b);
    if(used+w+5>avail&&used>0)bk=newShelf(); used+=w+5;
    const el=document.createElement("div"); el.className="rbook"+(s.thin?" thin":"")+((i%7===3)?" lean":"");
    el.style.setProperty("--rc",RS_PAL[idx++%RS_PAL.length]); el.style.width=w+"px";
    el.innerHTML=`<div class="rb-band"></div><div class="rb-title">${esc(b.main)}</div><div class="rb-author">${esc(b.byline||"")}</div><div class="rb-foot">${esc(b.year||"")}</div>`;
    el.onclick=()=>s.onClick(b); b.el=el;
    if(b.cover)applyCover(b);
    bk.appendChild(el);
  });
}
function applyCover(b){ if(!b.el)return; b.el.classList.add("hascover");
  b.el.style.backgroundImage=`linear-gradient(rgba(12,8,3,.4),rgba(12,8,3,.4)),linear-gradient(90deg,rgba(0,0,0,.5),rgba(0,0,0,.06) 34%,rgba(0,0,0,.55)),url("${b.cover}")`;
  b.el.style.backgroundSize="cover,cover,cover"; b.el.style.backgroundPosition="center"; b.el.style.backgroundRepeat="no-repeat";
}
function rsPreload(url){return new Promise(res=>{const im=new Image();im.onload=()=>res(im.naturalWidth>2?url:null);im.onerror=()=>res(null);im.src=url;});}
async function loadShelfCovers(){
  const s=_shelf; const tok=++rsToken; let i=0;
  const worker=async()=>{ while(i<s.items.length){ if(tok!==rsToken||_shelf!==s)return; const b=s.items[i++]; const url=await s.coverFn(b);
    if(tok!==rsToken||_shelf!==s)return; if(url){b.cover=url;applyCover(b);} } };
  await Promise.all([worker(),worker(),worker(),worker(),worker(),worker()]);
}
/* cover sources */
/* title check — only accept a matched article whose name actually matches the item
   (so "The Girls in the Band" never resolves to "Neil Armstrong", etc.) */
function titleOk(want,got){
  const norm=s=>String(s).toLowerCase().replace(/^the\s+/,"").replace(/\(.*?\)/g,"").replace(/[^a-z0-9]+/g," ").trim();
  const a=norm(want),p=norm(got); if(!a||!p)return false;
  if(p.startsWith(a)||a.startsWith(p))return true;
  const aw=a.split(" ").filter(w=>w.length>3),pw=new Set(p.split(" "));
  return aw.length>0 && aw.filter(w=>pw.has(w)).length/aw.length>=0.6;
}
async function coverBook(b){
  const ck="tmc_olcov_"+(b.full+"|"+b.author).toLowerCase().replace(/[^a-z0-9|]+/g,"_");
  try{const c=localStorage.getItem(ck);if(c)return c;}catch(e){}   /* only a real URL short-circuits; stale "" re-tries */
  let url=null; const an=rsLast(b.author).toLowerCase();
  try{const r=await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(b.main)}&author=${encodeURIComponent(b.author)}&limit=5&fields=cover_i,author_name`);
    const j=await r.json();const docs=(j.docs||[]).filter(x=>x.cover_i);
    const d=docs.find(x=>(x.author_name||[]).some(a=>a.toLowerCase().includes(an)))||docs[0];
    if(d)url=await rsPreload(`https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg?default=false`);}catch(e){}
  if(!url){try{const r=await fetch(`https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(b.main)}+inauthor:${encodeURIComponent(rsLast(b.author))}&maxResults=1`);
    const j=await r.json();const im=j.items&&j.items[0]&&j.items[0].volumeInfo&&j.items[0].volumeInfo.imageLinks;
    if(im){const u=(im.thumbnail||im.smallThumbnail||"").replace(/^http:/,"https:").replace("&edge=curl","");if(u)url=await rsPreload(u);}}catch(e){}}
  if(url){try{localStorage.setItem(ck,url);}catch(e){}}   /* cache hits only */
  return url;
}
async function coverFilm(b){  /* movie/doc posters via Wikipedia lead image (non-free allowed) */
  const ck="tmc_poster_"+(b.full+"|"+(b.year||"")).toLowerCase().replace(/[^a-z0-9|]+/g,"_");
  try{const c=localStorage.getItem(ck);if(c)return c;}catch(e){}
  const wikiImg=async(params)=>{ try{
    const u=`https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages&piprop=thumbnail&pithumbsize=500&pilicense=any&${params}`;
    const r=await fetch(u);const j=await r.json();const p=j.query&&Object.values(j.query.pages)[0];
    return p&&p.thumbnail&&p.thumbnail.source?{src:p.thumbnail.source,title:p.title}:null;}catch(e){return null;} };
  let hit=null;
  if(b.wiki){ hit=await wikiImg("titles="+encodeURIComponent(b.wiki)); }   /* pinned exact article */
  else { const r=await wikiImg("generator=search&gsrlimit=1&gsrsearch="+encodeURIComponent(`${b.main} ${b.year||""} film`));
    if(r&&titleOk(b.main,r.title))hit=r; }                                  /* validate, else fall back */
  const url=hit?await rsPreload(hit.src):null;
  if(url){try{localStorage.setItem(ck,url);}catch(e){}}
  return url;
}
/* shelf builders */
function buildReadingShelf(){
  const books=[]; (CRITICS||[]).forEach(c=>(c.books||[]).forEach(b=>{
    const full=b[0]||"",year=b[1]||"",ci=full.indexOf(":");
    books.push({main:(ci>0?full.slice(0,ci):full).trim(),sub:(ci>0?full.slice(ci+1):"").trim(),byline:rsLast(c.name),author:c.name,year,note:c.note||"",full,el:null,cover:null});
  }));
  buildShelf("readcase",books,coverBook,openReadBook);
}
function buildFilmShelf(){
  const items=(FILMS||[]).map(f=>({main:f.title||"",byline:f.director||"",dir:f.director||"",year:f.year||"",note:f.note||"",url:f.url||"",wiki:f.wiki||"",full:f.title||"",el:null,cover:null}));
  buildShelf("filmcase",items,coverFilm,openFilmCard,true);
}
/* detail cards (shared overlay) */
function rsCardEl(){ if(_rsCard)return _rsCard;
  const bg=document.createElement("div");bg.className="bookcard-bg";
  const card=document.createElement("div");card.className="bookcard";bg.appendChild(card);
  bg.addEventListener("click",e=>{if(e.target===bg)closeReadBook();});
  document.body.appendChild(bg); _rsCard={bg,card}; return _rsCard;
}
function openReadBook(b){ const c=rsCardEl(), q=encodeURIComponent(b.full+" "+b.author);
  const left=b.cover?`<img class="bc-cover" src="${esc(b.cover)}" alt="">`:`<div class="bc-mini" style="background:linear-gradient(90deg,rgba(255,255,255,.12),rgba(0,0,0,.3) 90%),${RS_PAL[(b.main||"").length%RS_PAL.length]}"></div>`;
  const find=`https://www.google.com/search?tbm=bks&q=${q}`,amz=`https://www.amazon.com/s?k=${q}&i=stripbooks`,bsh=`https://bookshop.org/search?keywords=${q}`;
  c.card.innerHTML=`<button class="bc-x" aria-label="Close">&times;</button><div class="bc-top">${left}<div><h2>${esc(b.main)}</h2>${b.sub?`<div class="bc-sub">${esc(b.sub)}</div>`:""}<div class="bc-by">${esc(b.author)}</div><div class="bc-yr">${esc(b.year)}</div></div></div><div class="bc-note"><b>About the author &mdash;</b> ${esc(b.note)}</div><div class="bc-links"><a href="${find}" target="_blank" rel="noopener">Google Books</a><a href="${amz}" target="_blank" rel="noopener">Amazon</a><a href="${bsh}" target="_blank" rel="noopener">Bookshop.org</a></div>`;
  c.card.querySelector(".bc-x").onclick=closeReadBook;
  c.bg.classList.add("open");
}
function openFilmCard(b){ const c=rsCardEl();
  const yt=`https://www.youtube.com/results?search_query=${encodeURIComponent(b.main+" "+(b.year||"")+" trailer")}`,jw=`https://www.justwatch.com/us/search?q=${encodeURIComponent(b.main)}`;
  const left=b.cover?`<img class="bc-cover" src="${esc(b.cover)}" alt="">`:`<div class="bc-mini bc-film"></div>`;
  const meta=[b.year,b.dir?("dir. "+b.dir):""].filter(Boolean).map(esc).join(" &middot; ");
  c.card.innerHTML=`<button class="bc-x" aria-label="Close">&times;</button><div class="bc-top">${left}<div><h2>${esc(b.main)}</h2><div class="bc-yr" style="margin-bottom:0">${meta}</div></div></div><div class="bc-note" style="border-top:none;padding-top:0;margin-top:14px">${esc(b.note)}</div><div class="bc-links">${b.url?`<a href="${esc(b.url)}" target="_blank" rel="noopener">More</a>`:""}<a href="${yt}" target="_blank" rel="noopener">YouTube</a><a href="${jw}" target="_blank" rel="noopener">Where to watch</a></div>`;
  c.card.querySelector(".bc-x").onclick=closeReadBook;
  c.bg.classList.add("open");
}
function closeReadBook(){ if(_rsCard)_rsCard.bg.classList.remove("open"); }
addEventListener("resize",()=>{ if(_shelf&&document.getElementById(_shelf.caseId)){clearTimeout(rsRT);rsRT=setTimeout(layoutShelf,160);} });
addEventListener("keydown",e=>{ if(e.key==="Escape"&&_rsCard&&_rsCard.bg.classList.contains("open"))closeReadBook(); });
{const _rr=document.getElementById("rrBtn");if(_rr)_rr.onclick=()=>openRooms();}

/* ----------  LIVE DISCOGRAPHY (MusicBrainz)  ---------- */
/* delegate to the shared MusicBrainz queue (js/collab.js) so discographies and
   collaboration lookups never collide on the rate limit */
function mbFetch(url){return window.MB.get(url);}
function resolveAndFetch(nd){
  const getRGs=mbid=>{let items=[],offset=0;const more=()=>mbFetch(`https://musicbrainz.org/ws/2/release-group?artist=${mbid}&fmt=json&limit=100&offset=${offset}`).then(d=>{(d["release-groups"]||[]).forEach(rg=>items.push({title:rg.title,year:(rg["first-release-date"]||"").slice(0,4),primary:rg["primary-type"]||"",secondary:rg["secondary-types"]||[]}));const total=d["release-group-count"]||items.length;offset+=100;return(offset<total&&offset<400)?more():items;});return more();};
  if(nd.mbid)return getRGs(nd.mbid);
  const byName=nm=>mbFetch(`https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent('artist:"'+nm+'"')}&fmt=json&limit=8`).then(d=>{const list=d.artists||[];if(!list.length)throw new Error("no match");const best=list.find(a=>a.name.toLowerCase()===nm.toLowerCase())||list[0];return getRGs(best.id);});
  const names=nd.discoAs?(Array.isArray(nd.discoAs)?nd.discoAs:[nd.discoAs]):[nd.name];
  if(names.length===1)return byName(names[0]);
  return names.reduce((p,nm)=>p.then(acc=>byName(nm).then(r=>acc.concat(r)).catch(()=>acc)),Promise.resolve([])).then(all=>{const seen={},out=[];all.forEach(i=>{const k=(i.title||"").toLowerCase();if(k&&!seen[k]){seen[k]=1;out.push(i);}});return out;});
}
function dtag(i){const t=(i.secondary&&i.secondary.length)?i.secondary.join(", "):(i.primary&&i.primary!=="Album"?i.primary:"");return t?`<span class="dtag">${esc(t)}</span>`:"";}
function svc(q){const e=encodeURIComponent(q.replace(/\s+/g," ").trim());return `<span class="svc"><a href="https://open.spotify.com/search/${e}" target="_blank" rel="noopener">Spotify</a><a class="apple" data-q="${e}" href="https://music.apple.com/us/search?term=${e}" target="_blank" rel="noopener">Apple</a><a href="https://www.youtube.com/results?search_query=${e}" target="_blank" rel="noopener">YouTube</a></span>`;}
function wireApple(box){if(!box||!box.querySelectorAll)return;box.querySelectorAll("a.apple").forEach(a=>{a.onclick=appleClick;});}
function appleClick(ev){
  ev.preventDefault();
  const q=decodeURIComponent(this.dataset.q||"");
  const fb="https://music.apple.com/us/search?term="+encodeURIComponent(q);
  let w=null;try{w=window.open("","_blank");}catch(e){}
  let done=false;const go=u=>{if(done)return;done=true;const url=u||fb;try{if(w&&!w.closed){w.location.href=url;return;}}catch(e){}window.location.href=url;};
  let cached=null;try{cached=localStorage.getItem("tmc_apple_"+q);}catch(e){}
  if(cached&&cached.indexOf("/album/")>=0){go(cached);return false;}
  setTimeout(()=>go(fb),8000);
  if(typeof fetch==="undefined"){go(fb);return false;}
  const api="https://itunes.apple.com/search?term="+encodeURIComponent(q)+"&media=music&entity=album&limit=5";
  fetchJSON(api).then(d=>{const r=((d&&d.results)||[]).find(x=>x.collectionViewUrl);if(r){try{localStorage.setItem("tmc_apple_"+q,r.collectionViewUrl);}catch(e){}go(r.collectionViewUrl);}else{go(fb);}}).catch(()=>go(fb));
  return false;
}
function renderDisco(box,nd,items){
  const sorted=items.slice().sort((a,b)=>(a.year||"9999").localeCompare(b.year||"9999"));
  const isMain=i=>i.primary==="Album"&&!i.secondary.includes("Compilation");
  const main=sorted.filter(isMain),other=sorted.filter(i=>!isMain(i));
  const row=i=>`<div class="drow"><span class="dyear">${esc(i.year)||"—"}</span><span class="dmain"><span class="dtitle">${esc(i.title)}</span>${dtag(i)}${svc(nd.name+" "+i.title)}</span></div>`;
  let html=`<div class="discometa">${items.length} releases · via MusicBrainz</div><div class="disco">${main.map(row).join("")||'<div class="dnote">No studio albums listed.</div>'}</div>`;
  if(other.length)html+=`<button class="moreBtn" id="moreBtn">Show ${other.length} more — EPs, live &amp; compilations</button><div class="disco" id="otherDisco" style="display:none">${other.map(row).join("")}</div>`;
  box.innerHTML=html;wireApple(box);
  const mb=document.getElementById("moreBtn");
  if(mb)mb.onclick=()=>{const o=document.getElementById("otherDisco"),sh=o.style.display==="none";o.style.display=sh?"":"none";mb.innerHTML=sh?"Hide EPs, live &amp; compilations":`Show ${other.length} more — EPs, live &amp; compilations`;};
}
function renderFallback(box,nd){box.innerHTML=`<div class="discometa">Showing essentials — connect to the internet to load the full discography from MusicBrainz.</div><div class="disco">${(nd.disco||[]).map(d=>`<div class="drow"><span class="dyear">${d[0]}</span><span class="dmain"><span class="dtitle">${d[1]}</span>${d[2]?`<span class="dnote">— ${d[2]}</span>`:""}${svc(nd.name+" "+d[1])}</span></div>`).join("")}</div>`;wireApple(box);}
function loadDisco(nd){
  const box=document.getElementById("discoBox");if(!box)return;
  const key=lsKey("disco_"+nd.id);let cached=null;try{cached=JSON.parse(localStorage.getItem(key)||"null");}catch(e){}
  if(cached&&cached.items&&Date.now()-(cached.ts||0)<30*864e5){renderDisco(box,nd,cached.items);return;}
  resolveAndFetch(nd).then(items=>{try{localStorage.setItem(key,JSON.stringify({items,ts:Date.now()}));}catch(e){}if(curId===nd.id)renderDisco(box,nd,items);}).catch(()=>{if(curId===nd.id)renderFallback(box,nd);});
}
function mono(name){const p=name.split(" ").filter(Boolean);return((p[0][0]||"")+(p.length>1?p[p.length-1][0]:"")).toUpperCase();}
function loadPhoto(nd){
  const av=document.getElementById("pavatar");if(!av)return;
  const key=lsKey("photo_"+nd.id);let cached=null;try{cached=localStorage.getItem(key);}catch(e){}
  const set=url=>{if(url&&url!=="none"&&curId===nd.id){const img=new Image();img.alt=nd.name;img.onload=()=>{if(curId===nd.id){av.classList.add("hasimg");av.innerHTML="";av.appendChild(img);const cr=document.getElementById("pcredit");if(cr){cr.href="https://en.wikipedia.org/wiki/"+encodeURIComponent(WIKI[nd.id]||nd.name);cr.textContent="Photo: Wikipedia";cr.classList.add("show");}}};img.src=url;}};
  if(cached!==null){set(cached);return;}
  const title=WIKI[nd.id]||nd.name;
  fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`).then(r=>r.ok?r.json():Promise.reject()).then(d=>{const url=(d.type==="standard"&&d.thumbnail&&d.thumbnail.source)?d.thumbnail.source:"none";try{localStorage.setItem(key,url);}catch(e){}set(url);}).catch(()=>{});
}
addEventListener("keydown",ev=>{if(ev.key==="Escape"){if(pageOpen)closePage();else deselect();}});

/* ----------  SEARCH (diacritic-folded, typo-tolerant, scored)  ---------- */
const fold=s=>String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
function levCap(a,b,cap){ // Levenshtein distance, bails out above cap
  if(Math.abs(a.length-b.length)>cap)return cap+1;
  let prev=[];for(let j=0;j<=b.length;j++)prev[j]=j;
  for(let i=1;i<=a.length;i++){
    const cur=[i];let rowMin=i;
    for(let j=1;j<=b.length;j++){
      cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
      if(cur[j]<rowMin)rowMin=cur[j];
    }
    if(rowMin>cap)return cap+1;
    prev=cur;
  }
  return prev[b.length];
}
function searchScore(nd,v){
  if(nd._sname.startsWith(v))return 100;
  for(const w of nd._swords)if(w.startsWith(v))return 84;
  if(nd._sname.includes(v))return 66;
  if(v.length>=4){ // typo tolerance: "thelonius" still finds Thelonious
    const cap=v.length>=7?2:1;
    let best=cap+1;
    for(const w of nd._swords.concat([nd._sname])){const d=levCap(v,w,cap);if(d<best)best=d;}
    if(best<=cap)return 58-12*best;
  }
  if(nd._srole.includes(v))return 40;
  return 0;
}
/* song search: match the curated signature/essential recordings (nd.disco titles),
   so a user who knows a song but not the artist can find their way in. Scored like
   the artist search, with the same typo tolerance. */
function songScore(t,v){
  if(t.startsWith(v))return 100;
  const words=t.split(/\s+/);
  for(const w of words)if(w.startsWith(v))return 80;
  if(t.includes(v))return 60;
  if(v.length>=4){const cap=v.length>=7?2:1;let best=cap+1;for(const w of words.concat([t])){const d=levCap(v,w,cap);if(d<best)best=d;}if(best<=cap)return 48-12*best;}
  return 0;
}
const q=document.getElementById("q"),suggest=document.getElementById("suggest");
let sIdx=-1,sList=[],SONGS=[];
q.addEventListener("input",()=>{
  const v=fold(q.value.trim());
  if(!v){suggest.style.display="none";return;}
  const arts=NODES.map(nd=>[searchScore(nd,v),nd]).filter(x=>x[0]>0)
    .sort((x,y)=>y[0]-x[0]||y[1].deg-x[1].deg).slice(0,8).map(x=>x[1]);
  const seen=new Set();
  const songs=SONGS.map(s=>[songScore(s.t,v),s]).filter(x=>x[0]>0)
    .sort((x,y)=>y[0]-x[0]||y[1].nd.deg-x[1].nd.deg)
    .filter(x=>{const k=x[1].t+"|"+x[1].nd.id;if(seen.has(k))return false;seen.add(k);return true;})
    .slice(0,6).map(x=>x[1]);
  sList=arts.map(nd=>({nd})).concat(songs.map(s=>({nd:s.nd,song:s})));sIdx=-1;
  if(!sList.length){suggest.style.display="none";return;}
  let html=arts.map((nd,i)=>`<div class="srow" data-i="${i}">${esc(nd.name)} <span class="smeta">${esc(nd.instr)}</span></div>`).join("");
  if(songs.length)html+=`<div class="shead">Songs</div>`+songs.map((s,j)=>`<div class="srow sgrow" data-i="${arts.length+j}"><span class="snote">♪</span> ${esc(s.title)} <span class="smeta">— ${esc(s.nd.name)}${s.year?" · "+esc(String(s.year)):""}</span></div>`).join("");
  suggest.innerHTML=html;
  suggest.style.display="block";
  suggest.querySelectorAll("[data-i]").forEach(el=>{el.onclick=()=>pick(sList[+el.dataset.i].nd);});
});
q.addEventListener("keydown",ev=>{
  if(suggest.style.display!=="block")return;
  const items=suggest.querySelectorAll("[data-i]");
  if(ev.key==="ArrowDown")sIdx=Math.min(sList.length-1,sIdx+1);
  else if(ev.key==="ArrowUp")sIdx=Math.max(0,sIdx-1);
  else if(ev.key==="Enter"){pick((sList[sIdx<0?0:sIdx]||{}).nd);return;}
  else return;
  items.forEach((el,i)=>el.classList.toggle("active",i===sIdx));ev.preventDefault();
});
function pick(nd){if(!nd)return;if(!activeEras.has(nd.era)){activeEras.add(nd.era);const lab=legend.querySelector(`[data-era="${nd.era}"]`);if(lab)lab.classList.remove("off");}if(instrFilter&&nd.instr!==instrFilter){instrFilter=null;const ie=document.getElementById("instr");if(ie)ie.value="";}q.value="";suggest.style.display="none";centerOn(nd);select(nd);}
document.addEventListener("click",ev=>{if(!q.parentNode.contains(ev.target))suggest.style.display="none";});

const spreadEl=document.getElementById("spread");
if(spreadEl){spreadEl.value=spread;spreadEl.oninput=()=>{spread=parseFloat(spreadEl.value);alpha=Math.max(alpha,0.75);};}

/* ----------  AUDIO PREVIEW CLIPS (Deezer / Apple iTunes)  ---------- */
const clip=(typeof Audio!=="undefined")?new Audio():null;
let clipFor=null;
const SILENT="data:audio/wav;base64,UklGRoQJAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YWAJAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA=";
let audioUnlocked=false;
function unlockAudio(){if(!clip||audioUnlocked)return;audioUnlocked=true;try{clip.src=SILENT;const p=clip.play();if(p&&p.catch)p.catch(()=>{audioUnlocked=false;});}catch(e){audioUnlocked=false;}}
function setTrackInfo(title,year){const tk=document.getElementById("cliptrack");if(!tk)return;const t=(title||"").trim();if(!t){tk.classList.remove("show");tk.textContent="";return;}tk.textContent=year?t+"  ("+year+")":t;tk.classList.add("show");}
function clipNote(msg,hold){const el=document.getElementById("clipnote");if(!el)return;const tx=document.getElementById("clipnotetext")||el;clearTimeout(clipNote._t);const tk=document.getElementById("cliptrack");if(tk){tk.textContent="";tk.classList.remove("show");}if(!msg){el.classList.remove("show");return;}tx.textContent=msg;/* sit just under the topbar, whatever height it wraps to at this width */const bar=document.querySelector(".topbar");if(bar)el.style.top=(Math.round(bar.getBoundingClientRect().bottom)+10)+"px";el.classList.add("show");clipNote._t=setTimeout(()=>el.classList.remove("show"),hold||2600);}
/* Trustworthy release year for the now-playing box. iTunes returns the release
   date of *its* catalogue item, which for older recordings is usually a modern
   reissue/remaster (a 1939 Glenn Miller side comes back as 1991). So: prefer the
   curated discography year when the playing track matches a curated record, else
   accept the API year only if it's plausible for the artist's lifespan, else
   show no year rather than a misleading one. */
function _normTrk(s){return String(s||"").toLowerCase().replace(/\(.*?\)/g," ").replace(/\b(remaster(ed)?|mono|stereo|version|edit|single|deluxe|anniversary|live|take\s*\d*)\b/g," ").replace(/[^a-z0-9]+/g," ").trim();}
function discoYear(nd,title){if(!nd||!nd.disco)return "";const tt=_normTrk(title);if(!tt)return "";
  for(const d of nd.disco){const dt=_normTrk(d&&d[1]);if(dt&&(dt===tt||dt.indexOf(tt)>=0||tt.indexOf(dt)>=0)){const m=String((d&&d[0])||"").match(/\d{4}s?/);if(m)return m[0];}}return "";}
function yearPlausible(nd,y){y=parseInt(y,10);if(!y)return false;const life=(nd&&nd.life)||"";const ys=(life.match(/\d{4}/g)||[]).map(Number);if(!ys.length)return true;
  const hasRange=/\d{4}\s*[–-]\s*\d{4}/.test(life),now=(new Date()).getFullYear();return y>=Math.min(...ys)-1 && y<=(hasRange?Math.max(...ys)+2:now+1);}
function trustYear(nd,apiYear,title){const dy=discoYear(nd,title);if(dy)return dy;const y=parseInt(apiYear,10);return (y&&yearPlausible(nd,y))?String(y):"";}
/* ----  NOW-PLAYING WAVEFORM  ----
   Pulses to the REAL music when the audio is analysable. Apple's previews are
   CORS-readable, so we fetch + decodeAudioData the exact clip that's playing,
   build a loudness envelope, and drive the line from it at the LIVE playback
   position (clip.currentTime). Deezer's previews are signed/unreadable (403 on
   fetch), so those gracefully fall back to a gentle simulated oscilloscope.
   Runs only while audio plays; driven by the <audio> element's own events so it
   covers main + collab clips. (Why not a live AnalyserNode? createMediaElement-
   Source on a cross-origin element outputs silence and can't be undone — it
   would break Deezer playback. Offline decode keeps playback untouched.) */
let _wcv,_wctx,_wraf=0,_wt0=0,_wrun=false,_wamp=0.3; const _wW=56,_wH=18;
let _actx, _env=null, _envKey=null; const _envBps=60, _envCache=new Map();
function _getACtx(){ if(_actx===undefined){ try{_actx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){_actx=null;} } return _actx; }
function analyzeClip(url){
  if(!url||url.indexOf("data:")===0) return;
  if(_envKey===url) return;                       /* already analysing/have this clip */
  _envKey=url; _env=null;                          /* new clip → simulated until ready */
  if(_envCache.has(url)){ _env=_envCache.get(url); return; }
  if(!/itunes\.apple\.com/i.test(url)) return;     /* Deezer etc. can't be fetched → stay simulated */
  const ac=_getACtx(); if(!ac) return;
  fetch(url,{mode:"cors"}).then(r=>{ if(!r.ok) throw 0; return r.arrayBuffer(); })
    .then(buf=> ac.decodeAudioData(buf))
    .then(audio=>{ if(_envKey!==url) return;       /* superseded by a newer clip */
      const ch=audio.getChannelData(0), nb=Math.max(1,Math.ceil(audio.duration*_envBps)), per=Math.floor(ch.length/nb)||1, env=new Float32Array(nb); let peak=0;
      for(let b=0;b<nb;b++){ let mx=0; const s=b*per,e=Math.min(ch.length,s+per); for(let i=s;i<e;i++){ const a=Math.abs(ch[i]); if(a>mx)mx=a; } env[b]=mx; if(mx>peak)peak=mx; }
      if(peak>0) for(let i=0;i<nb;i++) env[i]/=peak;        /* normalise to 0..1 */
      _envCache.set(url,env); if(_envKey===url) _env=env;
    }).catch(()=>{ /* leave _env null → simulated fallback */ });
}
function waveStart(){ if(_wrun)return;
  if(!_wcv){ _wcv=document.getElementById("clipwave"); if(!_wcv)return; _wctx=_wcv.getContext("2d");
    const dpr=Math.min(devicePixelRatio||1,2); _wcv.width=_wW*dpr; _wcv.height=_wH*dpr; _wctx.scale(dpr,dpr); }
  _wrun=true; _wamp=0.3; const note=document.getElementById("clipnote"); if(note)note.classList.add("playing");
  _wt0=performance.now(); _wraf=requestAnimationFrame(waveTick); }
function waveStop(){ _wrun=false; if(_wraf)cancelAnimationFrame(_wraf); _wraf=0;
  const note=document.getElementById("clipnote"); if(note)note.classList.remove("playing"); }
function waveTick(ts){ if(!_wrun||!_wctx)return; const t=(ts-_wt0)/1000, w=_wW, h=_wH, mid=h/2;
  /* amplitude: REAL loudness from the decoded envelope at the live position; else
     a gentle idle breath while there's no envelope (Deezer / still loading). */
  let target;
  if(_env&&clip&&!clip.paused){ let i=(clip.currentTime*_envBps)|0; if(i<0)i=0; if(i>=_env.length)i=_env.length-1; target=0.1+1.0*Math.pow(_env[i],1.3); }  /* gamma>1 = more contrast → beats pop harder */
  else target=0.5+0.18*Math.sin(t*2.1);
  _wamp += (target>_wamp?0.62:0.2)*(target-_wamp);   /* snappier attack + quicker drop → punchier */
  _wctx.clearRect(0,0,w,h); _wctx.lineWidth=1.9; _wctx.lineJoin="round";
  _wctx.strokeStyle="#e8c074"; _wctx.shadowColor="rgba(224,177,90,.55)"; _wctx.shadowBlur=3;
  _wctx.beginPath();
  for(let x=0;x<=w;x++){ const nx=x/w, env=Math.sin(nx*Math.PI),
      y=mid+env*_wamp*((h*0.28)*Math.sin(nx*9+t*4.2)+(h*0.16)*Math.sin(nx*22-t*6.1+1.3)+(h*0.09)*Math.sin(nx*40+t*9.0));
    x===0?_wctx.moveTo(x,y):_wctx.lineTo(x,y); }
  _wctx.stroke(); _wraf=requestAnimationFrame(waveTick); }
if(clip){
  clip.addEventListener("playing",()=>{ if(clip.src&&clip.src.indexOf("data:")===0)return; analyzeClip(clip.src); waveStart(); }); /* skip the silent unlock blip */
  clip.addEventListener("pause", waveStop);
  clip.addEventListener("ended", waveStop);
  clip.addEventListener("emptied", waveStop);
}
function playPreview(url,name,title,year){if(!clip)return;if(!url||url==="none"){clipNote("No preview found for "+name);return;}clip.src=url;try{clip.currentTime=0;}catch(e){}const p=clip.play();if(p&&p.catch)p.catch(()=>{clipNote("Tap again to hear "+name);});clipNote("♪  "+name,32000);if(title)setTrackInfo(title,year);}
/* ----  SELF-CORRECTING PREVIEW PLAYBACK  ----
   A resolved URL is only proof the *catalogue* has a clip — not that THIS device
   can play it. Deezer's preview CDN is on tracker blocklists and its URLs are
   signed and expire within weeks, so a perfectly good Deezer URL can resolve and
   then fail to load on a given desktop (and stay broken once cached). So: cache a
   main-player URL only once it actually *plays* (the `playing` event), and if it
   errors, drop it and re-resolve from the OTHER provider (Apple ⇄ Deezer). That
   makes playback heal itself across blocked CDNs and expired links — no user
   action, nothing poisoned. `mainPlay` tracks the current main-player attempt;
   the handlers no-op for collab clips (different `clipFor` tag). */
let mainPlay=null;
const provOf=u=>/itunes\.apple\.com/i.test(u||"")?"it":"dz";
if(clip){
  clip.addEventListener("playing",()=>{
    if(mainPlay&&clipFor===mainPlay.id&&mainPlay.url){try{localStorage.setItem(lsKey("clip2_"+mainPlay.id),JSON.stringify({url:mainPlay.url,title:mainPlay.title||"",year:mainPlay.year||""}));}catch(e){}}
  });
  clip.addEventListener("error",()=>{
    if(!mainPlay||clipFor!==mainPlay.id||mainPlay.alt)return;
    if(mainPlay.url&&clip.src&&clip.src!==mainPlay.url)return; /* error from a since-replaced src */
    mainPlay.alt=true;try{localStorage.removeItem(lsKey("clip2_"+mainPlay.id));}catch(e){}
    const id=mainPlay.id,nm=mainPlay.name,want=mainPlay.want,ov=mainPlay.ov||{};
    clipNote("♪  finding "+nm+"…",6500);
    const play2=(hit,prov)=>{if(clipFor!==id)return;const u=hit&&hit.url;if(!u){clipNote("No preview found for "+nm);return;}const yr=trustYear(mainPlay.nd,hit.year,hit.title);mainPlay.url=u;mainPlay.prov=prov;mainPlay.title=hit.title||"";mainPlay.year=yr;clip.src=u;try{clip.currentTime=0;}catch(e){}const p=clip.play();if(p&&p.catch)p.catch(()=>clipNote("Tap again to hear "+nm));clipNote("♪  "+nm,32000);if(hit.title)setTrackInfo(hit.title,yr);};
    const pf=mainPlay.title||"";
    if(mainPlay.prov==="it"){ /* Apple failed → try Deezer */
      const viaSearch=()=>dzSearch(nm,arr=>{const cands=(arr||[]).filter(x=>x&&x.preview&&artistMatch(x.artist&&x.artist.name,want));const t=(pf&&cands.find(x=>trackTitleMatch(pf,x.title)))||cands[0];play2(t?{url:t.preview,title:t.title,year:((t.album&&t.album.release_date)||t.release_date||"").slice(0,4)}:null,"dz");});
      if(ov.did)dzArtistTop(ov.did,u=>u?play2({url:u},"dz"):viaSearch());else viaSearch();
    }else{ /* Deezer (or unknown) failed → try Apple */
      itSearch(nm,want,hit=>play2(hit,"it"),pf);
    }
  });
}
function jsonpLookup(term,cb){
  if(typeof document==="undefined"||!document.body){cb(null);return;}
  const id="itcb"+(Math.random()*1e9|0);let done=false;
  const s=document.createElement("script");
  function cleanup(){try{delete window[id];}catch(e){window[id]=undefined;}if(s.parentNode)s.parentNode.removeChild(s);}
  window[id]=data=>{if(done)return;done=true;cleanup();const r=((data&&data.results)||[]).find(x=>x.previewUrl);cb(r?r.previewUrl:"none");};
  s.onerror=()=>{if(!done){done=true;cleanup();cb(null);}};
  s.src="https://itunes.apple.com/search?term="+encodeURIComponent(term)+"&media=music&entity=song&attribute=artistTerm&limit=4&callback="+id;
  document.body.appendChild(s);
  setTimeout(()=>{if(!done){done=true;cleanup();cb(null);}},6500);
}
function tfetch(u,ms){return Promise.race([fetch(u).then(r=>r.ok?r.json():Promise.reject()),new Promise((_,rej)=>setTimeout(rej,ms))]);}
function fetchJSON(url){let p=Promise.reject();["https://jazz-itunes.hueyb.workers.dev/?url=","","https://corsproxy.io/?url=","https://api.allorigins.win/raw?url="].forEach(px=>{p=p.catch(()=>tfetch(px?px+encodeURIComponent(url):url,3500));});return p;}
/* Verified previews: only play a clip whose artist actually matches the star.
   pnorm() normalises names so "Lee \"Scratch\" Perry" == "lee scratch perry", etc. */
function pnorm(s){return (s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/&/g," and ").replace(/\bthe\b/g," ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function artistMatch(a,b){a=pnorm(a);b=pnorm(b);return !!a&&!!b&&a===b;}
function jsonp(url,cb){if(typeof document==="undefined"||!document.body){cb(null);return;}const id="jp"+(Math.random()*1e9|0);let done=false;const s=document.createElement("script");const fin=v=>{if(done)return;done=true;try{delete window[id];}catch(e){window[id]=undefined;}if(s.parentNode)s.parentNode.removeChild(s);cb(v);};window[id]=d=>fin(d);s.onerror=()=>fin(null);s.src=url+(url.indexOf("?")<0?"?":"&")+"output=jsonp&callback="+id;document.body.appendChild(s);setTimeout(()=>fin(null),6500);}
function dzSearch(q,cb){jsonp("https://api.deezer.com/search?q="+encodeURIComponent(q)+"&limit=12",d=>cb((d&&d.data)||[]));}
function dzArtistTop(aid,cb){jsonp("https://api.deezer.com/artist/"+aid+"/top?limit=1",d=>{const t=(d&&d.data&&d.data[0]);cb(t&&t.preview?t.preview:null);});}
/* prefer the *signature* track: among the right artist's previews, pick the one
   whose title matches the curated seed, else fall back to the first (so coverage
   never drops — a non-song seed just yields the old behaviour). */
function trackTitleMatch(want,got){const a=_normTrk(want),b=_normTrk(got);if(!a||!b||a.length<3||b.length<3)return false;return a===b||a.indexOf(b)>=0||b.indexOf(a)>=0;}
function itSearch(term,want,cb,pref){let done=false;const fin=v=>{if(done)return;done=true;cb(v);};setTimeout(()=>fin(null),12000);const u="https://itunes.apple.com/search?term="+encodeURIComponent(term)+"&media=music&entity=song&limit=15";const match=res=>{const cands=(res||[]).filter(x=>x.previewUrl&&artistMatch(x.artistName,want));const r=(pref&&cands.find(x=>trackTitleMatch(pref,x.trackName)))||cands[0];fin(r?{url:r.previewUrl,title:r.trackName||"",year:(r.releaseDate||"").slice(0,4)}:null);};if(typeof fetch==="undefined"){jsonp(u,d=>match(d&&d.results));return;}fetchJSON(u).then(d=>match(d&&d.results)).catch(()=>jsonp(u,d=>match(d&&d.results)));}
function playClip(nd){
  if(!clip)return;
  if(G&&G.noAudio)return;   /* visual-art build: no preview audio */
  clipFor=nd.id;
  const ov=(G.preview||{})[nd.id]||{}, want=ov.artist||nd.name;
  let cached=null;try{cached=localStorage.getItem(lsKey("clip2_"+nd.id));}catch(e){}  /* clip2_ = new namespace; old clip_ (Deezer-biased) caches are ignored so plays re-resolve Apple-first */
  /* Only a real URL short-circuits. A past "none" (a transient lookup miss — a
     dropped request, an offline moment, the old pre-unlock audio bug) must NOT
     silence an artist forever, so we ignore it and re-resolve. We cache hits
     only (on the `playing` event), never misses; a cached URL that no longer
     plays is dropped and re-resolved from the other provider. */
  if(cached&&cached!=="none"){let c=null;try{c=JSON.parse(cached);}catch(e){}if(!c||!c.url)c={url:cached,title:"",year:""};  /* back-compat: old caches stored a bare URL string */
    const yr=trustYear(nd,c.year,c.title);mainPlay={id:nd.id,name:nd.name,want:want,ov:ov,nd:nd,url:c.url,title:c.title||"",year:yr,prov:provOf(c.url),alt:false};playPreview(c.url,nd.name,c.title,yr);return;}
  clipNote("♪  finding "+nd.name+"…",6500);
  const seed=(nd.disco&&nd.disco[0]&&nd.disco[0][1])||"";
  const q1=ov.q||(seed&&!/^with /i.test(seed)?nd.name+" "+seed:nd.name);
  const q2=nd.name;
  const done=hit=>{if(clipFor!==nd.id)return;if(hit&&hit.url){const yr=trustYear(nd,hit.year,hit.title);mainPlay={id:nd.id,name:nd.name,want:want,ov:ov,nd:nd,url:hit.url,title:hit.title||"",year:yr,prov:provOf(hit.url),alt:false};playPreview(hit.url,nd.name,hit.title,yr);}else clipNote("No verified preview for "+nd.name);};
  const search=(q,next)=>dzSearch(q,arr=>{if(clipFor!==nd.id)return;const cands=(arr||[]).filter(x=>x&&x.preview&&artistMatch(x.artist&&x.artist.name,want));const t=(seed&&cands.find(x=>trackTitleMatch(seed,x.title)))||cands[0];if(t)done({url:t.preview,title:t.title||"",year:((t.album&&t.album.release_date)||t.release_date||"").slice(0,4)});else next();});
  const apple=(q,next)=>itSearch(q,want,hit=>{if(clipFor!==nd.id)return;if(hit)done(hit);else next();},seed);
  /* Apple is PREFERRED: its previews are CORS-readable so the now-playing waveform
     can analyse the real audio, and its CDN is the robust one (not blocklisted,
     links don't expire). Deezer stays the fallback, with all the self-correcting
     logic. ov.only artists (famous-namesake collisions) keep the Deezer-only
     specific-query path so we never grab the wrong namesake. */
  const dzFallback=()=>{ const tail=()=>q1!==q2?search(q2,()=>done(null)):done(null);
    if(ov.did){dzArtistTop(ov.did,u=>{if(clipFor!==nd.id)return;if(u)done({url:u});else search(q1,tail);});}
    else search(q1,tail); };
  if(ov.only) search(q1,()=>done(null));
  else apple(ov.q||q2, dzFallback);
}

/* frame the voyage: recentre the tunnel (toStart=true snaps back to the genre's beginnings) */
function fitView(){if(viewMode==="chord"){frameChord();return;}let R=1;for(const nd of NODES){if(!visible(nd))continue;R=Math.max(R,Math.hypot(nd.x,nd.y,nd.z));}tzoom=Math.max(0.3,Math.min(2.4,(Math.min(W,H)*0.46)/R));tyaw=null;}
const fitBtn=document.getElementById("fitBtn");if(fitBtn)fitBtn.onclick=fitView;
/* ----------  HIGH-RES POSTER EXPORT (prints)  ----------
   Renders the current view to a large square at print resolution and downloads
   a PNG. Works by scaling the main canvas up, drawing once, exporting, and
   restoring — all synchronous, so the screen never repaints the big frame. */
function exportPoster(){
  const S=4000, L=1400, SC=S/L;
  const bg=(getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())||"#0c0a0d";
  const sv={W,H,viewX,viewY,tviewX,tviewY,zoom,tzoom,cw:canvas.width,ch:canvas.height,csw:canvas.style.width,csh:canvas.style.height};
  try{
    canvas.width=S;canvas.height=S;ctx.setTransform(SC,0,0,SC,0,0);
    W=L;H=L;viewX=0;viewY=0;tviewX=0;tviewY=0;
    if(viewMode==="chord")zoom=tzoom=(L*0.84)/(CHORD_R*2);
    else{let R=1;for(const nd of NODES){if(!visible(nd))continue;R=Math.max(R,Math.hypot(nd.x,nd.y,nd.z));}zoom=tzoom=Math.max(0.3,Math.min(2.6,(L*0.42)/R));}
    ctx.fillStyle=bg;ctx.fillRect(0,0,L,L);
    draw();
    ctx.save();ctx.textAlign="center";ctx.textBaseline="alphabetic";ctx.shadowColor="rgba(0,0,0,0.95)";ctx.shadowBlur=10;
    ctx.fillStyle="rgba(243,236,224,0.96)";ctx.font="600 26px Helvetica Neue, Arial";
    ctx.fillText(SINGLE?BRAND:G.name,L/2,L-46);
    const sub=CFG.attribution||TAGLINE||"";
    if(sub){ctx.fillStyle="rgba(224,177,90,0.88)";ctx.font="14px Helvetica Neue, Arial";ctx.fillText(sub,L/2,L-24);}
    ctx.restore();
    const a=document.createElement("a");
    a.download=(((SINGLE?BRAND:G.name)||"constellation").replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"").toLowerCase()||"constellation")+".png";
    a.href=canvas.toDataURL("image/png");
    document.body.appendChild(a);a.click();a.remove();
  }finally{
    W=sv.W;H=sv.H;viewX=sv.viewX;viewY=sv.viewY;tviewX=sv.tviewX;tviewY=sv.tviewY;zoom=sv.zoom;tzoom=sv.tzoom;
    canvas.width=sv.cw;canvas.height=sv.ch;canvas.style.width=sv.csw;canvas.style.height=sv.csh;
    ctx.setTransform(DPR,0,0,DPR,0,0);draw();
  }
}
const posterBtn=document.getElementById("posterBtn");if(posterBtn)posterBtn.onclick=exportPoster;
let userFramed=false;["wheel","mousedown"].forEach(ev=>canvas.addEventListener(ev,()=>{userFramed=true;}));

/* ----------  GLOBE ⇄ CHORD-WEB TOGGLE  ---------- */
const chordBtn=document.getElementById("chordBtn");
const holoBtn=document.getElementById("holoBtn");
const stageEl=document.getElementById("stage"),spreadBox=document.querySelector(".spread");
const hintEl=document.querySelector(".hint");
const HINT_GLOBE=hintEl?hintEl.innerHTML:"";
const HINT_CHORD=MOBILE
  ? '<b>Tap a star</b> to anchor it &amp; light its ties &middot; <b>then tap a name</b> to reveal the records they made together<br><b>Drag</b> to pan &middot; <b>pinch</b> to zoom &middot; it drifts slowly until you touch it'
  : '<b>Click a star</b> to anchor it &amp; light its ties (in silence) &middot; <b>then click a tie</b> to reveal records they made together<br><b>Drag</b> to pan &middot; <b>Scroll</b> to zoom &middot; it drifts slowly until you touch it';
const HINT_HOLO=MOBILE
  ? '<b>Drag</b> to orbit &middot; <b>pinch</b> to zoom &middot; <b>tap a name</b> to open an artist'
  : '<b>Drag</b> to orbit &middot; <b>two fingers up/down</b> to zoom &middot; <b>click a name</b> to open an artist';
function frameChord(){tviewX=0;tviewY=0;tzoom=Math.max(0.32,Math.min(2,(Math.min(W,H)-150)/(CHORD_R*2)));}
function setView(mode){
  if(viewMode===mode)return;
  /* The selected artist follows you across views so you can keep digging. selNode
     is the unified "who's selected" in all three views (globe select / chord
     chordPick / a 3D tap's MCH.select all set it). Capture it before the per-mode
     deselect() clears it, then re-apply on the way in — silently (no clip replay):
     globe & 3D re-open the card, chord re-anchors (its native card-less state). */
  const carry=(selNode&&byId[selNode.id])?selNode:null;
  const prev=viewMode; viewMode=mode;
  if(chordBtn)chordBtn.classList.toggle("on",mode==="chord"||mode==="timeline");
  if(holoBtn)holoBtn.classList.toggle("on",mode==="holo");
  if(hintEl)hintEl.innerHTML=mode==="timeline"?"<b>Movements</b> flow left→right by year &middot; <b>Hover/Click</b> to trace ties &middot; <b>Drag</b> to pan &middot; <b>Scroll</b> to zoom":mode==="chord"?HINT_CHORD:mode==="holo"?HINT_HOLO:HINT_GLOBE;
  alpha=1;userFramed=false;
  updateHashView();
  if(mode==="holo"){
    deselect();
    if(stageEl)stageEl.style.display="none"; if(spreadBox)spreadBox.style.display="none";
    if(window.HOLO)window.HOLO.enter(carry);
    if(carry)select(carry,true);
    return;
  }
  if(prev==="holo"){ if(window.HOLO)window.HOLO.exit(); if(stageEl)stageEl.style.display=""; if(spreadBox)spreadBox.style.display=""; }
  if(mode==="chord"){chordSpin=0;chordIdle=0;deselect();yaw=0;pitch=0;tyaw=0;tpitch=0;vyaw=0;vpitch=0;frameChord();if(carry)chordPick(carry);}
  else if(mode==="timeline"){deselect();frameTimeline();if(carry)select(carry,true);}
  else{NODES.forEach(nd=>{nd.vz+=(Math.random()-.5)*8;});tviewX=0;tviewY=0;setTimeout(fitView,1800);if(carry)select(carry,true);}
}
if(chordBtn)chordBtn.onclick=()=>setView((G&&G.noAudio)?(viewMode==="timeline"?"globe":"timeline"):(viewMode==="chord"?"globe":"chord"));
if(holoBtn)holoBtn.onclick=()=>setView(viewMode==="holo"?"globe":"holo");

/* ----------  GENRE LOADING, THEME & ROUTING  ---------- */
const legend=document.getElementById("legend");let legendCollapsed=MOBILE;
const instrEl=document.getElementById("instr");
const gtabs=document.getElementById("gtabs");
GENRE_ORDER.forEach(k=>{
  const b=document.createElement("button");
  b.className="gtab";b.dataset.g=k;b.textContent=GENRES[k].shortName;
  b.onclick=()=>switchGenre(k);
  gtabs.appendChild(b);
});
/* ---- white-label branding (defaults reproduce the public site) ---- */
(function brand(){
  const tagEl=document.querySelector(".tag");
  if(tagEl){if(SINGLE){tagEl.textContent=TAGLINE;}else{tagEl.textContent=BRAND;if(TAGLINE){const x=document.createElement("span");x.className="tagx";x.textContent=" · "+TAGLINE;tagEl.appendChild(x);}}}
  if(CFG.showTabs===false||GENRE_ORDER.length<=1)gtabs.style.display="none";
  if(CFG.accent)document.documentElement.style.setProperty("--gold",CFG.accent);
  if(CFG.attribution){const a=document.createElement("div");a.className="attribution";a.textContent=CFG.attribution;const br=document.querySelector(".brand");if(br)br.appendChild(a);}
})();
function loadGenre(key){
  G=GENRES[key];
  /* "Beef" ties are hidden pending review with the hip-hop community (2026-06-23).
     Delete the .filter below to restore them. Beef edges exist only in hip-hop, so
     this is a no-op for the other genres. The data itself is untouched. */
  ERAS=G.eras;NODES=G.nodes;EDGES=G.edges.filter(ed=>ed.rel!=="beef");LIB=G.lib;CRITICS=G.critics;RESOURCES=G.resources;ARCHIVES=G.archives||[];RADIO=G.radio||[];FILMS=G.films||[];DEEPCUTS=G.deepcuts||[];REFS=G.refs||[];WIKI=G.wiki;SYM=G.sym;
  /* reset interaction state */
  hoverNode=null;selNode=null;chordAnchor=null;focusSet=null;curId=null;
  panel.classList.remove("open");closePage();if(clip)clip.pause();clipNote("");
  /* index, degrees, adjacency, edge kinds */
  byId={};NODES.forEach(nd=>{byId[nd.id]=nd;nd.deg=0;});
  EDGES.forEach(ed=>{ed.s=byId[ed.a];ed.t=byId[ed.b];ed.kind=kindOf(ed.rel);if(ed.s&&ed.t){ed.s.deg++;ed.t.deg++;}});
  adj={};NODES.forEach(nd=>adj[nd.id]=new Set());EDGES.forEach(ed=>{if(ed.s&&ed.t){adj[ed.a].add(ed.b);adj[ed.b].add(ed.a);}});
  /* role categories + search index + sphere seeding */
  const rules=G.roleGroups.map(([re,label])=>[new RegExp(re),label]);
  const instrumentOf=role=>{const r=role.split("·")[0].trim().toLowerCase();for(const [re,label] of rules)if(re.test(r))return label;return"Other";};
  NODES.forEach(nd=>{
    const u=Math.random(),v=Math.random(),th=Math.acos(2*u-1),ph=2*Math.PI*v,rr=170*Math.cbrt(Math.random());
    nd.x=rr*Math.sin(th)*Math.cos(ph);nd.y=rr*Math.sin(th)*Math.sin(ph);nd.z=rr*Math.cos(th);
    nd.vx=0;nd.vy=0;nd.vz=0;nd.hl=0;nd._pa=0;nd.twp=Math.random()*6.28;
    nd.instr=nd.movement||instrumentOf(nd.role);   /* art: filter by movement; music: by instrument */
    nd.roleTag=(nd.role||"").split("·")[0].trim();   /* short tag under the name — movement (art) / instrument (music) */
    nd.discoAs=G.discoAs[nd.id]||null;
    nd.mbid=(G.mbid||{})[nd.id]||null;
  });
  NODES.forEach(nd=>{nd._sname=fold(nd.name);nd._swords=nd._sname.split(/\s+/);nd._srole=fold(nd.role+" "+nd.instr);});
  SONGS=[];NODES.forEach(nd=>{(nd.disco||[]).forEach(d=>{const ti=(d&&d[1])||"";if(ti&&ti.length>1)SONGS.push({t:fold(ti),title:ti,year:(d&&d[0])||"",nd});});});
  /* chord-web: each star's fixed angle on the ring, ordered by era (matches the era arcs) */
  const ekeys=Object.keys(ERAS);let ci=0;
  ekeys.forEach(k=>{NODES.forEach(nd=>{if(nd.era===k){nd._cang=ci/NODES.length*6.2832-1.5708;ci++;}});});
  chordSpin=0;chordIdle=0;
  viewX=0;tviewX=0;viewY=0;tviewY=0;
  /* hand the live data + positions to the lazy-loaded 3D view; rebuild on a genre swap */
  window.MCH={key,nodes:NODES,edges:EDGES,adj,byId,ERAS,theme:G.theme,select,unlock:unlockAudio};
  if(viewMode==="holo"&&window.HOLO)window.HOLO.rebuild();
  /* theme — @property-registered vars cross-fade in CSS */
  const rs=document.documentElement.style;
  rs.setProperty("--bg",G.theme.bg);rs.setProperty("--glow",G.theme.glow);
  rs.setProperty("--deep",G.theme.deep);rs.setProperty("--panel",G.theme.panel);
  /* identity: umbrella brand stays in the tab title so no genre route
     can be mistaken for one of the legacy single-genre sites */
  document.title=G.shortName+" · "+BRAND+" — "+TAGLINE;
  const gn=document.getElementById("gname");gn.textContent=(SINGLE?BRAND:G.name)+" ";  /* textContent: brand may come from a URL param */
  const vsp=document.createElement("span");vsp.className="ver";vsp.textContent=window.MC_BUILD||"";gn.appendChild(vsp);
  gtabs.querySelectorAll(".gtab").forEach(b=>b.classList.toggle("on",b.dataset.g===key));
  /* legend: eras + connection-line key */
  const kinds=[...new Set(EDGES.map(ed=>ed.kind))];
  legend.innerHTML=`<button class="legh" id="legToggle">Legend<span class="chev">▾</span></button><div class="legbody"><div class="lh">Eras — click to filter</div>`
    +Object.entries(ERAS).map(([k,v])=>`<label data-era="${k}"><span class="dot" style="background:${v.color}"></span>${v.label}</label>`).join("")
    +`<div class="ekey"><div class="lh" style="margin-top:8px">Connections</div>`
    +["collab","mentor","influence","rivalry"].filter(k=>kinds.includes(k)).map(k=>`<label class="ek"><span class="eline ${k}"></span>${KIND_LABEL[k]}</label>`).join("")
    +`</div></div>`;
  legend.classList.toggle("collapsed",legendCollapsed);
  const legToggle=document.getElementById("legToggle");
  if(legToggle)legToggle.onclick=()=>{legendCollapsed=!legendCollapsed;legend.classList.toggle("collapsed",legendCollapsed);};
  legend.querySelectorAll("label[data-era]").forEach(el=>{el.onclick=()=>{const k=el.dataset.era;if(activeEras.has(k)){activeEras.delete(k);el.classList.add("off");}else{activeEras.add(k);el.classList.remove("off");}alpha=Math.max(alpha,0.4);};});
  /* filters */
  activeEras=new Set(Object.keys(ERAS));instrFilter=null;
  instrEl.innerHTML="";
  const all=document.createElement("option");all.value="";all.textContent=G.filterLabel;instrEl.appendChild(all);
  [...new Set(NODES.map(nd=>nd.instr))].sort().forEach(i=>{const o=document.createElement("option");o.value=i;o.textContent=i;instrEl.appendChild(o);});
  /* reheat the simulation and reframe */
  alpha=1;userFramed=false;
  setTimeout(()=>{if(!userFramed)fitView();},1600);
  try{localStorage.setItem("tmc_last",key);}catch(e){}
}
instrEl.onchange=()=>{instrFilter=instrEl.value||null;alpha=Math.max(alpha,0.8);userFramed=true;setTimeout(fitView,650);};

function parseHash(){const m=location.hash.match(/^#\/?([a-z]+)(?:\/([a-z]+))?/);const g=m&&GENRES[m[1]]?m[1]:null,v=m&&m[2];return{genre:g,view:v==="timeline"?"timeline":v==="chord"?"chord":v==="holo"?"holo":"globe"};}
function updateHashView(){if(!G)return;const h="#/"+G.key+(viewMode==="globe"?"":"/"+viewMode);if(location.hash!==h)try{history.replaceState(null,"",h);}catch(e){}}
addEventListener("hashchange",()=>{const p=parseHash();if(p.genre&&!trans&&G&&G.key!==p.genre)switchGenre(p.genre);if(p.view!==viewMode&&!trans)setView(p.view);});

let last=null;try{last=localStorage.getItem("tmc_last");}catch(e){}
const ph=parseHash();
const initial=ph.genre||((last&&GENRES[last])?last:GENRE_ORDER[0]);
loadGenre(initial);
if(ph.view&&ph.view!=="globe")setView(ph.view);
updateHashView();
loop();
