
const sbVideoEl = document.getElementById('videoEl');

// configuração do timer de presença
const PRESENCE_SEC  = 5;     // segundos necessários para avançar
const ABSENCE_GRACE = 1500;  // ms de tolerância antes de resetar

let presenceTimer    = null;
let presenceStart    = null;
let absenceGrace     = null;
let progressInterval = null;
let sbLastInCenter   = false;


function sbResetPresence() {
    clearTimeout(presenceTimer);     presenceTimer    = null;
    clearInterval(progressInterval); progressInterval = null;
    clearTimeout(absenceGrace);      absenceGrace     = null;
    presenceStart = null;
    sbUpdatePresenceProgress(0);
}

function sbResumePresenceIfCentered() {
    if (sbLastInCenter) sbSignalPresent();
}

// pessoa detetada no centro — inicia ou mantém a contagem
function sbSignalPresent() {
    sbLastInCenter = true;
    clearTimeout(absenceGrace);
    absenceGrace = null;

    if (presenceTimer) return; // já está a contar, não reiniciar

    presenceStart = performance.now();
    sbUpdatePresenceProgress(0);

    // dispara a saída do standby ao fim de PRESENCE_SEC segundos
    presenceTimer = setTimeout(() => {
        presenceTimer = null;
        clearInterval(progressInterval);
        progressInterval = null;
        if (sbActive) sbExit();
    }, PRESENCE_SEC * 1000);

    // atualiza o anel de progresso a cada 50ms
    progressInterval = setInterval(() => {
        const elapsed = (performance.now() - presenceStart) / (PRESENCE_SEC * 1000);
        sbUpdatePresenceProgress(Math.min(elapsed, 1));
    }, 50);

}

// pessoa saiu do centro — aguarda a grace period antes de resetar
function sbSignalAbsent() {
    sbLastInCenter = false;
    if (absenceGrace) return; // já está em espera
    absenceGrace = setTimeout(() => {
        absenceGrace = null;
        clearTimeout(presenceTimer);     presenceTimer    = null;
        clearInterval(progressInterval); progressInterval = null;
        presenceStart = null;
        sbUpdatePresenceProgress(0);
    }, ABSENCE_GRACE);
}

// atualiza o anel SVG de progresso do botão central
function sbUpdatePresenceProgress(fraction) {
    const offset = CIRC_BEGIN * (1 - fraction);
    if (standbyProg) standbyProg.style.strokeDashoffset = offset;
    if (standbyBtn)  standbyBtn.classList.toggle('hovering', fraction > 0);
}

// inicializa a câmara e os modelos MediaPipe
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

    // selfie segmentation — gera a silhueta espelhada para o sbUpdateMask
    const selfie = new SelfieSegmentation({
        locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
    });
    selfie.setOptions({ modelSelection: 1 });
    selfie.onResults(r => {
        if (!sbActive) return;
        // espelhar horizontalmente para coincidir com o que a pessoa vê
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

    // pose — deteta se a pessoa está no centro horizontal e vertical
    const pose = new Pose({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
    pose.setOptions({
        modelComplexity: 0,
        smoothLandmarks: true,
        minDetectionConfidence: .4,
        minTrackingConfidence: .4
    });
    pose.onResults(r => {
        if (!sbActive) return;
        if (!r.poseLandmarks) {
            if (typeof sbSetProximityPosition === 'function') sbSetProximityPosition(0.5, 0.5, false);
            sbSignalAbsent();
            return;
        }

        const lms = r.poseLandmarks;
        // usar ombros e ancas para calcular a posição do centro do corpo
        const pts = [lms[11], lms[12], lms[23], lms[24]].filter(Boolean);
        if (!pts.length) {
            if (typeof sbSetProximityPosition === 'function') sbSetProximityPosition(0.5, 0.5, false);
            sbSignalAbsent();
            return;
        }

        const avgX = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const avgY = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        if (typeof sbSetProximityPosition === 'function') sbSetProximityPosition(1 - avgX, avgY, true);

        const inCenterH = avgX >= 0.28 && avgX <= 0.72;
        const inCenterV = avgY >= 0.08 && avgY <= 0.90;

        if (inCenterH && inCenterV) sbSignalPresent();
        else                         sbSignalAbsent();
    });

    // loop da câmara
    const cam = new Camera(sbVideoEl, {
        onFrame: async () => {
            if (!sbActive) {
                // quando o standby sai, passa o frame para o forms.js processar
                if (typeof formsOnFrame === 'function') await formsOnFrame(sbVideoEl);
                return;
            }
            await pose.send({ image: sbVideoEl });
            await selfie.send({ image: sbVideoEl });
        },
        width: 640, height: 360
    });
    cam.start();
}

sbInitCam();
