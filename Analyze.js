// ===============================
// Analyze.js  (ROM Analyzer Core)
// ===============================

let DEBUG_LOG = [];
let hud = null;

// ---------- logging ----------
function log(msg){
  const t = new Date().toLocaleTimeString();
  const line = `[${t}] ${msg}`;
  DEBUG_LOG.push(line);
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

function innerAngle3D(a,b,c){
  const ab = {
    x: a.x - b.x,
    y: a.y - b.y,
    z: (a.z || 0) - (b.z || 0)
  };
  const cb = {
    x: c.x - b.x,
    y: c.y - b.y,
    z: (c.z || 0) - (b.z || 0)
  };
  const dot = ab.x*cb.x + ab.y*cb.y + ab.z*cb.z;
  const mag = Math.hypot(ab.x,ab.y,ab.z) * Math.hypot(cb.x,cb.y,cb.z);
  if (!isFinite(dot/mag)) return null;
  return Math.acos(dot/mag) * 180 / Math.PI;
}

// ---------- main ----------
async function analyze(){

  hud = document.getElementById("hud") || null;
  DEBUG_LOG = [];

  log("analyze() start");

  const out = document.getElementById("result");
  const fileInput = document.getElementById("videoInput");
  const file = fileInput?.files?.[0];

  if (!file){
    log("no video file");
    if (out) out.innerText = "動画を選択してください";
    return;
  }

  if (out) out.innerText = "解析中…";

  // ----- load video -----
  const video = document.createElement("video");
  video.src = URL.createObjectURL(file);
  video.muted = true;
  video.playsInline = true;

  await video.play();
  log(`video loaded (${video.duration.toFixed(2)}s)`);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const FPS = 2;
  let totalFrames = 0;
  let detectedFrames = 0;

  // ====== ここは 1229ROM の流儀を保持 ======
  // 小指基準（pinky）
  let MCP = [], PIP = [], DIP = [];

  const hands = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1
  });

  hands.onResults(res=>{
    totalFrames++;

    if (!res.multiHandLandmarks){
      log("no hand detected");
      return;
    }

    detectedFrames++;

    const lm = res.multiHandLandmarks[0];

    // pinky landmarks
    const PALM = lm[0];
    const MCPp = lm[17];
    const PIPp = lm[18];
    const DIPp = lm[19];
    const TIP  = lm[20];

    const a1 = innerAngle3D(PALM, MCPp, PIPp);
    const a2 = innerAngle3D(MCPp, PIPp, DIPp);
    const a3 = innerAngle3D(PIPp, DIPp, TIP);

    if (a1!=null) MCP.push(a1);
    if (a2!=null) PIP.push(a2);
    if (a3!=null) DIP.push(a3);
  });

  // ----- frame loop -----
  for (let t=0; t < video.duration; t += 1/FPS){
    log(`seek ${t.toFixed(2)}s`);
    await seekVideo(video, t);

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    try{
      await hands.send({ image: canvas });
    }catch(e){
      log("hands.send failed, skip frame");
    }
  }

  log(`frames done total=${totalFrames} detected=${detectedFrames}`);

  if (detectedFrames === 0){
    if (out) out.innerHTML = "⚠️ 手が検出されませんでした";
    log("no valid frames");
    return;
  }

  // ----- ROM calc -----
  const flex = arr => 180 - Math.min(...arr);
  const ext  = arr => Math.max(...arr) - 180;

  const result = {
    MCP_flex: flex(MCP),
    MCP_ext:  ext(MCP),
    PIP_flex: flex(PIP),
    PIP_ext:  ext(PIP),
    DIP_flex: flex(DIP),
    DIP_ext:  ext(DIP)
  };

  if (out){
    out.innerHTML = `
      <b>測定完了</b><br><br>
      MCP：屈曲 ${result.MCP_flex.toFixed(1)}° /
           伸展 ${result.MCP_ext.toFixed(1)}°<br>
      PIP：屈曲 ${result.PIP_flex.toFixed(1)}° /
           伸展 ${result.PIP_ext.toFixed(1)}°<br>
      DIP：屈曲 ${result.DIP_flex.toFixed(1)}° /
           伸展 ${result.DIP_ext.toFixed(1)}°
    `;
  }

  log("analysis finished");
}
