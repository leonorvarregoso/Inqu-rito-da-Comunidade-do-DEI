// parâmetros da onda animada que aparece em S1
const WAVE_SPEED = 0.018;
const WAVE_AMP   = 0.38;
const LINE_BEND_JITTER = 120;
const STAT_BG_COLOR = '#f8eee5';
const STAT_STAIN_COLORS = ['#ffb7b8', '#fa450e', '#d9c667', '#ffb7b8'];
const STAT_STAIN_STOPS = [0, 0.33, 0.66, 1];

// estado da onda
let waveRaf         = null;
let wavePhase       = 0;
let waveActive      = false;
let waveSettling    = false;
let waveSettleStart = 0;
let waveSettleFrom  = 0;

// namespace SVG
const NS = 'http://www.w3.org/2000/svg';

// cria um elemento SVG com os atributos e texto dados
function mkEl(tag, attrs, text) {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (text !== undefined) el.textContent = text;
    return el;
}

// constrói um path cúbico suavizado a partir de um array de pontos
function seededNoise(seed, idx, salt = 0) {
    const x = Math.sin(seed * 97.13 + idx * 41.77 + salt * 19.31) * 10000;
    return (x - Math.floor(x)) * 2 - 1;
}

function statLerpColor(c1, c2, t) {
    const r1 = parseInt(c1.slice(1,3), 16), g1 = parseInt(c1.slice(3,5), 16), b1 = parseInt(c1.slice(5,7), 16);
    const r2 = parseInt(c2.slice(1,3), 16), g2 = parseInt(c2.slice(3,5), 16), b2 = parseInt(c2.slice(5,7), 16);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `rgb(${r},${g},${b})`;
}

function statStainColor(xFrac, yFrac, n, t) {
    const raw = (xFrac * 0.5 + yFrac * 0.5 + n * 0.15 + t * 0.08) % 1;
    const value = raw < 0 ? raw + 1 : raw;

    for (let i = 0; i < STAT_STAIN_STOPS.length - 1; i++) {
        const from = STAT_STAIN_STOPS[i];
        const to = STAT_STAIN_STOPS[i + 1];
        if (value >= from && value <= to) {
            return statLerpColor(
                STAT_STAIN_COLORS[i],
                STAT_STAIN_COLORS[i + 1],
                (value - from) / (to - from)
            );
        }
    }
    return STAT_STAIN_COLORS[0];
}

function pointsToCurvedPath(pts, seed = 0, bendAmp = 0) {
    if (pts.length < 2) return '';
    if (pts.length === 2) return `M${pts[0].x} ${pts[0].y} L${pts[1].x} ${pts[1].y}`;
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const midX = (p1.x + p2.x) / 2;
        const cpJitter = bendAmp ? seededNoise(seed, i, 3) * bendAmp * 0.35 : 0;
        const cp1x = midX + cpJitter;
        const cp2x = midX - cpJitter;
        const cp1y = p1.y + (bendAmp ? seededNoise(seed, i, 1) * bendAmp : 0);
        const cp2y = p2.y + (bendAmp ? seededNoise(seed, i, 2) * bendAmp : 0);
        d += ` C${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
    }
    return d;
}

// desenha uma linha curva + pontos no elemento SVG
function drawCurvedLine(parent, ans, axX, axY, sw, alpha, forceColor, filterId, jitterSeed = 0, bendAmp = 0) {
    if (ans.length < 2) return;
    const pts   = ans.map((v, i) => ({
        x: axX(i),
        y: axY(v)
    }));
    const d     = pointsToCurvedPath(pts, jitterSeed, bendAmp);
    const attrs = { d, fill:'none', 'stroke-width': String(sw), opacity: String(alpha) };
    if (forceColor) attrs.stroke = forceColor;
    if (filterId)   attrs.filter = `url(#${filterId})`;
    parent.appendChild(mkEl('path', attrs));
    pts.forEach(p => {
        const ca = { cx: String(p.x), cy: String(p.y), r: sw > 1.5 ? '6' : '3', opacity: String(Math.min(alpha + .15, 1)) };
        if (forceColor) ca.fill   = forceColor;
        if (filterId)   ca.filter = `url(#${filterId})`;
        parent.appendChild(mkEl('circle', ca));
    });
}

// renderiza o gráfico de coordenadas paralelas
// highlightEntry para destacar com neon
// waveOffset fase atual da onda
function drawMainChart(highlightEntry = null, waveOffset = 0) {
    const svgEl = document.getElementById('mainChartSvg');

    // em fullscreen o gráfico ocupa o stage inteiro sem padding
    const isFs = document.getElementById('stage')?.classList.contains('graph-fullscreen');
    const W = isFs ? CANVAS_W        : (RIGHT_W - 160);
    const H = isFs ? CANVAS_H        : (CANVAS_H - 140 - 200);

    const nQ = QUESTIONS.length;
    const pt = 80, pb = 80, pl = 120, pr = 120;

    // funções de mapeamento: índice/valor coordenada SVG
    const axX = i => pl + (i / (nQ - 1)) * (W - pl - pr);
    const axY = v => pt + (v / 2)        * (H - pt - pb);

    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svgEl.innerHTML = '';

    // filtros de glow e clip path
    const defs = mkEl('defs', {});
    defs.innerHTML = `
    <filter id="glow_main" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="8" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow_neon" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="14" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="chartClip">
      <rect x="0" y="0" width="${W}" height="${H}"/>
    </clipPath>`;
    svgEl.appendChild(defs);

    for (let i = 0; i < nQ; i++) {
        const x = axX(i);
        const q = QUESTIONS[i];

        // linha do eixo
        svgEl.appendChild(mkEl('line', {
            x1:x, y1:axY(0) - 16, x2:x, y2:axY(2) + 16,
            stroke:'rgba(255,255,255,0.18)', 'stroke-width':'2'
        }));

        // label da pergunta no topo do eixo
        svgEl.appendChild(mkEl('text', {
            x, y: pt - 40,
            'text-anchor':'middle',
            fill:'#6d2239',
            'font-size':'26',
            'font-family':'Space Mono,monospace',
            'letter-spacing':'2',
            'font-weight':'700'
        }, q.label));

        // ticks e labels das três opções de resposta
        [0, 1, 2].forEach(v => {
            const cy = axY(v);
            const optText = q.opts ? q.opts[v] : String(v);
            const isFirst = i === 0;
            const isLast  = i === nQ - 1;
            const anchor  = isFirst ? 'start' : isLast ? 'end' : 'middle';
            const labelX  = isFirst ? x + 14 : isLast ? x - 14 : x;

            // tick dot
            svgEl.appendChild(mkEl('circle', {
                cx: String(x), cy: String(cy), r:'6',
                fill:'rgba(255,255,255,0.22)',
                stroke:'rgba(255,255,255,0.55)',
                'stroke-width':'1.5'
            }));

            // labels de texto só nos eixos extremos — nos do meio fica um número pequeno
            if (isFirst || isLast) {
                // quebrar o texto em linhas se for muito comprido
                const words = optText.split(' ');
                const lineH = 22;
                const lines = [];
                let cur = '';
                words.forEach(w => {
                    const test = cur ? cur + ' ' + w : w;
                    if (test.length > 14 && cur) { lines.push(cur); cur = w; }
                    else cur = test;
                });
                if (cur) lines.push(cur);
                const totalH = lines.length * lineH;
                const startY = cy - totalH/2 + lineH/2;
                lines.forEach((ln, li) => {
                    svgEl.appendChild(mkEl('text', {
                        x: String(labelX), y: String(startY + li * lineH),
                        'text-anchor': anchor,
                        fill: 'rgba(255,255,255,0.60)',
                        'font-size': '18',
                        'font-family': 'Space Mono,monospace',
                        'letter-spacing': '0'
                    }, ln));
                });
            } else {
                // eixos intermédios numero
                svgEl.appendChild(mkEl('text', {
                    x: String(x + 10), y: String(cy - 10),
                    'text-anchor':'start',
                    fill:'rgba(255,255,255,0.32)',
                    'font-size':'16',
                    'font-family':'Space Mono,monospace'
                }, String(v + 1)));
            }
        });
    }

    // linhas de dados — uma por participante, agrupadas por curso
    const all        = dbLoad();
    const totalLines = all.filter(r => r.answers && r.answers.length >= 2).length;
    const waveAmpPx  = waveOffset !== 0 ? WAVE_AMP * (H - pt - pb) / 2 : 0;

    //  onda sinusoidal
    function axYWave(v, lineSeed) {
        const base = axY(v);
        if (!waveOffset) return base;
        return base + Math.sin(waveOffset + lineSeed) * waveAmpPx;
    }

    ['dm','ei','cd','ext'].forEach(c => {
        const rows = all.filter(r => r.curso === c && r.answers && r.answers.length >= 2);
        const grp  = mkEl('g', { stroke: COLORS[c] || '#fff', 'clip-path':'url(#chartClip)' });
        rows.forEach(row => {
            const globalIdx = all.indexOf(row);
            // linhas mais recentes ficam mais opacas
            const age       = totalLines > 1 ? globalIdx / (totalLines - 1) : 1;
            const alpha     = 0.30 + age * 0.65;
            // seed única por linha para a onda não ser síncrona
            const lineSeed  = (globalIdx * 2.399) % (2 * Math.PI);
            const axYFn     = v => axYWave(v, lineSeed);
            drawCurvedLine(grp, row.answers, axX, axYFn, 3, alpha, null, null, globalIdx + 1, LINE_BEND_JITTER);
        });
        svgEl.appendChild(grp);
    });

    // linha neon destacada
    if (highlightEntry) {
        const { curso: hc, answers: ha } = highlightEntry;
        const color = COLORS[hc] || '#fff';

        // três camadas: glow largo, glow interior, linha sólida
        const glowGrp2 = mkEl('g', { stroke: color, 'clip-path':'url(#chartClip)' });
        drawCurvedLine(glowGrp2, ha, axX, axY, 20, 0.20, color, 'glow_neon');
        svgEl.appendChild(glowGrp2);

        const glowGrp = mkEl('g', { stroke: color, 'clip-path':'url(#chartClip)' });
        drawCurvedLine(glowGrp, ha, axX, axY, 10, 0.40, color, 'glow_neon');
        svgEl.appendChild(glowGrp);

        const topGrp = mkEl('g', { stroke: color, 'clip-path':'url(#chartClip)' });
        drawCurvedLine(topGrp, ha, axX, axY, 5, 1.0, color, null);
        svgEl.appendChild(topGrp);
    }
}

// inicia a onda animada
function startWave() {
    waveActive   = true;
    waveSettling = false;
    if (!waveRaf) waveRaf = requestAnimationFrame(waveLoop);
}

// para a onda com ease-out suave
function stopWave() {
    if (!waveActive) return;
    waveActive      = false;
    waveSettling    = true;
    waveSettleFrom  = wavePhase;
    waveSettleStart = performance.now();
}

// loop da onda — atualiza a fase e redesenha o gráfico
function waveLoop() {
    waveRaf = null;
    if (waveSettling) {
        const elapsed = performance.now() - waveSettleStart;
        const dur     = 900;
        const t       = Math.min(elapsed / dur, 1);
        const ease    = 1 - Math.pow(1 - t, 3);
        wavePhase     = waveSettleFrom * (1 - ease);
        drawMainChart(null, wavePhase);
        if (t < 1) {
            waveRaf = requestAnimationFrame(waveLoop);
        } else {
            wavePhase    = 0;
            waveSettling = false;
            drawMainChart();
        }
        return;
    }
    if (!waveActive) return;
    wavePhase += WAVE_SPEED;
    drawMainChart(null, wavePhase);
    waveRaf = requestAnimationFrame(waveLoop);
}

//  linha do utilizador destacada no gráfico
function flashNeon(c, ans) {
    clearTimeout(neonTimer);
    drawMainChart({ curso: c, answers: ans });

    const color = COLORS[c] || '#fff';
    document.documentElement.style.setProperty('--user-color', color);

    const swatch = document.getElementById('neonSwatch');
    const course = document.getElementById('neonCourse');
    swatch.style.background = color;
    swatch.style.boxShadow  = `0 0 30px ${color}`;
    course.textContent      = NAMES_FULL[c];
    course.style.color      = color;

    document.getElementById('neonToast').classList.add('show');

    //  limpa o destaque
    neonTimer = setTimeout(() => {
        document.getElementById('neonToast').classList.remove('show');
        drawMainChart();
    }, NEON_SEC * 1000);
}

// atualiza o contador de participantes no canto do gráfico
function updateParticipantCount() {
    document.getElementById('participantNum').textContent = dbLoad().length;
}

// render inicial ao carregar a página
drawMainChart();

// referências para mostrar/esconder o painel do gráfico
const _panelRight = document.getElementById('panelRight');
const _stage = document.getElementById('stage');

// ativa ou desativa o modo fullscreen do gráfico (usado em S3)
function setGraphFullscreen(enabled) {
    _stage.classList.toggle('graph-fullscreen', enabled);
    if (enabled) drawMainChart();
}

// mostra o painel do gráfico com fade in
function showGraph() {
    _panelRight.style.transition    = 'opacity 0.8s ease';
    _panelRight.style.opacity       = '1';
    _panelRight.style.pointerEvents = 'all';
    drawMainChart();
    updateParticipantCount();
}

// esconde o painel do gráfico com fade out
function hideGraph() {
    _panelRight.style.transition    = 'opacity 0.5s ease';
    _panelRight.style.opacity       = '0';
    _panelRight.style.pointerEvents = 'none';
}

// painel só aparece no final do quiz
_panelRight.style.opacity       = '0';
_panelRight.style.pointerEvents = 'none';

const graphBubble = (function() {
    const el = document.createElement('div');
    el.id = 'graphBubble';
    el.innerHTML = `
        <canvas id="gbCanvas"></canvas>
        <div id="gbText">
            <div class="gb-pct" id="gbPct"></div>
            <div class="gb-lbl" id="gbLbl"></div>
        </div>
    `;
    document.getElementById('panelRight').appendChild(el);
    return el;
})();

const gbPct = document.getElementById('gbPct');
const gbLbl = document.getElementById('gbLbl');
const gbCanvas = document.getElementById('gbCanvas');
const gbCtx    = gbCanvas.getContext('2d');

// Tamanho da bolha em px (deve bater certo com o CSS 700×700)
const GB_SIZE = 700;
gbCanvas.width  = GB_SIZE;
gbCanvas.height = GB_SIZE;

let gbTime       = 0;
let gbAnimId     = null;
let gbCurrentAxis = -1;
let gbHideTimer   = null;
let gbVisible     = false;

// Funções de noise e forma da bolha circular
function gbNoise(x, y, t) {
    return Math.sin(x * 0.04 + t) +
           Math.cos(y * 0.04 - t * 0.7) +
           Math.sin((x + y) * 0.02 + t * 0.5);
}

function gbShape(x, y, cols, rows) {
    const dx = (x - cols / 2) / (cols * 0.38);
    const dy = (y - rows / 2) / (rows * 0.38);
    return 1.2 - Math.sqrt(dx * dx + dy * dy);
}

function gbDraw() {
    gbTime += 0.003;
    const W = GB_SIZE, H = GB_SIZE;
    const R = W * 0.5;
    const t = gbTime;

    gbCtx.clearRect(0, 0, W, H);

    // Clip circular
    gbCtx.save();
    gbCtx.beginPath();
    gbCtx.arc(W / 2, H / 2, R, 0, Math.PI * 2);
    gbCtx.clip();

    // Fundo igual ao ecra
    gbCtx.fillStyle = typeof STAT_BG_COLOR !== 'undefined' ? STAT_BG_COLOR : '#f8eee5';
    gbCtx.fillRect(0, 0, W, H);

    // Grid de quadrados com noise orgânico
    const COLS = 80, ROWS = 80;
    const cellW = W / COLS, cellH = H / ROWS;

    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            const n = gbNoise(col, row, t);
            const s = gbShape(col, row, COLS, ROWS);
            let v = s * 1.4 + n * 0.25;
            v = Math.tanh(v * 2);
            if (v < 0.05) continue;

            const breathe = 0.7 + Math.sin(t * 2 + col * 0.02 + row * 0.02) * 0.3;
            const size    = (0.5 + Math.abs(v) * 0.5) * breathe;
            const ox = Math.sin(t + row * 0.02) * 0.5;
            const oy = Math.cos(t + col * 0.02) * 0.5;

            gbCtx.fillStyle = typeof statStainColor === 'function'
                ? statStainColor(col / COLS, row / ROWS, n, t)
                : '#d9c667';
            gbCtx.fillRect(col * cellW + ox, row * cellH + oy, cellW * size, cellH * size);
        }
    }

    gbCtx.restore();

    gbAnimId = requestAnimationFrame(gbDraw);
}

function gbStart() {
    if (gbAnimId) return;
    gbDraw();
}

function gbStop() {
    if (gbAnimId) { cancelAnimationFrame(gbAnimId); gbAnimId = null; }
}

// Mostra a bolha para o eixo i, centrada verticalmente no panelRight
function getGraphStatFact(axisIdx) {
    return getQuestionStat(axisIdx);
}

function graphSetStatText(fact) {
    gbPct.textContent = fact.pct + '%';
    gbLbl.innerHTML   = fact.label.replace(/\n/g, '<br>');
}

function graphShowStat(axisIdx) {
    if (axisIdx < 0 || axisIdx >= QUESTIONS.length) return;

    if (axisIdx === gbCurrentAxis && gbVisible) {
        clearTimeout(gbHideTimer); gbHideTimer = null;
        graphSetStatText(getGraphStatFact(axisIdx));
        return;
    }

    clearTimeout(gbHideTimer); gbHideTimer = null;
    gbCurrentAxis = axisIdx;
    gbVisible     = true;

    const fact = getGraphStatFact(axisIdx);

    // Posição X do eixo no panelRight
    const isFs  = document.getElementById('stage')?.classList.contains('graph-fullscreen');
    const W     = isFs ? CANVAS_W : (RIGHT_W - 160);
    const nQ    = QUESTIONS.length;
    const pl    = 120, pr = 120;
    const axX   = i => pl + (i / (nQ - 1)) * (W - pl - pr);
    const xFrac = axX(axisIdx) / W;
    const chartMain = document.getElementById('chartMain');
    const chartW    = chartMain?.offsetWidth || (RIGHT_W - 160);
    const bubbleX   = 80 + xFrac * chartW;

    graphBubble.style.left      = bubbleX + 'px';
    graphBubble.style.opacity   = '0';
    graphBubble.style.transform = 'translateX(-50%) translateY(calc(-50% - 12px)) scale(0.9)';

    graphSetStatText(fact);

    gbStart();

    // Força reflow
    graphBubble.offsetHeight;
    graphBubble.style.opacity   = '1';
    graphBubble.style.transform = 'translateX(-50%) translateY(-50%) scale(1)';
}

// Esconde a bolha com delay de tolerância
function graphHideStat(delay = 1200) {
    if (gbHideTimer) return;
    gbHideTimer = setTimeout(() => {
        gbHideTimer   = null;
        gbVisible     = false;
        gbCurrentAxis = -1;
        graphBubble.style.opacity   = '0';
        graphBubble.style.transform = 'translateX(-50%) translateY(calc(-50% - 12px)) scale(0.9)';
        setTimeout(gbStop, 500);
    }, delay);
}

// API chamada pelo forms.js
window.graphShowStat = graphShowStat;
window.graphHideStat = graphHideStat;
