/* ═══════════════════════════════════════════════════════════
   stats.js — Blob circular nos painéis laterais
═══════════════════════════════════════════════════════════ */

const ST_STAT_MS  = 10000;
const ST_ENTER_MS = 1000;
const ST_EXIT_MS  = 800;

function makeStatCanvas(left, w) {
    const c = document.createElement('canvas');
    c.width  = w;
    c.height = 1920;
    c.style.cssText = `
        position:absolute; top:0; left:${left}px;
        width:${w}px; height:1920px;
        pointer-events:none; z-index:8999; display:block;
    `;
    document.getElementById('stage').appendChild(c);
    return c;
}

let leftCanvas, rightCanvas, lCtx, rCtx;

document.addEventListener('DOMContentLoaded', () => {
    leftCanvas  = makeStatCanvas(0, 3240);
    rightCanvas = makeStatCanvas(6480, 3240);
    lCtx = leftCanvas.getContext('2d');
    rCtx = rightCanvas.getContext('2d');
});

let stTime       = 0;
let stStatIdx    = 0;
let stTimer      = null;
let stAnimId     = null;
let stRunning    = false;
let stSide       = 'left';
let stPhase      = 'hidden';
let stPhaseStart = 0;

function stNoise(x, y, t) {
    return Math.sin(x * 0.04 + t) +
        Math.cos(y * 0.04 - t * 0.7) +
        Math.sin((x + y) * 0.02 + t * 0.5);
}

// Forma circular — raio relativo ao menor lado
function stShape(x, y, cols, rows) {
    const dx = (x - cols / 2) / (cols * 0.38);
    const dy = (y - rows / 2) / (rows * 0.38);
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Dentro do círculo → positivo; fora → negativo
    return 1.2 - dist;
}

function easeInOut(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }

function drawStatOnCanvas(canvas, ctx) {
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    if (stPhase === 'hidden') return;

    const now = performance.now();
    let progress = 1;
    if (stPhase === 'entering') {
        progress = Math.min(1, (now - stPhaseStart) / ST_ENTER_MS);
        if (progress >= 1) { stPhase = 'shown'; progress = 1; }
    } else if (stPhase === 'exiting') {
        progress = 1 - Math.min(1, (now - stPhaseStart) / ST_EXIT_MS);
        if (progress <= 0) {
            stPhase = 'hidden';
            ctx.clearRect(0, 0, W, H);
            stStatIdx = (stStatIdx + 1) % STAT_FACTS.length;
            stSide    = stSide === 'left' ? 'right' : 'left';
            setTimeout(stEnter, 300);
            return;
        }
    }

    const ease = easeInOut(progress);

    // Centro e raio do blob (menor que o canvas para nao cortar)
    const cx = W / 2;
    const cy = H / 2;
    const R  = Math.min(W, H) * 0.40;
    const t  = stTime;

    // ── Canvas temporario do tamanho exato do blob ───────────────────────
    const BW = Math.ceil(R * 2);
    const BH = Math.ceil(R * 2);
    const tmp   = document.createElement('canvas');
    tmp.width   = BW;
    tmp.height  = BH;
    const octx  = tmp.getContext('2d');

    // Clip circular — garante bordas arredondadas sem cortes
    octx.save();
    octx.beginPath();
    octx.arc(BW / 2, BH / 2, R, 0, Math.PI * 2);
    octx.clip();

    // Fundo azul
    octx.fillStyle = '#2f5bff';
    octx.fillRect(0, 0, BW, BH);

    // Grid de quadrados amarelos com noise organico
    const COLS = 160, ROWS = 160;
    const cellW = BW / COLS;
    const cellH = BH / ROWS;

    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            const n = stNoise(col, row, t);
            const s = stShape(col, row, COLS, ROWS);

            let v = s * 1.4 + n * 0.25;
            v = Math.tanh(v * 2);

            if (v < 0.05) continue;

            const breathe = 0.7 + Math.sin(t*2 + col*0.02 + row*0.02) * 0.3;
            const size    = (0.5 + Math.abs(v) * 0.5) * breathe;
            const ox = Math.sin(t + row * 0.02) * 0.5;
            const oy = Math.cos(t + col * 0.02) * 0.5;

            octx.fillStyle = 'yellow';
            octx.fillRect(col*cellW + ox, row*cellH + oy, cellW*size, cellH*size);
        }
    }

    octx.restore(); // tira o clip circular

    // ── Copiar blob centrado no canvas principal ──────────────────────────
    ctx.save();
    ctx.globalAlpha = ease;
    ctx.drawImage(tmp, cx - BW / 2, cy - BH / 2);

    // ── Texto por cima, sempre legivel ────────────────────────────────────
    const fact  = STAT_FACTS[stStatIdx % STAT_FACTS.length];
    const pct   = fact.pct + '%';
    const lines = fact.label.replace(/\\n/g, '\n').split('\n');

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';

    ctx.font = `900 320px 'Poppins', sans-serif`;
    const numM = ctx.measureText(pct);
    const numH = numM.actualBoundingBoxAscent + numM.actualBoundingBoxDescent;

    const lineH  = 140;
    const lblH   = lines.length * lineH;
    const gap    = 50;
    const totalH = numH + gap + lblH;
    const startY = cy - totalH / 2 + numH;

    // Sombra suave para leitura sobre o amarelo
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur  = 20;
    ctx.fillStyle   = '#ffffff';

    ctx.fillText(pct, cx, startY);

    ctx.font = `900 110px 'Poppins', sans-serif`;
    lines.forEach((line, i) => {
        ctx.fillText(line, cx, startY + gap + lineH * (i + 1));
    });

    ctx.restore();
}

function stLoop() {
    if (!leftCanvas || !rightCanvas) { stAnimId = requestAnimationFrame(stLoop); return; }
    stTime += 0.003;
    if (stSide === 'left') {
        drawStatOnCanvas(leftCanvas, lCtx);
        rCtx.clearRect(0, 0, rightCanvas.width, rightCanvas.height);
    } else {
        drawStatOnCanvas(rightCanvas, rCtx);
        lCtx.clearRect(0, 0, leftCanvas.width, leftCanvas.height);
    }
    stAnimId = requestAnimationFrame(stLoop);
}

function stEnter() {
    if (!stRunning) return;
    stPhase      = 'entering';
    stPhaseStart = performance.now();
}

function stExit() {
    if (stPhase === 'shown' || stPhase === 'entering') {
        stPhase      = 'exiting';
        stPhaseStart = performance.now();
    }
}

function statsStart() {
    // Parar tudo antes de reiniciar (idempotente)
    clearInterval(stTimer); stTimer = null;
    if (stAnimId) { cancelAnimationFrame(stAnimId); stAnimId = null; }

    stRunning  = true;
    stStatIdx  = 0;
    stSide     = 'left';
    stPhase    = 'hidden';

    lCtx.clearRect(0, 0, leftCanvas.width, leftCanvas.height);
    rCtx.clearRect(0, 0, rightCanvas.width, rightCanvas.height);

    stLoop();
    stEnter();
    stTimer = setInterval(() => stExit(), ST_STAT_MS);
}

function statsStop() {
    stRunning = false;
    clearInterval(stTimer); stTimer = null;
    if (stAnimId) { cancelAnimationFrame(stAnimId); stAnimId = null; }
    stPhase = 'hidden';
    lCtx.clearRect(0, 0, leftCanvas.width, leftCanvas.height);
    rCtx.clearRect(0, 0, rightCanvas.width, rightCanvas.height);
}

window.statsStart = statsStart;
window.statsStop  = statsStop;