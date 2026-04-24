/* ═══════════════════════════════════════════════════════════
   chart.js — Gráfico de coordenadas paralelas, onda e toast
   Depende de: config.js
═══════════════════════════════════════════════════════════ */

// ── Constantes da onda ───────────────────────────────────
const WAVE_SPEED = 0.018;  // velocidade de rotação da fase
const WAVE_AMP   = 0.38;   // amplitude em fracção de (H - pt - pb) / 2

// ── Estado da onda ───────────────────────────────────────
let waveRaf         = null;
let wavePhase       = 0;
let waveActive      = false;
let waveSettling    = false;
let waveSettleStart = 0;
let waveSettleFrom  = 0;

// ════════════════════════════════════════════════════════════
//   SVG helpers
// ════════════════════════════════════════════════════════════

const NS = 'http://www.w3.org/2000/svg';

function mkEl(tag, attrs, text) {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (text !== undefined) el.textContent = text;
    return el;
}

/** Constrói um path cúbico suavizado a partir de um array de {x, y} */
function pointsToCurvedPath(pts) {
    if (pts.length < 2) return '';
    if (pts.length === 2) return `M${pts[0].x} ${pts[0].y} L${pts[1].x} ${pts[1].y}`;
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const midX = (p1.x + p2.x) / 2;
        const cp1x = midX, cp1y = p1.y;
        const cp2x = midX, cp2y = p2.y;
        d += ` C${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
    }
    return d;
}

/** Desenha uma linha curva + pontos no SVG pai */
function drawCurvedLine(parent, ans, axX, axY, sw, alpha, forceColor, filterId) {
    if (ans.length < 2) return;
    const pts   = ans.map((v, i) => ({ x: axX(i), y: axY(v) }));
    const d     = pointsToCurvedPath(pts);
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

// ════════════════════════════════════════════════════════════
//   Gráfico principal
// ════════════════════════════════════════════════════════════

/**
 * Renderiza o gráfico de coordenadas paralelas.
 * @param {object|null} highlightEntry - { curso, answers } para destacar com neon
 * @param {number}      waveOffset     - fase actual da onda (0 = sem onda)
 */
function drawMainChart(highlightEntry = null, waveOffset = 0) {
    const svgEl = document.getElementById('mainChartSvg');

    // Dimensões virtuais fixas do canvas (independentes do scale do ecrã)
    const isFs = document.getElementById('stage')?.classList.contains('graph-fullscreen');
    // Normal: RIGHT_W=4320, padding h=80 cada lado, header=140, pad top=60, pad bot=140
    // Fullscreen: painel ocupa CANVAS_W inteiro, sem header nem padding
    const W = isFs ? CANVAS_W        : (RIGHT_W - 160);
    const H = isFs ? CANVAS_H        : (CANVAS_H - 140 - 200);

    const nQ = QUESTIONS.length;
    const pt = 80, pb = 80, pl = 120, pr = 120;
    const axX = i => pl + (i / (nQ - 1)) * (W - pl - pr);
    const axY = v => pt + (v / 2)        * (H - pt - pb);

    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svgEl.innerHTML = '';

    // ── Definições (filtros + clip) ──────────────────────
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

    // ── Eixos e labels ───────────────────────────────────
    for (let i = 0; i < nQ; i++) {
        const x = axX(i);
        const q = QUESTIONS[i];

        // linha do eixo
        svgEl.appendChild(mkEl('line', {
            x1:x, y1:axY(0) - 16, x2:x, y2:axY(2) + 16,
            stroke:'rgba(255,255,255,0.18)', 'stroke-width':'2'
        }));

        // label da pergunta (topo)
        svgEl.appendChild(mkEl('text', {
            x, y: pt - 40,
            'text-anchor':'middle',
            fill:'rgba(255,255,255,0.80)',
            'font-size':'26',
            'font-family':'Space Mono,monospace',
            'letter-spacing':'2',
            'font-weight':'700'
        }, q.label));

        // ticks + labels das opcoes de resposta
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

            // label da opcao nos eixos extremos
            if (isFirst || isLast) {
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
                // nos eixos do meio: numero pequeno (1,2,3)
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

    // ── Linhas de dados ──────────────────────────────────
    const all        = dbLoad();
    const totalLines = all.filter(r => r.answers && r.answers.length >= 2).length;
    const waveAmpPx  = waveOffset !== 0 ? WAVE_AMP * (H - pt - pb) / 2 : 0;

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
            const age       = totalLines > 1 ? globalIdx / (totalLines - 1) : 1;
            const alpha     = 0.30 + age * 0.65;
            const lineSeed  = (globalIdx * 2.399) % (2 * Math.PI); // golden angle
            const axYFn     = v => axYWave(v, lineSeed);
            drawCurvedLine(grp, row.answers, axX, axYFn, 3, alpha, null, null);
        });
        svgEl.appendChild(grp);
    });

    // ── Linha destacada (neon) ───────────────────────────
    if (highlightEntry) {
        const { curso: hc, answers: ha } = highlightEntry;
        const color = COLORS[hc] || '#fff';

        // glow exterior largo
        const glowGrp2 = mkEl('g', { stroke: color, 'clip-path':'url(#chartClip)' });
        drawCurvedLine(glowGrp2, ha, axX, axY, 20, 0.20, color, 'glow_neon');
        svgEl.appendChild(glowGrp2);

        // glow interior
        const glowGrp = mkEl('g', { stroke: color, 'clip-path':'url(#chartClip)' });
        drawCurvedLine(glowGrp, ha, axX, axY, 10, 0.40, color, 'glow_neon');
        svgEl.appendChild(glowGrp);

        // linha sólida no topo
        const topGrp = mkEl('g', { stroke: color, 'clip-path':'url(#chartClip)' });
        drawCurvedLine(topGrp, ha, axX, axY, 5, 1.0, color, null);
        svgEl.appendChild(topGrp);
    }
}

/** Desenha o gráfico parcial durante o quiz (S2) */
function drawS2Partial() {
    if (answers.length < 2) return;
    drawMainChart({ curso, answers });
}

// ════════════════════════════════════════════════════════════
//   Onda animada (idle em S0)
// ════════════════════════════════════════════════════════════

function startWave() {
    waveActive   = true;
    waveSettling = false;
    if (!waveRaf) waveRaf = requestAnimationFrame(waveLoop);
}

function stopWave() {
    if (!waveActive) return;
    waveActive      = false;
    waveSettling    = true;
    waveSettleFrom  = wavePhase;
    waveSettleStart = performance.now();
}

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

// ════════════════════════════════════════════════════════════
//   Toast neon + contador de participantes
// ════════════════════════════════════════════════════════════

/**
 * Mostra o toast neon com a linha do utilizador destacada no gráfico.
 * @param {string}   c   - curso (dm | ei | cd | ext)
 * @param {number[]} ans - respostas do utilizador
 */
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

    neonTimer = setTimeout(() => {
        document.getElementById('neonToast').classList.remove('show');
        drawMainChart();
    }, NEON_SEC * 1000);
}

/** Actualiza o contador de participantes no canto inferior direito */
function updateParticipantCount() {
    document.getElementById('participantNum').textContent = dbLoad().length;
}

// ── Init: primeiro render do gráfico ────────────────────
drawMainChart();

// ── Mostrar / esconder o painel do gráfico ───────────────
const _panelRight = document.getElementById('panelRight');
const _stage = document.getElementById('stage');

function setGraphFullscreen(enabled) {
    _stage.classList.toggle('graph-fullscreen', enabled);
    if (enabled) drawMainChart();
}


function showGraph() {
    _panelRight.style.transition    = 'opacity 0.8s ease';
    _panelRight.style.opacity       = '1';
    _panelRight.style.pointerEvents = 'all';
    drawMainChart();
    updateParticipantCount();
}

function hideGraph() {
    _panelRight.style.transition    = 'opacity 0.5s ease';
    _panelRight.style.opacity       = '0';
    _panelRight.style.pointerEvents = 'none';
}

// Painel come?a escondido ? s? aparece no final do quiz
_panelRight.style.opacity       = '0';
_panelRight.style.pointerEvents = 'none';
