/* ═══════════════════════════════════════════════════════════
   standby.js — Fluid Blob Pixel Effect
   Quadrados amarelos animados com silhueta da pessoa
   sbUpdateMask() recebe a máscara da selfie segmentation
═══════════════════════════════════════════════════════════ */

// ── Resolução da grelha de píxeis ────────────────────────
const SB_COLS = 324;   // 9720 / 30
const SB_ROWS = 64;    // 1920 / 30

// ── DOM ──────────────────────────────────────────────────
const standbyOverlay = document.getElementById('standbyOverlay');
const standbyCanvas  = document.getElementById('standbyCanvas');
const sbCtx          = standbyCanvas.getContext('2d');
const standbyBtn     = document.getElementById('standbyBtn');
const standbyProg    = document.getElementById('standbyProg');

const segCanvas = document.getElementById('standbySegCanvas');
const segCtx    = segCanvas.getContext('2d', { willReadFrequently: true });

// ── Estado ───────────────────────────────────────────────
let sbActive      = true;
let sbTime        = 0;
let sbMaskData    = null;
let sbMaskW       = 0;
let sbMaskH       = 0;

// Canvas interno para suavizar a máscara (blur + fade)
const maskBlurCanvas = document.createElement('canvas');
const mbCtx          = maskBlurCanvas.getContext('2d', { willReadFrequently: true });
maskBlurCanvas.width  = SB_COLS;
maskBlurCanvas.height = SB_ROWS;

// ── Noise functions ──────────────────────────────────────
function sbNoise(x, y, t) {
    return Math.sin(x * 0.04 + t) +
        Math.cos(y * 0.04 - t * 0.7) +
        Math.sin((x + y) * 0.02 + t * 0.5);
}

function sbShape(x, y) {
    const cx = SB_COLS / 2;
    const cy = SB_ROWS / 2;
    const dx = (x - cx) / SB_COLS;
    const dy = (y - cy) / SB_ROWS;
    return Math.sin(dx * 5.5) + Math.cos(dy * 5.5);
}

// ── API pública: recebe máscara da selfie segmentation ───
function sbUpdateMask(maskSource) {
    if (!maskSource) { sbMaskData = null; return; }

    mbCtx.save();

    // Fade do frame anterior
    mbCtx.globalCompositeOperation = 'source-over';
    mbCtx.fillStyle = 'black';
    mbCtx.globalAlpha = 0.4;
    mbCtx.fillRect(0, 0, SB_COLS, SB_ROWS);

    // Nova máscara com blur suave
    mbCtx.globalCompositeOperation = 'lighter';
    mbCtx.globalAlpha = 1.0;
    mbCtx.filter = 'blur(6px)';
    mbCtx.drawImage(maskSource, 0, 0, SB_COLS, SB_ROWS);

    mbCtx.restore();

    sbMaskData = mbCtx.getImageData(0, 0, SB_COLS, SB_ROWS).data;
    sbMaskW    = SB_COLS;
    sbMaskH    = SB_ROWS;
}

// ── Força da silhueta numa célula ────────────────────────
function sbSilhouette(col, row) {
    if (!sbMaskData) return 0;
    const mx = Math.floor(col / SB_COLS * sbMaskW);
    const my = Math.floor(row / SB_ROWS * sbMaskH);
    const mi = (my * sbMaskW + mx) * 4;
    return sbMaskData[mi] / 255.0;
}

// ── Render ───────────────────────────────────────────────
function sbRender() {
    sbTime += 0.0035;

    standbyCanvas.width  = CANVAS_W;
    standbyCanvas.height = CANVAS_H;

    sbCtx.fillStyle = '#2f5bff';
    sbCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const cellW = CANVAS_W / SB_COLS;
    const cellH = CANVAS_H / SB_ROWS;
    const t     = sbTime;

    for (let y = 0; y < SB_ROWS; y++) {
        for (let x = 0; x < SB_COLS; x++) {
            const sil = sbSilhouette(x, y);
            const n   = sbNoise(x, y, t);
            const s   = sbShape(x, y);

            let v = (n * 0.5 + s * 0.7) + (sil * 2.8) + Math.sin(t + x * 0.01) * 0.3;
            v = Math.tanh(v);

            if (v < -0.15) continue;

            const breathe = 0.7 + Math.sin(t * 2 + x * 0.02 + y * 0.02) * 0.3;
            const size    = (0.5 + Math.abs(v)) * breathe;
            const offsetX = Math.sin(t + y * 0.02) * 0.5;
            const offsetY = Math.cos(t + x * 0.02) * 0.5;

            sbCtx.fillStyle = 'yellow';
            sbCtx.fillRect(
                x * cellW + offsetX,
                y * cellH + offsetY,
                cellW * size,
                cellH * size
            );
        }
    }
}

// ── Loop ─────────────────────────────────────────────────
function sbAnimLoop() {
    if (!sbActive) return;
    sbRender();
    requestAnimationFrame(sbAnimLoop);
}

function sbInitGrid() { /* procedural — nada a inicializar */ }

// ── Saída ─────────────────────────────────────────────────
function sbExit() {
    if (!sbActive) return;
    sbActive = false;
    standbyOverlay.classList.add('leaving');
    standbyOverlay.addEventListener('transitionend', () => {
        standbyOverlay.style.display = 'none';
        if (typeof onStandbyExit === 'function') onStandbyExit();
    }, { once: true });
}

// ── Re-entrada ────────────────────────────────────────────
function sbEnter() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    curScreen = 0;
    document.getElementById('stage')?.classList.remove('quiz-theme');
    if (typeof window.statsStop === 'function') window.statsStop();

    // Parar qualquer loop anterior antes de reiniciar
    sbActive = false;

    // Pequeno delay para garantir que o frame anterior do RAF terminou
    setTimeout(() => {
        sbMaskData = null;
        sbTime     = 0;
        mbCtx.clearRect(0, 0, SB_COLS, SB_ROWS);

        standbyOverlay.style.display = 'block';
        standbyOverlay.classList.remove('leaving');
        standbyOverlay.style.opacity = '1';

        // Resetar todos os timers de presença
        if (typeof sbResetPresence === 'function') sbResetPresence();
        sbUpdatePresenceProgress(0);

        // Reiniciar loop
        sbActive = true;
        sbAnimLoop();
    }, 50);
}

// ── Progresso visual no anel ──────────────────────────────
function sbUpdatePresenceProgress(fraction) {
    const offset = CIRC_BEGIN * (1 - fraction);
    if (standbyProg) standbyProg.style.strokeDashoffset = offset;
    if (standbyBtn)  standbyBtn.classList.toggle('hovering', fraction > 0.01);
}

// ── Init ──────────────────────────────────────────────────
sbInitGrid();
sbAnimLoop();
