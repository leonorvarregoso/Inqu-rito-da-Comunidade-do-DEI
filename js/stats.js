// stats.js — blob circular animado que aparece nos painéis laterais

// duração de cada fase em ms
const ST_STAT_MS  = 10000; // tempo que o blob fica visível
const ST_ENTER_MS = 1000;  // fade in
const ST_EXIT_MS  = 800;   // fade out

// cria um canvas posicionado no stage (esquerda ou direita)
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

// os dois canvas laterais — criados depois do DOM estar pronto
let leftCanvas, rightCanvas, lCtx, rCtx;

document.addEventListener('DOMContentLoaded', () => {
    leftCanvas  = makeStatCanvas(7290, 2430);
    rightCanvas = makeStatCanvas(0, 2430);
    lCtx = leftCanvas.getContext('2d');
    rCtx = rightCanvas.getContext('2d');
});

// estado do sistema de stats
let stTime       = 0;
let stStatIdx    = 0;        // índice do facto atual em STAT_FACTS
let stTimer      = null;     // intervalo que dispara a saída
let stAnimId     = null;     // id do requestAnimationFrame
let stRunning    = false;
let stSide       = 'left';   // qual painel está a mostrar
let stPhase      = 'hidden'; // hidden | entering | shown | exiting
let stPhaseStart = 0;

// noise orgânico com três harmónicas para animar os quadrados
function stNoise(x, y, t) {
    return Math.sin(x * 0.04 + t) +
        Math.cos(y * 0.04 - t * 0.7) +
        Math.sin((x + y) * 0.02 + t * 0.5);
}

// forma circular — devolve positivo dentro do círculo e negativo fora
function stShape(x, y, cols, rows) {
    const dx = (x - cols / 2) / (cols * 0.38);
    const dy = (y - rows / 2) / (rows * 0.38);
    const dist = Math.sqrt(dx * dx + dy * dy);
    return 1.2 - dist;
}

// ease in-out quadrático para as transições de entrada/saída
function easeInOut(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }

// desenha o blob num canvas específico (esquerda ou direita)
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
            // saída completa — avança para o próximo facto e muda de lado
            stPhase = 'hidden';
            ctx.clearRect(0, 0, W, H);
            stStatIdx = (stStatIdx + 1) % STAT_FACTS.length;
            stSide    = stSide === 'left' ? 'right' : 'left';
            setTimeout(stEnter, 300);
            return;
        }
    }

    const ease = easeInOut(progress);

    // centro e raio do blob — 40% do lado menor garante que não sai fora do canvas
    const cx = W / 2;
    const cy = H / 2;
    const R  = Math.min(W, H) * 0.40;
    const t  = stTime;

    // canvas temporário do tamanho exato do blob
    const BW = Math.ceil(R * 2);
    const BH = Math.ceil(R * 2);
    const tmp  = document.createElement('canvas');
    tmp.width  = BW;
    tmp.height = BH;
    const octx = tmp.getContext('2d');

    // clip circular — sem isto as bordas ficam cortadas a reto
    octx.save();
    octx.beginPath();
    octx.arc(BW / 2, BH / 2, R, 0, Math.PI * 2);
    octx.clip();

    // fundo azul dentro do círculo
    octx.fillStyle = '#2f5bff';
    octx.fillRect(0, 0, BW, BH);

    // grelha de quadrados amarelos com noise orgânico
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

            // tamanho e posição com animação de "respiração"
            const breathe = 0.7 + Math.sin(t*2 + col*0.02 + row*0.02) * 0.3;
            const size    = (0.5 + Math.abs(v) * 0.5) * breathe;
            const ox = Math.sin(t + row * 0.02) * 0.5;
            const oy = Math.cos(t + col * 0.02) * 0.5;

            octx.fillStyle = 'yellow';
            octx.fillRect(col*cellW + ox, row*cellH + oy, cellW*size, cellH*size);
        }
    }

    octx.restore(); // remove o clip circular

    // copiar o blob centrado no canvas principal com fade
    ctx.save();
    ctx.globalAlpha = ease;
    ctx.drawImage(tmp, cx - BW / 2, cy - BH / 2);

    // texto por cima do blob — sempre legível graças à sombra
    const fact  = STAT_FACTS[stStatIdx % STAT_FACTS.length];
    const pct   = fact.pct + '%';
    const lines = fact.label.replace(/\\n/g, '\n').split('\n');

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';

    // número grande (percentagem)
    ctx.font = `900 320px 'Poppins', sans-serif`;
    const numM = ctx.measureText(pct);
    const numH = numM.actualBoundingBoxAscent + numM.actualBoundingBoxDescent;

    const lineH  = 140;
    const lblH   = lines.length * lineH;
    const gap    = 50;
    const totalH = numH + gap + lblH;
    const startY = cy - totalH / 2 + numH;

    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur  = 20;
    ctx.fillStyle   = '#ffffff';
    ctx.fillText(pct, cx, startY);

    // label descritivo
    ctx.font = `900 110px 'Poppins', sans-serif`;
    lines.forEach((line, i) => {
        ctx.fillText(line, cx, startY + gap + lineH * (i + 1));
    });

    ctx.restore();
}

// loop de animação — atualiza o tempo e redesenha o painel ativo
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

// inicia a fase de entrada
function stEnter() {
    if (!stRunning) return;
    stPhase      = 'entering';
    stPhaseStart = performance.now();
}

// inicia a fase de saída (chamada pelo timer de ST_STAT_MS)
function stExit() {
    if (stPhase === 'shown' || stPhase === 'entering') {
        stPhase      = 'exiting';
        stPhaseStart = performance.now();
    }
}

// arranca o sistema de stats — chamado quando o quiz começa
function statsStart() {
    // parar qualquer loop anterior antes de reiniciar
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

// para tudo e limpa os canvas
function statsStop() {
    stRunning = false;
    clearInterval(stTimer); stTimer = null;
    if (stAnimId) { cancelAnimationFrame(stAnimId); stAnimId = null; }
    stPhase = 'hidden';
    lCtx.clearRect(0, 0, leftCanvas.width, leftCanvas.height);
    rCtx.clearRect(0, 0, rightCanvas.width, rightCanvas.height);
}

// expor globalmente para o config.js poder chamar
window.statsStart = statsStart;
window.statsStop  = statsStop;
