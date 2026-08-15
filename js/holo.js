/* ----------  3D "HOLO" VIEW  ----------
   A real WebGL rendering of the globe, lazy-loading three.js only when entered.
   It reads the LIVE data + positions the engine already simulates (window.MCH)
   and calls MCH.select(node) on click, so the 3D view inherits the genre
   switcher, the artist card, audio playback and the Rooms for free.

   Engine contract:
     window.MCH = { key, nodes, edges (with .s/.t), adj (id->Set), byId, ERAS, select }
     window.HOLO = { enter(), exit(), rebuild(), frame(), ready() }
   Three.js resolves via the import map in index.html. */
(function(){
  let THREE=null, ready=false, loading=false;
  let renderer, scene, camera, controls, lineSeg;
  let meshes=[], coreById={}, edges=[], nodeEdges={}, labelEl={}, labelOrder=[];
  let edgePos, edgeCol, edgePosAttr, edgeColAttr;
  let selected=null, dragging=false, idleTimer=null, raf=null;
  const EDGE_FAINT=[0.085,0.066,0.032], EDGE_BRIGHT=[1.0,0.80,0.42];
  const BASE_EMIS=0.26, NEIGH_EMIS=0.5, FOCUS_EMIS=0.9;   /* node self-glow: resting / neighbour / focused */
  const CW=82, CH=21;
  const canvas=document.getElementById('holoc');
  const labelsBox=document.getElementById('holabels');

  /* Fake subsurface scattering: light wraps to the silhouette, added to the
     emissive via a tiny shader injection — gives each orb a soft, lit-from-within,
     non-plastic read (the "velvet sheen" treatment chosen in lab/holo-organic). */
  function wrapSSS(mat, color, strength){
    mat.onBeforeCompile=(sh)=>{ sh.uniforms.uWrap={value:color.clone()}; sh.uniforms.uWrapK={value:strength};
      sh.fragmentShader='uniform vec3 uWrap;\nuniform float uWrapK;\n'+sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  float _ndv=clamp(dot(normalize(normal),normalize(vViewPosition)),0.0,1.0);\n  totalEmissiveRadiance += uWrap*pow(1.0-_ndv,2.3)*uWrapK;'
      ); };
    return mat;
  }
  function addStars(){
    const N=2200, pos=new Float32Array(N*3);
    for(let i=0;i<N;i++){ const r=1200+Math.random()*2400, u=Math.random(), v=Math.random(), th=Math.acos(2*u-1), ph=2*Math.PI*v;
      pos[i*3]=r*Math.sin(th)*Math.cos(ph); pos[i*3+1]=r*Math.sin(th)*Math.sin(ph); pos[i*3+2]=r*Math.cos(th); }
    const geo=new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color:0xbfb9c9, size:2.2, sizeAttenuation:false, transparent:true, opacity:0.6 })));
  }

  async function load(){
    if(THREE||loading) return;
    loading=true;
    THREE = await import('three');
    const oc = await import('three/addons/controls/OrbitControls.js');
    renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.15; renderer.outputColorSpace=THREE.SRGBColorSpace;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x05040a);
    camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 1, 8000);
    camera.position.set(0, 40, 480);
    controls = new oc.OrbitControls(camera, canvas);
    controls.enableDamping=true; controls.dampingFactor=0.05; controls.rotateSpeed=0.9;
    controls.zoomSpeed=2.6; controls.zoomToCursor=true; controls.enablePan=false;
    controls.autoRotate=true; controls.autoRotateSpeed=0.6; controls.minDistance=60; controls.maxDistance=3000;
    if(THREE.TOUCH) controls.touches={ ONE:THREE.TOUCH.ROTATE, TWO:THREE.TOUCH.DOLLY_PAN };
    controls.addEventListener('start', ()=>{ dragging=true; controls.autoRotate=false; clearTimeout(idleTimer); });
    controls.addEventListener('end',   ()=>{ dragging=false; clearTimeout(idleTimer); idleTimer=setTimeout(()=>{ controls.autoRotate=true; }, 1600); });
    /* three-point lighting rig so the orbs show real shaded form (the holo scene had no lights before) */
    const keyL=new THREE.DirectionalLight(0xfff2e0,2.4); keyL.position.set(4,6,5); scene.add(keyL);
    const rimL=new THREE.DirectionalLight(0x6fb4ff,1.5); rimL.position.set(-5,2,-6); scene.add(rimL);
    scene.add(new THREE.HemisphereLight(0x8090c0,0x101018,0.45));
    scene.add(new THREE.AmbientLight(0x202028,0.6));
    addStars(); wirePointer();
    addEventListener('resize', ()=>{ if(!renderer) return; camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
    ready=true; loading=false;
  }

  function disposeScene(){
    for(const m of meshes){ scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    if(lineSeg){ scene.remove(lineSeg); lineSeg.geometry.dispose(); lineSeg.material.dispose(); lineSeg=null; }
    for(const id in labelEl) labelEl[id].remove();
    meshes=[]; coreById={}; labelEl={}; nodeEdges={}; selected=null;
  }

  function build(){
    const M=window.MCH; if(!M||!M.nodes) return;
    disposeScene();
    if(M.theme&&M.theme.bg){ scene.background=new THREE.Color(M.theme.bg); canvas.style.background=M.theme.bg; }   /* keep each genre's colour in 3D */
    const nodes=M.nodes;
    edges=M.edges.filter(e=>e.s&&e.t);
    nodes.forEach(n=> nodeEdges[n.id]=[]);
    edges.forEach((e,i)=>{ nodeEdges[e.s.id].push(i); nodeEdges[e.t.id].push(i); });
    labelOrder = nodes.slice().sort((a,b)=> (b.deg||0)-(a.deg||0));
    /* edges */
    edgePos=new Float32Array(edges.length*6); edgeCol=new Float32Array(edges.length*6);
    for(let i=0;i<edges.length;i++) for(let k=0;k<2;k++){ edgeCol[i*6+k*3]=EDGE_FAINT[0]; edgeCol[i*6+k*3+1]=EDGE_FAINT[1]; edgeCol[i*6+k*3+2]=EDGE_FAINT[2]; }
    const ggeo=new THREE.BufferGeometry();
    edgePosAttr=new THREE.BufferAttribute(edgePos,3); edgePosAttr.setUsage(THREE.DynamicDrawUsage); ggeo.setAttribute('position', edgePosAttr);
    edgeColAttr=new THREE.BufferAttribute(edgeCol,3); ggeo.setAttribute('color', edgeColAttr);
    lineSeg=new THREE.LineSegments(ggeo, new THREE.LineBasicMaterial({ vertexColors:true, transparent:true, opacity:0.9, blending:THREE.AdditiveBlending }));
    scene.add(lineSeg);
    /* nodes + labels */
    nodes.forEach(n=>{
      const col=new THREE.Color((M.ERAS[n.era]&&M.ERAS[n.era].color)||'#e0b15a'), r=1.4+Math.sqrt(n.deg||0)*0.7;
      const mat=new THREE.MeshPhysicalMaterial({ color:col, roughness:0.62, metalness:0,
        emissive:col.clone(), emissiveIntensity:BASE_EMIS,
        sheen:1.0, sheenColor:new THREE.Color(0xfff0e0), sheenRoughness:0.85 });
      wrapSSS(mat, col, 0.5);
      const core=new THREE.Mesh(new THREE.SphereGeometry(r,32,24), mat);
      core.userData={ node:n }; scene.add(core); meshes.push(core); coreById[n.id]=core;
      const el=document.createElement('div'); el.className='hlbl';
      const nm=document.createElement('div'); nm.className='nm'; nm.textContent=n.name;
      const ins=document.createElement('div'); ins.className='ins'; ins.textContent=(n.role||'').split('·')[0].trim();
      el.appendChild(nm); el.appendChild(ins); el._cls=''; labelsBox.appendChild(el); labelEl[n.id]=el;
    });
    setFocus(null);
    /* frame the camera to the cloud */
    let R=1; for(const n of nodes) R=Math.max(R, Math.hypot(n.x,n.y,n.z));
    const d=Math.max(200, Math.min(900, R*2.4)); camera.position.set(0, d*0.12, d);
    controls.target.set(0,0,0); controls.minDistance=R*0.4; controls.maxDistance=R*5; controls.update();
  }

  function setEdge(i,c){ const o=i*6; for(let k=0;k<2;k++){ edgeCol[o+k*3]=c[0]; edgeCol[o+k*3+1]=c[1]; edgeCol[o+k*3+2]=c[2]; } }
  function setFocus(core){
    if(!edgeColAttr) return;
    for(let i=0;i<edges.length;i++) setEdge(i, EDGE_FAINT);
    meshes.forEach(m=>{ m.scale.setScalar(1); if(m.material) m.material.emissiveIntensity=BASE_EMIS; });
    selected = core;
    if(core){ const M=window.MCH, id=core.userData.node.id;
      (nodeEdges[id]||[]).forEach(i=> setEdge(i, EDGE_BRIGHT));
      core.scale.setScalar(2.1); if(core.material) core.material.emissiveIntensity=FOCUS_EMIS;
      [...(M.adj[id]||[])].forEach(nid=>{ const m=coreById[nid]; if(m){ m.scale.setScalar(1.6); if(m.material) m.material.emissiveIntensity=NEIGH_EMIS; } });
    }
    edgeColAttr.needsUpdate=true;
  }
  function setCls(el,c){ if(el._cls!==c){ el.className='hlbl'+(c?' '+c:''); el._cls=c; } }

  const _v=()=>new THREE.Vector3();
  let projV;
  function pickRay(cx,cy){ const r=new THREE.Raycaster(), p=new THREE.Vector2((cx/innerWidth)*2-1, -(cy/innerHeight)*2+1);
    r.setFromCamera(p, camera); const hit=r.intersectObjects(meshes,false)[0]; return hit?hit.object:null; }
  function pickNearest(cx,cy){ if(!projV) projV=_v(); let best=null, bd=42;
    for(const m of meshes){ projV.copy(m.position).project(camera); if(projV.z>1) continue;
      const sx=(projV.x*0.5+0.5)*innerWidth, sy=(-projV.y*0.5+0.5)*innerHeight, d=Math.hypot(sx-cx, sy-cy);
      if(d<bd){ bd=d; best=m; } } return best; }

  let lastRay=0, downX=0, downY=0, downT=0;
  function wirePointer(){
    canvas.addEventListener('pointermove', ev=>{
      if(dragging || ev.pointerType==='touch') return;
      const now=performance.now(); if(now-lastRay<55) return; lastRay=now;
      const m=pickRay(ev.clientX, ev.clientY); if(m && m!==selected) setFocus(m);
    });
    canvas.addEventListener('pointerdown', ev=>{ if(window.MCH&&window.MCH.unlock)window.MCH.unlock(); /* bless audio so previews can play in 3D */ downX=ev.clientX; downY=ev.clientY; downT=performance.now(); });
    canvas.addEventListener('pointerup', ev=>{
      if(Math.hypot(ev.clientX-downX, ev.clientY-downY)>9 || performance.now()-downT>320) return;  /* a drag, not a tap */
      const m=pickNearest(ev.clientX, ev.clientY);
      /* always select on a genuine tap — on desktop, hover has usually already
         set `selected` to this node, so an `m!==selected` guard here would skip
         the card/clip (the tap would only ever re-light already-lit ties). */
      if(m){ setFocus(m); if(window.MCH&&window.MCH.select) window.MCH.select(m.userData.node); }   /* opens the card + plays a clip */
      else { setFocus(null); }
    });
  }

  function layoutLabels(){
    if(!projV) projV=_v();
    const M=window.MCH, grid={};
    let order=labelOrder, fid=null, fs=null;
    if(selected){ fid=selected.userData.node.id; fs=M.adj[fid];
      const fset=new Set([fid, ...fs]);
      order=[M.byId[fid], ...[...fs].map(i=>M.byId[i]), ...labelOrder.filter(n=>!fset.has(n.id))]; }
    for(const n of order){ const el=labelEl[n.id], core=coreById[n.id]; if(!el||!core) continue;
      projV.copy(core.position).project(camera);
      if(projV.z>1 || Math.abs(projV.x)>1.05 || Math.abs(projV.y)>1.08){ if(el.style.opacity!=='0') el.style.opacity=0; continue; }
      const sx=(projV.x*0.5+0.5)*innerWidth, sy=(-projV.y*0.5+0.5)*innerHeight;
      const isSel=n.id===fid, isNbr=fs&&fs.has(n.id), isFocus=isSel||isNbr;
      const key=((sx/CW)|0)+','+((sy/CH)|0);
      if(!isFocus && grid[key]){ if(el.style.opacity!=='0') el.style.opacity=0; continue; }
      grid[key]=1;
      el.style.transform='translate('+sx+'px,'+sy+'px) translate(-50%,-150%)';
      el.style.opacity = isFocus?'1':(selected?'0.2':'0.62');
      setCls(el, isSel?'sel':isNbr?'nbr':'');
    }
  }

  let lframe=0;
  function frame(){
    if(!ready) return;
    for(const core of meshes){ const n=core.userData.node; core.position.set(n.x,n.y,n.z); }
    for(let i=0;i<edges.length;i++){ const e=edges[i], o=i*6;
      edgePos[o]=e.s.x; edgePos[o+1]=e.s.y; edgePos[o+2]=e.s.z; edgePos[o+3]=e.t.x; edgePos[o+4]=e.t.y; edgePos[o+5]=e.t.z; }
    if(edgePosAttr) edgePosAttr.needsUpdate=true;
    controls.update();
    renderer.render(scene, camera);
    if((lframe++ & 1)===0) layoutLabels();
  }

  window.HOLO = {
    ready: ()=>ready,
    async enter(focusNode){
      canvas.style.display='block'; labelsBox.style.display='block';
      if(!THREE){ try{ await load(); }catch(e){ console.error('holo: three.js failed to load', e); return false; } }
      build();
      camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
      /* carry a selection in from another view: light its ties + neighbours in 3D */
      if(focusNode&&coreById[focusNode.id]) setFocus(coreById[focusNode.id]);
      return true;
    },
    exit(){ canvas.style.display='none'; labelsBox.style.display='none'; },
    rebuild(){ if(ready) build(); },
    frame
  };
})();
