// ===============================
// analyze.js – 1231TROM Core
// ===============================

let DEBUG_LOG = [];
let hud = null;

// ---------- debug ----------
function log(msg){
  const t = new Date().toLocaleTimeString();
  const line = `[${t}] ${msg}`;
  DEBUG_LOG.push(line);
  if (!hud) hud = document.getElementById("hud");
  if (hud) hud.innerText = msg;
  console.log(line);
}

function copyDebugLog(){
  if (DEBUG_LOG.length === 0){
    alert("ログがありません");
    return;
  }
  navigator.clipboard.writeText(DEBUG_LOG.join("\n"))
    .then(()=>alert("デバッグログをコピーしました"))
    .catch(()=>alert("コピーに失敗しました"));
}

// ---------- util ----------
function innerAngle(a,b,c){
  const ab={x:a.x-b.x,y:a.y-b.y,z:(a.z||0)-(b.z||0)};
  const cb={x:c.x-b.x,y:c.y-b.y,z:(c.z||0)-(b.z||0)};
  const dot=ab.x*cb.x+ab.y*cb.y+ab.z*cb.z;
  const mag=Math.hypot(ab.x,ab.y,ab.z)*Math.hypot(cb.x,cb.y,cb.z);
  if(!isFinite(dot/mag)) return null;
  return Math.acos(dot/mag)*180/Math.PI;
}

function seek(video,time){
  return new Promise(r=>{
    const h=()=>{video.removeEventListener("seeked",h);r();};
    video.addEventListener("seeked",h);
    video.currentTime=time;
  });
}

async function processVideo(file, onResult){
  DEBUG_LOG = [];
  log("processVideo start");

  const video=document.createElement("video");
  video.src=URL.createObjectURL(file);
  video.muted=true;
  video.playsInline=true;
  await video.play();

  log(`video loaded (${video.duration.toFixed(2)}s)`);

  const canvas=document.createElement("canvas");
  const ctx=canvas.getContext("2d");

  const hands=new Hands({
    locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
  });
  hands.setOptions({maxNumHands:1,modelComplexity:1});
  hands.onResults(onResult);

  for(let t=0;t<video.duration;t+=0.5){
    log(`seek ${t.toFixed(2)}s`);
    await seek(video,t);
    canvas.width=video.videoWidth;
    canvas.height=video.videoHeight;
    ctx.drawImage(video,0,0);
    try{
      await hands.send({image:canvas});
    }catch{
      log("hands.send failed");
    }
  }

  log("processVideo finished");
}

// ===============================
// ① MP / IP
// ===============================
async function analyzeMPIP(){
  const file=document.getElementById("video1").files[0];
  if(!file) return;

  log("① MP/IP analyze start");

  let MP=[],IP=[];
  await processVideo(file,res=>{
    if(!res.multiHandLandmarks) return;
    const lm=res.multiHandLandmarks[0];
    const palm=lm[0];
    const MPa=innerAngle(palm,lm[2],lm[3]);
    const IPa=innerAngle(lm[2],lm[3],lm[4]);
    if(MPa!=null) MP.push(MPa);
    if(IPa!=null) IP.push(IPa);
  });

  const flex=x=>180-Math.min(...x);
  const ext=x=>180-Math.max(...x);

  document.getElementById("result").innerHTML=`
    <b>① MP / IP</b><br>
    MP：屈曲 ${flex(MP).toFixed(1)}° / 伸展 ${ext(MP).toFixed(1)}°<br>
    IP：屈曲 ${flex(IP).toFixed(1)}° / 伸展 ${ext(IP).toFixed(1)}°
  `;

  log("① MP/IP analyze finished");
}

// ===============================
// ④ Opposition
// ===============================
async function analyzeOpposition(){
  const file=document.getElementById("video4").files[0];
  if(!file) return;

  log("④ Opposition analyze start");

  let dist=[];
  await processVideo(file,res=>{
    if(!res.multiHandLandmarks) return;
    const lm=res.multiHandLandmarks[0];
    const thumb=lm[4];
    const target=lm[12]; // 中指
    const palm=lm[0];
    const d=Math.hypot(
      thumb.x-target.x,
      thumb.y-target.y,
      (thumb.z||0)-(target.z||0)
    );
    const norm=Math.hypot(
      lm[2].x-palm.x,
      lm[2].y-palm.y,
      (lm[2].z||0)-(palm.z||0)
    );
    if(isFinite(d/norm)) dist.push(d/norm);
  });

  document.getElementById("result").innerHTML+=`
    <br><br><b>④ 対立</b><br>
    母指―中指 指尖距離（正規化・無次元）：${Math.min(...dist).toFixed(2)}
  `;

  log("④ Opposition analyze finished");
}
