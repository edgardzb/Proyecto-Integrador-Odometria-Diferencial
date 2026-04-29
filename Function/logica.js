    // ── constantes ──
    const D_MM    = 140;
    const CIRCUM  = (Math.PI * D_MM) / 1000;   // metros/vuelta
    const L       = 0.30;                        // separación ruedas (m) — valor de prueba
    const INTERVAL = 50;
    const MAX_PTS  = 80;

    // ── estado fetch ──
    let prevTicksL = 0, prevTicksR = 0;
    let prevTimeL  = Date.now(), prevTimeR = Date.now();
    let lastVL = 0, lastVR = 0;
    let totalTicksL = 0, totalTicksR = 0;

    // ── odometría ──
    let theta = 0;   // rad
    let gX = 0, gY = 0;
    let localX = 0, localY = 0;
    let totalDist = 0;
    let prevOdoL = 0, prevOdoR = 0;

    // trayectoria
    const path = [{ x: 0, y: 0 }];

    // ── chart velocidad ──
    const speedLabels = [], dataL = [], dataR = [];
    const speedChart = new Chart(document.getElementById('speedChart'), {
      type: 'line',
      data: {
        labels: speedLabels,
        datasets: [
          { label: 'Left',  data: dataL, borderColor: '#6baadc', backgroundColor: 'rgba(107,170,220,0.07)', borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: true },
          { label: 'Right', data: dataR, borderColor: '#e0956b', backgroundColor: 'rgba(224,149,107,0.07)', borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: true }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { position: 'top', align: 'end', labels: { font: { family: 'monospace', size: 10 }, color: '#888', boxWidth: 10, padding: 12 } } },
        scales: {
          x: { ticks: { display: false }, grid: { color: '#f0f0f0' } },
          y: { beginAtZero: true, ticks: { font: { family: 'monospace', size: 10 }, color: '#aaa', maxTicksLimit: 5 }, grid: { color: '#f0f0f0' } }
        }
      }
    });

    // ── canvas trayectoria ──
    const tCanvas = document.getElementById('trajCanvas');
    const tCtx    = tCanvas.getContext('2d');
    const CW = tCanvas.width, CH = tCanvas.height;
    const MARGIN = 40;

    // map state
    let mapMode   = 'follow';   // 'follow' | 'free'
    let mapScale  = 200;        // px per meter (user controlled in free mode)
    let mapOX     = 0;          // world-space center X (free mode)
    let mapOY     = 0;          // world-space center Y (free mode)
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let dragOX = 0, dragOY = 0;

    function setMapMode(mode) {
      mapMode = mode;
      document.getElementById('btnFollow').classList.toggle('active', mode === 'follow');
      document.getElementById('btnFree').classList.toggle('active', mode === 'free');
      document.getElementById('mapModeLabel').textContent = mode === 'follow' ? 'siguiendo robot' : 'modo libre';
      tCanvas.style.cursor = mode === 'free' ? 'grab' : 'default';
      if (mode === 'free') {
        // init free view at current follow state
        const v = computeFollowView();
        mapScale = v.scale;
        mapOX    = v.ox;
        mapOY    = v.oy;
      }
      drawTrajectory();
    }

    function zoomMap(factor) {
      if (mapMode === 'follow') {
        // switch to free first so zoom is preserved
        setMapMode('free');
      }
      mapScale = Math.min(Math.max(mapScale * factor, 20), 2000);
      drawTrajectory();
    }

    function resetZoom() {
      if (mapMode === 'free') {
        const v = computeFollowView();
        mapScale = v.scale;
        mapOX    = gX;
        mapOY    = gY;
        drawTrajectory();
      }
    }

    // drag events
    tCanvas.addEventListener('mousedown', e => {
      if (mapMode !== 'free') return;
      isDragging = true;
      dragStartX = e.offsetX;
      dragStartY = e.offsetY;
      dragOX = mapOX;
      dragOY = mapOY;
      tCanvas.style.cursor = 'grabbing';
    });

    tCanvas.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const dx = e.offsetX - dragStartX;
      const dy = e.offsetY - dragStartY;
      mapOX = dragOX - dx / mapScale;
      mapOY = dragOY + dy / mapScale;
      drawTrajectory();
    });

    tCanvas.addEventListener('mouseup',   () => { isDragging = false; tCanvas.style.cursor = 'grab'; });
    tCanvas.addEventListener('mouseleave',() => { isDragging = false; tCanvas.style.cursor = 'grab'; });

    // scroll to zoom in free mode
    tCanvas.addEventListener('wheel', e => {
      e.preventDefault();
      if (mapMode !== 'free') setMapMode('free');
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      mapScale = Math.min(Math.max(mapScale * factor, 20), 2000);
      drawTrajectory();
    }, { passive: false });

    function computeFollowView() {
      if (path.length === 0) return { scale: 200, ox: gX, oy: gY };
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of path) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
      if (gX < minX) minX = gX; if (gX > maxX) maxX = gX;
      if (gY < minY) minY = gY; if (gY > maxY) maxY = gY;
      const spanX = maxX - minX || 0.5;
      const spanY = maxY - minY || 0.5;
      const scale = Math.min((CW - MARGIN * 2) / spanX, (CH - MARGIN * 2) / spanY, 600);
      return { scale, ox: gX, oy: gY };
    }

    function computeView() {
      if (mapMode === 'follow') return computeFollowView();
      return { scale: mapScale, ox: mapOX, oy: mapOY };
    }

    function worldToCanvas(x, y, ox, oy, scale) {
      return {
        px: CW / 2 + (x - ox) * scale,
        py: CH / 2 - (y - oy) * scale
      };
    }

    function drawTrajectory() {
      tCtx.clearRect(0, 0, CW, CH);

      const isDark = document.documentElement.classList.contains('dark');
      tCtx.fillStyle = isDark ? '#141414' : '#fafafa';
      tCtx.fillRect(0, 0, CW, CH);

      const { scale, ox, oy } = computeView();

      // ejes globales (pasan por el origen del mundo)
      const originPx = worldToCanvas(0, 0, ox, oy, scale);
      tCtx.strokeStyle = isDark ? '#222' : '#e8e8e8';
      tCtx.lineWidth = 1;
      tCtx.setLineDash([4, 4]);
      tCtx.beginPath();
      tCtx.moveTo(originPx.px, 0);       tCtx.lineTo(originPx.px, CH);
      tCtx.moveTo(0, originPx.py);       tCtx.lineTo(CW, originPx.py);
      tCtx.stroke();
      tCtx.setLineDash([]);

      // etiquetas
      tCtx.fillStyle = isDark ? '#333' : '#ccc';
      tCtx.font = '10px monospace';
      tCtx.fillText('X', Math.min(originPx.px + 4, CW - 16), Math.max(originPx.py - 4, 12));
      tCtx.fillText('Y', Math.max(originPx.px + 4, 4), 12);

      // escala visual
      const meterPx = scale;
      const barW = Math.min(meterPx, 60);
      const barLabel = (barW / scale).toFixed(2) + ' m';
      tCtx.strokeStyle = isDark ? '#333' : '#ccc'; tCtx.lineWidth = 1.5;
      tCtx.beginPath();
      tCtx.moveTo(12, CH - 16); tCtx.lineTo(12 + barW, CH - 16);
      tCtx.stroke();
      tCtx.fillStyle = isDark ? '#444' : '#bbb'; tCtx.font = '9px monospace';
      tCtx.fillText(barLabel, 12, CH - 6);

      // trayectoria — actual en color normal, futura (snapshots adelante) en pálido
      const futureSnaps = (paused && snapIdx !== -1 && snapIdx < snapshots.length - 1)
        ? snapshots.slice(snapIdx + 1)
        : [];

      // futura (pálida) - puntos que existen en snapshots pero no en el path actual
      if (futureSnaps.length > 0) {
        const futPath = futureSnaps[futureSnaps.length - 1].path;
        if (futPath.length > 1) {
          tCtx.beginPath();
          tCtx.strokeStyle = isDark ? 'rgba(107,170,220,0.18)' : 'rgba(107,170,220,0.25)';
          tCtx.lineWidth = 1.5;
          tCtx.setLineDash([4, 4]);
          // start from end of current path
          const startPt = path.length > 0 ? path[path.length - 1] : futPath[0];
          const sp = worldToCanvas(startPt.x, startPt.y, ox, oy, scale);
          tCtx.moveTo(sp.px, sp.py);
          for (let i = 0; i < futPath.length; i++) {
            const p = worldToCanvas(futPath[i].x, futPath[i].y, ox, oy, scale);
            tCtx.lineTo(p.px, p.py);
          }
          tCtx.stroke();
          tCtx.setLineDash([]);
        }
      }

      // actual (color normal)
      if (path.length > 1) {
        tCtx.beginPath();
        tCtx.strokeStyle = '#6baadc';
        tCtx.lineWidth = 1.5;
        tCtx.setLineDash([]);
        const p0 = worldToCanvas(path[0].x, path[0].y, ox, oy, scale);
        tCtx.moveTo(p0.px, p0.py);
        for (let i = 1; i < path.length; i++) {
          const p = worldToCanvas(path[i].x, path[i].y, ox, oy, scale);
          tCtx.lineTo(p.px, p.py);
        }
        tCtx.stroke();
      }

      // carro actual
      const cp = worldToCanvas(gX, gY, ox, oy, scale);
      const half_L = (L / 2) * scale;

      // flecha adelante
      tCtx.strokeStyle = isDark ? '#aaa' : '#555';
      tCtx.lineWidth = 1.5;
      tCtx.beginPath();
      tCtx.moveTo(cp.px, cp.py);
      tCtx.lineTo(cp.px + Math.cos(theta) * 18, cp.py - Math.sin(theta) * 18);
      tCtx.stroke();

      // ruedas
      const wlPx = cp.px + Math.cos(theta + Math.PI / 2) * half_L;
      const wlPy = cp.py - Math.sin(theta + Math.PI / 2) * half_L;
      const wrPx = cp.px - Math.cos(theta + Math.PI / 2) * half_L;
      const wrPy = cp.py + Math.sin(theta + Math.PI / 2) * half_L;

      tCtx.strokeStyle = isDark ? '#2a2a2a' : '#ccc'; tCtx.lineWidth = 1;
      tCtx.beginPath(); tCtx.moveTo(wlPx, wlPy); tCtx.lineTo(wrPx, wrPy); tCtx.stroke();

      tCtx.fillStyle = '#6baadc';
      tCtx.beginPath(); tCtx.arc(wlPx, wlPy, 5, 0, Math.PI * 2); tCtx.fill();
      tCtx.fillStyle = '#e0956b';
      tCtx.beginPath(); tCtx.arc(wrPx, wrPy, 5, 0, Math.PI * 2); tCtx.fill();

      // centro del carro
      tCtx.fillStyle = isDark ? '#ccc' : '#333';
      tCtx.beginPath(); tCtx.arc(cp.px, cp.py, 3, 0, Math.PI * 2); tCtx.fill();

      // origen del mundo
      const origin = worldToCanvas(0, 0, ox, oy, scale);
      tCtx.fillStyle = '#ddd';
      tCtx.beginPath(); tCtx.arc(origin.px, origin.py, 3, 0, Math.PI * 2); tCtx.fill();
    }

    // ── odometría diferencial ──
    function updateOdometry() {
      const dL = (totalTicksL - prevOdoL) * CIRCUM;
      const dR = (totalTicksR - prevOdoR) * CIRCUM;
      prevOdoL = totalTicksL;
      prevOdoR = totalTicksR;

      if (dL === 0 && dR === 0) return;

      const dc = (dL + dR) / 2;
      const dTheta = (dR - dL) / L;

      theta += dTheta;
      gX += dc * Math.cos(theta);
      gY += dc * Math.sin(theta);
      totalDist += Math.abs(dc);

      // eje local: acumula avance local
      localX += dc;
      localY += dTheta * (L / 2);  // aproximación lateral

      // posición de cada rueda en el mundo
      const half_L = L / 2;
      const wlX = gX + Math.cos(theta + Math.PI / 2) * half_L;
      const wlY = gY + Math.sin(theta + Math.PI / 2) * half_L;
      const wrX = gX - Math.cos(theta + Math.PI / 2) * half_L;
      const wrY = gY - Math.cos(theta + Math.PI / 2) * half_L;
      // guardar punto trayectoria
      path.push({ x: gX, y: gY });
      if (path.length > 500) path.shift();

      // ── actualizar DOM ──
      const deg = (theta * 180 / Math.PI).toFixed(1);
      document.getElementById('angleDeg').textContent = deg + '°';
      document.getElementById('posXY').textContent    = `X: ${gX.toFixed(3)} · Y: ${gY.toFixed(3)}`;
      document.getElementById('totalDist').textContent = totalDist.toFixed(3) + ' m';

      document.getElementById('gx').textContent = gX.toFixed(3);
      document.getElementById('gy').textContent = gY.toFixed(3);
      document.getElementById('lx').textContent = localX.toFixed(3);
      document.getElementById('ly').textContent = localY.toFixed(3);
      document.getElementById('wlx').textContent = wlX.toFixed(3);
      document.getElementById('wly').textContent = wlY.toFixed(3);
      document.getElementById('wrx').textContent = wrX.toFixed(3);
      document.getElementById('wry').textContent = wrY.toFixed(3);

      drawTrajectory();
    }

    function resetTodo() {
      // reset servidores
      fetch('http://localhost:3000/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 0 }) });
      fetch('http://localhost:3001/reset', {method: 'POST', headers:{'Content-Type': 'application/json'}, body: JSON.stringify({value: 0}) });

      // reset ticks y velocidad
      totalTicksL = 0; totalTicksR = 0;
      prevTicksL  = 0; prevTicksR  = 0;
      prevTimeL   = Date.now(); prevTimeR = Date.now();
      prevLogTicksL = 0; prevLogTicksR = 0;
      lastVL = 0; lastVR = 0;

      // reset UI ticks
      document.getElementById('countL').textContent   = '0';
      document.getElementById('countR').textContent   = '0';
      document.getElementById('distRowL').textContent = 'd = 0.000 m';
      document.getElementById('distRowR').textContent = 'd = 0.000 m';
      document.getElementById('speedL').textContent   = '0.000';
      document.getElementById('speedR').textContent   = '0.000';

      // reset graficas velocidad
      dataL.length = 0; dataR.length = 0; speedLabels.length = 0;
      speedChart.data.labels = [];
      speedChart.update('none');

      // reset graficas mini
      thetaChart.data.datasets[0].data = []; thetaChart.data.labels = []; thetaChart.update('none');
      diffChart.data.datasets[0].data  = []; diffChart.data.labels  = []; diffChart.update('none');

      // reset odometría y canvas
      resetOdo();

      // reset snapshots
      snapshots.length = 0; snapIdx = -1;
      document.getElementById('btnRew').disabled = true;
      document.getElementById('btnFwd').disabled = true;
      updateFrameLabel();

      // reset log
      clearLog();

      // volver a play si estaba pausado
      paused = false;
      setCtrlBtns('play');
    }

    function resetOdo() {
      theta = 0; gX = 0; gY = 0; localX = 0; localY = 0; totalDist = 0;
      prevOdoL = totalTicksL; prevOdoR = totalTicksR;
      path.length = 0; path.push({ x: 0, y: 0 });
      drawTrajectory();
    }

    // ── mini charts ──
    const thetaLabels = [], thetaData = [];
    const diffLabels  = [], diffData  = [];

    const miniOpts = (label, color) => ({
      type: 'line',
      data: { labels: [], datasets: [{ label, data: [], borderColor: color, backgroundColor: color.replace(')', ',0.07)').replace('rgb','rgba'), borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: true }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { display: false }, grid: { color: '#f5f5f5' } },
          y: { ticks: { font: { family: 'monospace', size: 9 }, color: '#bbb', maxTicksLimit: 4 }, grid: { color: '#f5f5f5' } }
        }
      }
    });

    const thetaChart = new Chart(document.getElementById('thetaChart'), miniOpts('θ°', 'rgb(107,170,220)'));
    const diffChart  = new Chart(document.getElementById('diffChart'),  miniOpts('L-R', 'rgb(160,130,200)'));

    function pushMiniCharts() {
      const MAX = 60;
      const deg = parseFloat((theta * 180 / Math.PI).toFixed(1));
      const diff = totalTicksL - totalTicksR;

      thetaChart.data.labels.push('');
      thetaChart.data.datasets[0].data.push(deg);
      if (thetaChart.data.labels.length > MAX) { thetaChart.data.labels.shift(); thetaChart.data.datasets[0].data.shift(); }
      thetaChart.update('none');

      diffChart.data.labels.push('');
      diffChart.data.datasets[0].data.push(diff);
      if (diffChart.data.labels.length > MAX) { diffChart.data.labels.shift(); diffChart.data.datasets[0].data.shift(); }
      diffChart.update('none');
    }

    // ── theme ──
    function toggleTheme() {
      const root = document.documentElement;
      const isDark = root.classList.toggle('dark');
      document.getElementById('themeBtn').textContent = isDark ? 'modo claro' : 'modo noche';
      updateChartColors();
      // update canvas background
      drawTrajectory();
    }

    // ── log ──
    const MAX_LOG = 200;
    const logEntries = [];
    const activeFilters = new Set(['tick','odo','speed','warn']);
    let prevLogTicksL = 0, prevLogTicksR = 0;
    let prevLogTheta = 0;

    function ts() {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2,'0');
      const mm = String(d.getMinutes()).padStart(2,'0');
      const ss = String(d.getSeconds()).padStart(2,'0');
      const ms = String(d.getMilliseconds()).padStart(3,'0');
      return `${hh}:${mm}:${ss}.${ms}`;
    }

    function addLog(type, msg) {
      logEntries.push({ type, msg, time: ts() });
      if (logEntries.length > MAX_LOG) logEntries.shift();
      renderLog();
    }

    function renderLog() {
      const box = document.getElementById('logBox');
      const filtered = logEntries.filter(e => activeFilters.has(e.type));
      box.innerHTML = filtered.map(e => `
        <div class="log-row">
          <span class="log-time">${e.time}</span>
          <span class="log-tag tag-${e.type}">${e.type.toUpperCase()}</span>
          <span class="log-msg">${e.msg}</span>
        </div>
      `).join('');
      box.scrollTop = box.scrollHeight;
    }

    function toggleFilter(type, btn) {
      if (activeFilters.has(type)) { activeFilters.delete(type); btn.classList.remove('active'); }
      else                         { activeFilters.add(type);    btn.classList.add('active');    }
      renderLog();
    }

    function clearLog() { logEntries.length = 0; renderLog(); }

    function exportLog() {
      const now = new Date();
      const dateStr = now.toLocaleString('es-MX');
      const lines = [];

      lines.push('===================================================');
      lines.push('  MONITOREO DE TICKS - LOG EXPORTADO');
      lines.push(`  ${dateStr}`);
      lines.push('===================================================');
      lines.push('');

      // ── sección 1: config ──
      lines.push('-- CONFIGURACION -----------------------------------');
      lines.push(`  Diámetro rueda : 140 mm`);
      lines.push(`  Circunferencia : ${CIRCUM.toFixed(4)} m`);
      lines.push(`  Separación (L) : ${(L * 1000).toFixed(0)} mm`);
      lines.push(`  Servidor LEFT  : localhost:3000`);
      lines.push(`  Servidor RIGHT : localhost:3001`);
      lines.push('');

      // ── sección 2: estado final de ticks ──
      lines.push('-- MONITOREO DE TICKS -----------------------------');
      lines.push(`  ticksL         : ${totalTicksL}`);
      lines.push(`  ticksR         : ${totalTicksR}`);
      lines.push(`  Distancia L    : ${(totalTicksL * CIRCUM).toFixed(4)} m`);
      lines.push(`  Distancia R    : ${(totalTicksR * CIRCUM).toFixed(4)} m`);
      lines.push(`  Velocidad L    : ${lastVL.toFixed(4)} m/s`);
      lines.push(`  Velocidad R    : ${lastVR.toFixed(4)} m/s`);
      lines.push('');

      // ── sección 3: odometría diferencial ──
      lines.push('-- ODOMETRÍA DIFERENCIAL --------------------------');
      lines.push(`  Ángulo θ       : ${(theta * 180 / Math.PI).toFixed(3)}°`);
      lines.push(`  Posición X     : ${gX.toFixed(4)} m`);
      lines.push(`  Posición Y     : ${gY.toFixed(4)} m`);
      lines.push(`  Distancia total: ${totalDist.toFixed(4)} m`);
      lines.push(`  X local        : ${localX.toFixed(4)} m`);
      lines.push(`  Y local        : ${localY.toFixed(4)} m`);
      const half_L = L / 2;
      const wlX = gX + Math.cos(theta + Math.PI/2) * half_L;
      const wlY = gY + Math.sin(theta + Math.PI/2) * half_L;
      const wrX = gX - Math.cos(theta + Math.PI/2) * half_L;
      const wrY = gY - Math.sin(theta + Math.PI/2) * half_L;
      lines.push(`  Rueda L (X,Y)  : (${wlX.toFixed(4)}, ${wlY.toFixed(4)}) m`);
      lines.push(`  Rueda R (X,Y)  : (${wrX.toFixed(4)}, ${wrY.toFixed(4)}) m`);
      lines.push('');

      // ── sección 4: trayectoria ──
      lines.push('-- TRAYECTORIA (puntos X,Y) -----------------------');
      lines.push(`  Total de puntos: ${path.length}`);
      path.forEach((p, i) => {
        lines.push(`  [${String(i).padStart(4,'0')}]  X: ${p.x.toFixed(4)}   Y: ${p.y.toFixed(4)}`);
      });
      lines.push('');

      // ── sección 5: log completo ──
      lines.push('-- LOG GENERAL ------------------------------------');
      lines.push(`  Total entradas : ${logEntries.length}`);
      lines.push('');
      logEntries.forEach(e => {
        lines.push(`  [${e.time}]  ${e.type.toUpperCase().padEnd(5)}  ${e.msg}`);
      });
      lines.push('');
      lines.push('===================================================');
      lines.push('  FIN DEL LOG');
      lines.push('===================================================');

      // descargar
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const ts   = now.toISOString().replace(/[:.]/g,'-').slice(0,19);
      a.href     = url;
      a.download = `ticks-log-${ts}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }

    function writeLog() {
      // TICK — solo si hubo cambio
      if (totalTicksL !== prevLogTicksL) {
        addLog('tick', `L +${totalTicksL - prevLogTicksL}  →  ticksL: ${totalTicksL}   dist: ${(totalTicksL * CIRCUM).toFixed(3)} m`);
        prevLogTicksL = totalTicksL;
      }
      if (totalTicksR !== prevLogTicksR) {
        addLog('tick', `R +${totalTicksR - prevLogTicksR}  →  ticksR: ${totalTicksR}   dist: ${(totalTicksR * CIRCUM).toFixed(3)} m`);
        prevLogTicksR = totalTicksR;
      }

      // ODO — siempre
      const deg = (theta * 180 / Math.PI).toFixed(1);
      addLog('odo', `θ: ${deg}°   X: ${gX.toFixed(3)}   Y: ${gY.toFixed(3)}   total: ${totalDist.toFixed(3)} m`);

      // SPEED
      addLog('speed', `L: ${lastVL.toFixed(3)} m/s   R: ${lastVR.toFixed(3)} m/s`);

      // WARN — derrape si diff > 5
      const diff = Math.abs(totalTicksL - totalTicksR);
      if (diff > 5) addLog('warn', `diff ticks: ${totalTicksL - totalTicksR}  →  posible derrape o giro brusco`);
    }


    function updateChartColors() {
      const isDark = document.documentElement.classList.contains('dark');
      const grid   = isDark ? '#1e1e1e' : '#f0f0f0';
      const tick   = isDark ? '#555'    : '#bbb';
      for (const c of [speedChart, thetaChart, diffChart]) {
        c.options.scales.x.grid.color = grid;
        c.options.scales.y.grid.color = grid;
        c.options.scales.y.ticks.color = tick;
        c.update('none');
      }
    }
    // ── snapshot system ──
    const MAX_SNAPS = 1000;
    const snapshots = [];       // array of saved states
    let snapIdx     = -1;       // current position (-1 = live)
    let paused      = false;

    function saveSnapshot() {
      const snap = {
        ticksL:    totalTicksL,
        ticksR:    totalTicksR,
        theta,
        gX, gY,
        localX, localY,
        totalDist,
        path:      path.map(p => ({ x: p.x, y: p.y })),
        vL:        lastVL,
        vR:        lastVR,
        logEntries: logEntries.map(e => ({ ...e })),
        speedDataL: [...dataL],
        speedDataR: [...dataR],
        thetaData:  [...thetaChart.data.datasets[0].data],
        diffData:   [...diffChart.data.datasets[0].data],
      };
      // if we're not at the end, trim future snapshots
      if (snapIdx !== -1 && snapIdx < snapshots.length - 1) {
        snapshots.splice(snapIdx + 1);
      }
      snapshots.push(snap);
      if (snapshots.length > MAX_SNAPS) snapshots.shift();
      snapIdx = snapshots.length - 1;
      updateFrameLabel();
    }

    function restoreSnapshot(idx) {
      const s = snapshots[idx];
      if (!s) return;

      totalTicksL = s.ticksL;
      totalTicksR = s.ticksR;
      theta       = s.theta;
      gX = s.gX; gY = s.gY;
      localX = s.localX; localY = s.localY;
      totalDist   = s.totalDist;
      lastVL = s.vL; lastVR = s.vR;
      path.length = 0;
      s.path.forEach(p => path.push({ x: p.x, y: p.y }));

      // restore log
      logEntries.length = 0;
      s.logEntries.forEach(e => logEntries.push({ ...e }));

      // restore charts data
      dataL.length = 0; dataR.length = 0;
      s.speedDataL.forEach(v => dataL.push(v));
      s.speedDataR.forEach(v => dataR.push(v));
      speedChart.data.labels = dataL.map(() => '');
      speedChart.update('none');

      thetaChart.data.datasets[0].data = [...s.thetaData];
      thetaChart.data.labels = s.thetaData.map(() => '');
      thetaChart.update('none');

      diffChart.data.datasets[0].data = [...s.diffData];
      diffChart.data.labels = s.diffData.map(() => '');
      diffChart.update('none');

      // update DOM values
      document.getElementById('countL').textContent    = totalTicksL;
      document.getElementById('countR').textContent    = totalTicksR;
      document.getElementById('distRowL').textContent  = `d = ${(totalTicksL * CIRCUM).toFixed(3)} m`;
      document.getElementById('distRowR').textContent  = `d = ${(totalTicksR * CIRCUM).toFixed(3)} m`;
      document.getElementById('speedL').textContent    = s.vL.toFixed(3);
      document.getElementById('speedR').textContent    = s.vR.toFixed(3);
      document.getElementById('angleDeg').textContent  = (theta * 180 / Math.PI).toFixed(1) + '°';
      document.getElementById('posXY').textContent     = `X: ${gX.toFixed(3)} · Y: ${gY.toFixed(3)}`;
      document.getElementById('totalDist').textContent = totalDist.toFixed(3) + ' m';
      document.getElementById('gx').textContent  = gX.toFixed(3);
      document.getElementById('gy').textContent  = gY.toFixed(3);
      document.getElementById('lx').textContent  = localX.toFixed(3);
      document.getElementById('ly').textContent  = localY.toFixed(3);
      const half_L = L / 2;
      const wlX = gX + Math.cos(theta + Math.PI/2) * half_L;
      const wlY = gY + Math.sin(theta + Math.PI/2) * half_L;
      const wrX = gX - Math.cos(theta + Math.PI/2) * half_L;
      const wrY = gY - Math.sin(theta + Math.PI/2) * half_L;
      document.getElementById('wlx').textContent = wlX.toFixed(3);
      document.getElementById('wly').textContent = wlY.toFixed(3);
      document.getElementById('wrx').textContent = wrX.toFixed(3);
      document.getElementById('wry').textContent = wrY.toFixed(3);

      renderLog();
      drawTrajectory();
      updateFrameLabel();
    }

    function updateFrameLabel() {
      const lbl = document.getElementById('frameLabel');
      if (snapshots.length === 0) { lbl.textContent = ''; return; }
      const cur = snapIdx === -1 ? snapshots.length : snapIdx + 1;
      lbl.textContent = `${cur} / ${snapshots.length}`;
    }

    function setCtrlBtns(mode) {
      // mode: 'play' | 'pause' | 'stop'
      ['btnPlay','btnPause','btnStop'].forEach(id => document.getElementById(id).classList.remove('active'));
      document.getElementById('btn' + mode.charAt(0).toUpperCase() + mode.slice(1)).classList.add('active');
      const canStep = (mode === 'pause' || mode === 'stop') && snapshots.length > 0;
      document.getElementById('btnRew').disabled = !canStep;
      document.getElementById('btnFwd').disabled = !canStep;
    }

    function ctrlPlay() {
      // Si estamos en un frame retrocedido, eliminar snapshots futuros
      if (snapIdx !== -1 && snapIdx < snapshots.length - 1) {
        snapshots.splice(snapIdx + 1);
      }

      // Resincronizar contadores internos y servidores con el snapshot actual
      if (snapIdx !== -1 && snapshots[snapIdx]) {
        const s = snapshots[snapIdx];

        // decirle a los servidores que vuelvan a ese valor de ticks
        fetch('http://localhost:3000/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: s.ticksL })
        });
        fetch('http://localhost:3001/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: s.ticksR })
        });

        // resincronizar estado interno del frontend
        prevTicksL    = s.ticksL;
        prevTicksR    = s.ticksR;
        prevTimeL     = Date.now();
        prevTimeR     = Date.now();
        prevOdoL      = s.ticksL;
        prevOdoR      = s.ticksR;
        prevLogTicksL = s.ticksL;
        prevLogTicksR = s.ticksR;
      }

      paused  = false;
      snapIdx = -1;
      setCtrlBtns('play');
      updateFrameLabel();
    }

    function ctrlPause() {
      paused  = true;
      snapIdx = snapshots.length - 1;  // freeze at latest
      setCtrlBtns('pause');
      document.getElementById('btnRew').disabled = snapshots.length === 0;
      document.getElementById('btnFwd').disabled = true; // at the end, can't go forward yet
      updateFrameLabel();
    }

    function ctrlStop() {
      paused = true;
      snapIdx = snapshots.length - 1;
      setCtrlBtns('stop');
      resetOdo();
      clearLog();
      snapshots.length = 0;
      snapIdx = -1;
      document.getElementById('btnRew').disabled = true;
      document.getElementById('btnFwd').disabled = true;
      updateFrameLabel();
    }

    function ctrlStep(dir) {
      if (!paused || snapshots.length === 0) return;
      const next = snapIdx + dir;
      if (next < 0 || next >= snapshots.length) return;
      snapIdx = next;
      restoreSnapshot(snapIdx);
      document.getElementById('btnRew').disabled = snapIdx <= 0;
      document.getElementById('btnFwd').disabled = snapIdx >= snapshots.length - 1;
    }

    // ── fetch ──
    async function fetchSide(port, side) {
      const dot   = document.getElementById(`dot${side}`);
      const count = document.getElementById(`count${side}`);
      const dist  = document.getElementById(`distRow${side}`);
      const speed = document.getElementById(`speed${side}`);

      try {
        const res   = await fetch(`http://localhost:${port}/ticks`);
        const data  = await res.json();
        const ticks = side === 'L' ? data.ticksL : data.ticksR;

        const now      = Date.now();
        const prevT    = side === 'L' ? prevTimeL  : prevTimeR;
        const prevTick = side === 'L' ? prevTicksL : prevTicksR;
        const dt       = (now - prevT) / 1000;
        const delta    = ticks - prevTick;
        const v        = dt > 0 ? (delta * CIRCUM) / dt : 0;

        if (side === 'L') { prevTicksL = ticks; prevTimeL = now; lastVL = v; totalTicksL = ticks; }
        else              { prevTicksR = ticks; prevTimeR = now; lastVR = v; totalTicksR = ticks; }

        count.textContent = ticks;
        dist.textContent  = `d = ${(ticks * CIRCUM).toFixed(3)} m`;
        speed.textContent = v.toFixed(3);
        dot.className = 'status-dot dot-on';
        serversOnline = Math.min(serversOnline + 1, 2);

      } catch {
        dot.className = 'status-dot dot-off';
        serversOnline = Math.max(serversOnline - 1, 0);
      }
    }

    let serversOnline = 0;

    // ── loops ──
    setInterval(() => {
      if (paused) return;
      fetchSide(3000, 'L');
      fetchSide(3001, 'R');
    }, INTERVAL);

    setInterval(() => {
      speedLabels.push('');
      dataL.push(parseFloat(lastVL.toFixed(3)));
      dataR.push(parseFloat(lastVR.toFixed(3)));
      if (speedLabels.length > MAX_PTS) { speedLabels.shift(); dataL.shift(); dataR.shift(); }
      if (!paused) {
        speedChart.update('none');
        updateOdometry();
        pushMiniCharts();
        if (serversOnline > 0) writeLog();
        saveSnapshot();
        updateFrameLabel();
      }
    }, 200);

    // dibujo inicial
    drawTrajectory();