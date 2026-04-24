/* ═══════════════════════════════════════════════════════════
   standby_mp.js — MediaPipe do standby
   ─────────────────────────────────────────────────────────
   Saída do standby: pessoa parada no centro 5s.
   Silhueta mantida via selfie segmentation.
═══════════════════════════════════════════════════════════ */

const sbVideoEl = document.getElementById('videoEl');

// ── Temporizador de presença ─────────────────────────────
const PRESENCE_SEC  = 5;
const ABSENCE_GRACE = 1500;

let presenceTimer    = null;
let presenceStart    = null;
let absenceGrace     = null;
let progressInterval = null;

// ── Reset completo do estado de presença (chamado por sbEnter) ──
function sbResetPresence() {
    clearTimeout(presenceTimer);    presenceTimer    = null;
    clearInterval(progressInterval); progressInterval = null;
    clearTimeout(absenceGrace);     absenceGrace     = null;
    presenceStart = null;
    sbUpdatePresenceProgress(0);
}

function sbSignalPresent() {
    clearTimeout(absenceGrace);
    absenceGrace = null;

    if (presenceTimer) return; // já está a contar

    presenceStart = performance.now();
    sbUpdatePresenceProgress(0);

    presenceTimer = setTimeout(() => {
        presenceTimer = null;
        clearInterval(progressInterval);
        progressInterval = null;
        if (sbActive) sbExit();
    }, PRESENCE_SEC * 1000);

    progressInterval = setInterval(() => {
        const elapsed = (performance.now() - presenceStart) / (PRESENCE_SEC * 1000);
        sbUpdatePresenceProgress(Math.min(elapsed, 1));
    }, 50);

    if (typeof setPersonPresent === 'function') setPersonPresent(true);
    if (window._statsOnPresent) window._statsOnPresent();
}

function sbSignalAbsent() {
    if (absenceGrace) return;
    absenceGrace = setTimeout(() => {
        absenceGrace = null;
        clearTimeout(presenceTimer);    presenceTimer    = null;
        clearInterval(progressInterval); progressInterval = null;
        presenceStart = null;
        sbUpdatePresenceProgress(0);
        if (typeof setPersonPresent === 'function') setPersonPresent(false);
        if (window._statsOnAbsent) window._statsOnAbsent();
    }, ABSENCE_GRACE);
}

// ── Progresso visual no anel do botão ────────────────────
function sbUpdatePresenceProgress(fraction) {
    const offset = CIRC_BEGIN * (1 - fraction);
    if (standbyProg) standbyProg.style.strokeDashoffset = offset;
    if (standbyBtn)  standbyBtn.classList.toggle('hovering', fraction > 0);
}

// ── Câmara ───────────────────────────────────────────────
async function sbInitCam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 360, facingMode: 'user' }
        });
        sbVideoEl.srcObject = stream;
        await sbVideoEl.play();
        sbSetupMP();
    } catch(e) {
        console.warn('Câmara indisponível no standby:', e);
    }
}

function sbSetupMP() {

    // ── Selfie segmentation — silhueta espelhada ─────────
    const selfie = new SelfieSegmentation({
        locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
    });
    selfie.setOptions({ modelSelection: 1 });
    selfie.onResults(r => {
        if (!sbActive) return;
        // Espelhar horizontalmente antes de passar ao render
        const mask = r.segmentationMask;
        const mirrorCanvas = document.createElement('canvas');
        mirrorCanvas.width  = mask.width;
        mirrorCanvas.height = mask.height;
        const mCtx = mirrorCanvas.getContext('2d');
        mCtx.save();
        mCtx.translate(mask.width, 0);
        mCtx.scale(-1, 1);
        mCtx.drawImage(mask, 0, 0);
        mCtx.restore();
        sbUpdateMask(mirrorCanvas);
    });

    // ── Pose — centro horizontal + timer de 5s ───────────
    const pose = new Pose({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
    pose.setOptions({
        modelComplexity: 0,
        smoothLandmarks: true,
        minDetectionConfidence: .4,
        minTrackingConfidence: .4
    });
    pose.onResults(r => {
        if (!sbActive) return;
        if (!r.poseLandmarks) { sbSignalAbsent(); return; }

        const lms = r.poseLandmarks;
        // Landmarks: 11=ombro esq, 12=ombro dir, 23=anca esq, 24=anca dir
        const pts = [lms[11], lms[12], lms[23], lms[24]].filter(Boolean);
        if (!pts.length) { sbSignalAbsent(); return; }

        // MediaPipe devolve x em [0,1] com 0=esquerda da câmara (não espelhada).
        // A câmara de utilizador é espelhada visualmente, logo o "centro real"
        // corresponde a x ∈ [0.28, 0.72] em qualquer orientação.
        const avgX = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const avgY = pts.reduce((s, p) => s + p.y, 0) / pts.length;

        const inCenterH = avgX >= 0.28 && avgX <= 0.72;
        const inCenterV = avgY >= 0.08 && avgY <= 0.90;

        if (inCenterH && inCenterV) sbSignalPresent();
        else                         sbSignalAbsent();
    });

    // ── Mãos — mantidas mas sem lógica no standby ────────
    const hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
    hands.setOptions({ maxNumHands:1, modelComplexity:0, minDetectionConfidence:.4, minTrackingConfidence:.3 });
    hands.onResults(() => {});

    // ── Camera loop ──────────────────────────────────────
    let frameCount = 0;
    const cam = new Camera(sbVideoEl, {
        onFrame: async () => {
            if (!sbActive) {
                if (typeof formsOnFrame === 'function') await formsOnFrame(sbVideoEl);
                return;
            }
            frameCount++;
            await pose.send({ image: sbVideoEl });
            await selfie.send({ image: sbVideoEl });
            if (frameCount % 3 === 0) await hands.send({ image: sbVideoEl });
        },
        width: 640, height: 360
    });
    cam.start();
}

sbInitCam();