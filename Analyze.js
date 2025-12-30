let DEBUG_LOG = [];
let hud;

function log(msg){
  const t = new Date().toLocaleTimeString();
  const line = `[${t}] ${msg}`;
  DEBUG_LOG.push(line);
  if (hud) hud.innerText = line;
}

function copyDebugLog(){
  navigator.clipboard.writeText(DEBUG_LOG.join("\n"));
  alert("デバッグログをコピーしました");
}

function seekVideo(video, time){
  return new Promise(resolve=>{
    const handler = ()=>{
      video.removeEventListener("seeked", handler);
      resolve();
    };
    video.addEventListener("seeked", handler);
    video.currentTime = time;
  });
}

// ===== 3D内角 =====
function innerAngle3D(a,b,c){
  const ab = {x:a.x-b.x, y:a.y-b.y, z:(a.z||0)-(b.z||0)};
  const cb = {x:c.x-b.x, y:c.y-b.y, z:(c.z||0)-(b.z||0)};
  const dot = ab.x*cb.x + ab.y*cb.y + ab.z*cb.z;
  const mag = Math.hypot(ab.x,ab.y,ab.z) * Math.hypot(cb.x,cb.y,cb.z);
  if(!isFinite(dot/mag)) return null;
  return Math.acos(dot/mag) * 180 / Math.PI;
}

async function analyze(){

  hud = document.getElementById("hud");
  log("analyze() start");

  const out = document.getElementById("result");
  const file = document.getElementById("videoInput").files[0];
  if(!file){
    out.innerText = "動画を選択してください";
    log("no file");
    return;
  }

  out.innerText = "解析中…";

  // ===== 動画 =====
  const video = document.createElement("video");
  video.src = URL.createObjectURL(file);
  await video.play();
  log(`video loaded (${video.duration.toFixed(2)}s)`);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const FPS = 2;
  let totalFrames = 0;
  let detectedFrames = 0;

  // 親指（thumb）
  let CMC = [], MCP = [], IP = [];

  // ===== MediaPipe =====
  const hands = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1
  });

  hands.onResults(res=>{
    totalFrames++;
    if(!res.multiHandLandmarks) return;

    detectedFrames++;
    const lm = res.multiHandLandmarks[0];

    const PALM = lm[0];
    const CMCp = lm[1];
    const MCPp = lm[2];
    const IPp  = lm[3];
    const TIP  = lm[4];

    const aCMC = innerAngle3D(PALM, CMCp, MCPp);
    const aMCP = innerAngle3D(CMCp, MCPp, IPp);
    const aIP  = innerAngle3D(MCPp, IPp, TIP);

    if(aCMC!=null) CMC.push(aCMC);
    if(aMCP!=null) MCP.push(aMCP);
    if(aIP!=null)  IP.push(aIP);
  });

  // ===== フレーム処理 =====
  for(let t=0; t<video.duration; t+=1/FPS){
    log(`seek ${t.toFixed(2)}s`);
    await seekVideo(video, t);

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video,0,0);

    try{
      await hands.send({image:canvas});
    }catch(e){
      log("hands.send failed, skip frame");
    }
  }

  log(`frames done total=${totalFrames} detected=${detectedFrames}`);

  // ===== 品質チェック =====
  if(detectedFrames/totalFrames < 0.6){
    out.innerHTML = "⚠️ 親指CM関節が十分に写っていません。<br>手関節寄りまで写るよう再撮影してください。";
    log("visibility low");
    return;
  }

  // ===== 可動域算出 =====
  const flex = arr => 180 - Math.min(...arr);
  const ext  = arr => Math.max(...arr) - 180;

  out.innerHTML = `
    <b>親指 可動域（14）</b><br><br>

    CM（参考）：屈曲 ${flex(CMC).toFixed(1)}° /
    伸展 ${ext(CMC).toFixed(1)}°<br>

    MCP：屈曲 ${flex(MCP).toFixed(1)}° /
    伸展 ${ext(MCP).toFixed(1)}°<br>

    IP：屈曲 ${flex(IP).toFixed(1)}° /
    伸展 ${ext(IP).toFixed(1)}°<br>
  `;

  log("analysis finished");
}
