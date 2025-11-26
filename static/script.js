// ======================================================
//  CONFIG COMÚN
// ======================================================
const API_DATOS = '/api/datos';
const PAGE_SIZE = 12;

// Estado global (Para el panel de administrador)
let ALL_DATA = [];
let FILTERED = [];
let currentPage = 1;
let selectedCow = null; // Para mantener el estado del detalle/gráfica de la vaca seleccionada

let tempChartAdmin = null;
let heartChartAdmin = null;
let mapAdmin = null;
let mapMarker = null;

// ======================================================
//  UTILIDADES
// ======================================================
function parseDate(s) {
    if (!s) return null;
    let d = new Date(s);
    if (!isNaN(d)) return d;
    return new Date(s.replace(' ', 'T'));
}

function formatDate(s) {
    if (!s) return '--';
    const d = parseDate(s);
    if (!d) return '--';
    return d.toLocaleString('es-MX', { 
        year: 'numeric', month: 'short', day: '2-digit', 
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

function debounce(fn, wait){
    let t;
    return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn.apply(null,args), wait); };
}

// ======================================================
//  PANEL DE MONITOREO (INICIO)
// ======================================================

function agregarAlerta(texto) {
    const ul = document.getElementById('alert-list');
    const li = document.createElement('li');
    li.innerText = texto;
    ul.prepend(li); // Agrega la nueva alerta al principio
    // Limita la lista a 20 elementos para evitar sobrecarga
    while (ul.children.length > 20) {
        ul.removeChild(ul.lastChild);
    }
}

function determinarEstado(vaca) {
    const t = vaca.temp_objeto;
    const hr = vaca.ritmo_cardiaco;
    // Rangos de ejemplo, ajustar según la necesidad veterinaria
    if (t > 40.5 || hr > 90) return { estado: "¡Fiebre / Emergencia!", color: "red" };
    else if (t > 39.5) return { estado: "Posible Enfermedad", color: "red" };
    else if (t >= 38 && t <= 39 && hr >= 65 && hr <= 85) return { estado: "En celo", color: "orange" };
    else if (t >= 37 && t <= 37.5 && hr >= 55 && hr <= 65) return { estado: "Posible Embarazo", color: "purple" };
    else return { estado: "Saludable", color: "green" };
}

function interpretarMovimiento(gyroX, gyroY, gyroZ) {
    const absX = Math.abs(gyroX || 0);
    const absY = Math.abs(gyroY || 0);
    const absZ = Math.abs(gyroZ || 0);
    const threshold_quiet = 5;
    const threshold_active = 60;
    
    // Suma de las magnitudes para un umbral general de movimiento
    const totalMovement = absX + absY + absZ; 

    if (totalMovement < threshold_quiet * 3) {
        return "Echada 😴";  // Muy quieta
    } else if (totalMovement > threshold_active * 2) {
        return "Activa/Corriendo 🏃‍♀️";  // Mucho movimiento
    } else if (gyroY > 20 && absX < 30) {
        return "Comiendo 🐄"; // Inclinación controlada hacia abajo
    } else {
        return "Normal 🚶";
    }
}

// Inicialización de gráficos de Monitoreo
const ctxTemp = document.getElementById('tempChart').getContext('2d');
const ctxHeart = document.getElementById('heartChart').getContext('2d');

const tempChart = new Chart(ctxTemp, {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Temp. Objeto (°C)', data: [], borderWidth: 2, borderColor: '#ff6384', backgroundColor: 'rgba(255, 99, 132, 0.1)', tension: 0.3 }] },
    options: { 
        responsive: true, 
        maintainAspectRatio: false, // <-- AÑADIDO
        scales: { y: { beginAtZero: false } } 
    }
});
const heartChart = new Chart(ctxHeart, {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Ritmo Cardíaco (BPM)', data: [], borderWidth: 2, borderColor: '#36a2eb', backgroundColor: 'rgba(54, 162, 235, 0.1)', tension: 0.3 }] },
    options: { 
        responsive: true, 
        maintainAspectRatio: false, // <-- AÑADIDO
        scales: { y: { beginAtZero: false } } 
    }
});

function actualizarGraficas(dato) {
    const time = dato.fecha ? new Date(dato.fecha).toLocaleTimeString() : new Date().toLocaleTimeString();
    
    // Evita actualizar si el dato es nulo
    if (dato.temp_objeto === null || dato.ritmo_cardiaco === null) return;
    
    const maxDataPoints = 15;

    tempChart.data.labels.push(time);
    heartChart.data.labels.push(time);
    tempChart.data.datasets[0].data.push(dato.temp_objeto);
    heartChart.data.datasets[0].data.push(dato.ritmo_cardiaco);
    
    if (tempChart.data.labels.length > maxDataPoints) {
        tempChart.data.labels.shift();
        heartChart.data.labels.shift();
        tempChart.data.datasets[0].data.shift();
        heartChart.data.datasets[0].data.shift();
    }
    tempChart.update('quiet'); // 'quiet' para mejor rendimiento
    heartChart.update('quiet');
}

// Mapa de Monitoreo
let map = L.map('map').setView([19.4326, -99.1332], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
let marcadorVaca = null;

function actualizarMapa(lat, lon, idVaca) {
    // Validar coordenadas
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (isNaN(latNum) || isNaN(lonNum)) return;
    
    const pos = [latNum, lonNum];
    const popupText = `🐄 Vaca #${idVaca || 'Desconocida'} localizada`;

    if (!marcadorVaca) {
        marcadorVaca = L.marker(pos).addTo(map).bindPopup(popupText);
    } else {
        marcadorVaca.setLatLng(pos);
        marcadorVaca.setPopupContent(popupText);
    }
    
    // Mover el centro del mapa solo si el marcador está lejos o es la primera vez
    if (!map.getBounds().contains(pos)) {
        map.setView(pos, Math.max(map.getZoom(), 14));
    }
}

function actualizarIndicadores(datos) {
    if (!datos || datos.length === 0) {
        console.warn('No hay datos disponibles para el panel de monitoreo.');
        return;
    }
    const ultima = datos[0]; // último dato (asumiendo que viene ordenado)

    const estado = determinarEstado(ultima);
    const movimiento = interpretarMovimiento(ultima.gyro_x, ultima.gyro_y, ultima.gyro_z);

    // Actualizar datos
    document.getElementById('temp-ambiente').innerText = `${(ultima.temp_ambiente ?? '--')} °C`;
    document.getElementById('temp-objeto').innerText = `${(ultima.temp_objeto ?? '--')} °C`;
    document.getElementById('ritmo').innerText = `${ultima.ritmo_cardiaco ?? '--'} BPM`;
    document.getElementById('oxigeno').innerText = `${ultima.oxigeno ?? '--'} %`;
    
    const gyroText = ultima.gyro_x !== null ? `X:${(ultima.gyro_x ?? 0).toFixed(2)} Y:${(ultima.gyro_y ?? 0).toFixed(2)} Z:${(ultima.gyro_z ?? 0).toFixed(2)}` : '-- / -- / --';
    document.getElementById('gyro').innerText = gyroText;
    
    document.getElementById('sat').innerText = ultima.satelites ?? '--';
    
    // Estado y movimiento
    const estadoEl = document.getElementById('estado-text');
    estadoEl.innerText = estado.estado;
    estadoEl.style.color = estado.color;
    document.getElementById('movement-value').innerText = movimiento;

    // Alerta
    if (estado.color === "red") {
        agregarAlerta(`⚠️ ¡Vaca #${ultima.id_vaca || 'Desconocida'} - ${estado.estado}! Temp: ${ultima.temp_objeto}°C, Ritmo: ${ultima.ritmo_cardiaco} BPM`);
    }

    // Mapa y Gráficas
    if (ultima.latitud && ultima.longitud) actualizarMapa(ultima.latitud, ultima.longitud, ultima.id_vaca);
    actualizarGraficas(ultima);
}

// Función principal para cargar datos del monitoreo
async function cargarDatosMonitoreo() {
    try {
        const res = await fetch(API_DATOS);
        const datos = await res.json();
        // Solo necesitamos los últimos para el panel de inicio
        actualizarIndicadores(datos); 
    } catch (err) {
        console.error("Error al cargar datos de monitoreo:", err);
    }
}

// ======================================================
//  FETCH DATA GLOBAL (Para Administrador)
// ======================================================
async function fetchData() {
    try {
        const res = await fetch(API_DATOS);
        if (!res.ok) throw new Error('Fallo al leer /api/datos');
        const json = await res.json();

        ALL_DATA = json.map(r => ({
            ...r,
            fecha_obj: r.fecha ? parseDate(r.fecha) : null,
            temp_ambiente: r.temp_ambiente === null ? null : parseFloat(r.temp_ambiente),
            temp_objeto: r.temp_objeto === null ? null : parseFloat(r.temp_objeto),
            ritmo_cardiaco: r.ritmo_cardiaco === null ? null : parseFloat(r.ritmo_cardiaco),
            oxigeno: r.oxigeno === null ? null : parseFloat(r.oxigeno),
            latitud: r.latitud === null ? null : parseFloat(r.latitud),
            longitud: r.longitud === null ? null : parseFloat(r.longitud),
        }));

        ALL_DATA.sort((a,b) => {
            const da = a.fecha_obj ? a.fecha_obj.getTime() : 0;
            const db = b.fecha_obj ? b.fecha_obj.getTime() : 0;
            return db - da; // Orden descendente por fecha
        });
        
        return true;
    } catch (e) {
        console.error('fetchData error', e);
        return false;
    }
}

// ======================================================
//  ADMIN PANEL - LÓGICA
// ======================================================
function renderMeta() {
    document.getElementById('admin-count-registros').innerText = ALL_DATA.length;

    const vacas = new Set(ALL_DATA.map(d => d.id_vaca).filter(v => v !== null && v !== undefined));
    document.getElementById('admin-count-vacas').innerText = vacas.size;

    document.getElementById('admin-latest').innerText = ALL_DATA[0]?.fecha ? formatDate(ALL_DATA[0].fecha) : '--';

    const alertas = ALL_DATA.filter(d => d.temp_objeto && d.temp_objeto > 40.5).length;
    document.getElementById('admin-alertas').innerText = alertas;

    // llenar select
    const sel = document.getElementById('filter-vaca');
    const selected = sel.value;
    sel.innerHTML = '<option value="">(todas)</option>';
    Array.from(vacas).sort().forEach(v => {
        const opt = document.createElement('option');
        opt.value = v; 
        opt.innerText = v;
        sel.appendChild(opt);
    });
    if (selected) sel.value = selected;
}

function applyFilters() {
    const fromVal = document.getElementById('filter-from').value;
    const toVal = document.getElementById('filter-to').value;
    const vacaVal = document.getElementById('filter-vaca').value.trim();
    const text = document.getElementById('filter-text').value.trim().toLowerCase();

    const from = fromVal ? new Date(fromVal) : null;
    const to = toVal ? new Date(toVal) : null;

    FILTERED = ALL_DATA.filter(d => {
        if (from && d.fecha_obj && d.fecha_obj < from) return false;
        if (to && d.fecha_obj && d.fecha_obj > to) return false;
        if (vacaVal && d.id_vaca !== vacaVal) return false;
        if (text) {
            const hay = `${d.id_vaca} ${d.temp_ambiente} ${d.temp_objeto} ${d.ritmo_cardiaco} ${d.fecha}`;
            if (!hay.toLowerCase().includes(text)) return false;
        }
        return true;
    });

    currentPage = 1;
    renderTable();
    renderPagination();
    
    // Si se aplica un filtro de vaca, actualiza los gráficos automáticamente
    if (vacaVal) {
        onSelectCow(vacaVal);
    } else {
        selectedCow = null;
        drawAdminCharts([]);
        document.getElementById('detalle-vaca').innerHTML = 'Selecciona una fila para ver detalles.';
        if (mapMarker) { mapAdmin.removeLayer(mapMarker); mapMarker = null; }
    }
}

// Tabla y Paginación
function renderTable() {
    const tbody = document.querySelector('#admin-table tbody');
    tbody.innerHTML = '';

    const start = (currentPage-1) * PAGE_SIZE;
    const pageData = FILTERED.slice(start, start + PAGE_SIZE);
    
    document.getElementById('current-page-display').innerText = currentPage;

    pageData.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${r.id ?? ''}</td>
            <td>${r.id_vaca ?? ''}</td>
            <td>${r.temp_ambiente !== null ? r.temp_ambiente.toFixed(2) : ''}</td>
            <td>${r.temp_objeto !== null ? r.temp_objeto.toFixed(2) : ''}</td>
            <td>${r.ritmo_cardiaco ?? ''}</td>
            <td>${r.oxigeno ?? ''}</td>
            <td>${r.latitud !== null ? r.latitud.toFixed(4) : ''}</td>
            <td>${r.longitud !== null ? r.longitud.toFixed(4) : ''}</td>
            <td>${formatDate(r.fecha) ?? ''}</td>
        `;
        tr.addEventListener('click', () => onSelectRow(r));
        tbody.appendChild(tr);
    });
}

function renderPagination() {
    const total = FILTERED.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const container = document.getElementById('admin-pagination');

    container.innerHTML = '';
    
    // Mostrar botones de paginación de forma inteligente (máx 5 botones)
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(pages, currentPage + 2);
    
    if (currentPage > 1) {
        const btnPrev = createPageButton(currentPage - 1, '«');
        container.appendChild(btnPrev);
    }

    for (let p=startPage;p<=endPage;p++){
        const btn = createPageButton(p, p);
        if (p === currentPage) btn.classList.add('active');
        container.appendChild(btn);
    }
    
    if (currentPage < pages) {
        const btnNext = createPageButton(currentPage + 1, '»');
        container.appendChild(btnNext);
    }
}

function createPageButton(pageNumber, text) {
    const btn = document.createElement('button');
    btn.className = 'page-btn';
    btn.innerText = text;
    btn.addEventListener('click', ()=>{ 
        currentPage = pageNumber; 
        renderTable(); 
        renderPagination(); 
    });
    return btn;
}

// Detalle / Gráficas / Mapa
function onSelectRow(row) {
    // 1. Marcar la fila seleccionada
    document.querySelectorAll('#admin-table tbody tr').forEach(tr => tr.classList.remove('selected-row'));
    const selectedTr = document.querySelector(`#admin-table tbody tr:nth-child(${FILTERED.indexOf(row) - (currentPage-1)*PAGE_SIZE + 1})`);
    if(selectedTr) selectedTr.classList.add('selected-row');

    // 2. Mostrar detalle del registro
    const box = document.getElementById('detalle-vaca');
    box.innerHTML = `
        <p><b>ID Registro:</b> ${row.id} <br/>
        <b>Vaca:</b> ${row.id_vaca} <br/>
        <b>Temp Obj:</b> ${row.temp_objeto !== null ? row.temp_objeto.toFixed(2) : '--'} °C<br/>
        <b>Temp Amb:</b> ${row.temp_ambiente !== null ? row.temp_ambiente.toFixed(2) : '--'} °C<br/>
        <b>Ritmo:</b> ${row.ritmo_cardiaco ?? '--'} BPM<br/>
        <b>Oxígeno:</b> ${row.oxigeno ?? '--'} %<br/>
        <b>Fecha:</b> ${formatDate(row.fecha) ?? '--'} <br/>
        <b>Lat/Lng:</b> ${row.latitud !== null ? row.latitud.toFixed(4) : '--'} / ${row.longitud !== null ? row.longitud.toFixed(4) : '--'}
        </p>
    `;

    // 3. Actualizar Gráficos (solo si se selecciona una vaca diferente o es la primera vez)
    if (selectedCow !== row.id_vaca) {
        onSelectCow(row.id_vaca);
    }
    
    // 4. Actualizar Mapa
    if (row.latitud && row.longitud) {
        setMapMarker(row.latitud, row.longitud, `Vaca ${row.id_vaca} (${formatDate(row.fecha)})`);
    } else {
        if (mapMarker) { mapAdmin.removeLayer(mapMarker); mapMarker = null; }
    }
}

function onSelectCow(vacaId) {
    selectedCow = vacaId;
    const datosVaca = ALL_DATA
        .filter(d => d.id_vaca === vacaId)
        .slice(0, 200) // Limitar a los 200 registros más recientes
        .reverse(); // Ordenar del más antiguo al más reciente para la gráfica
    
    drawAdminCharts(datosVaca, vacaId);
}


// Gráficos Admin
function drawAdminCharts(dataForCow, vacaId) {
    const labels = dataForCow.map(d => formatDate(d.fecha));
    const temps = dataForCow.map(d => d.temp_objeto);
    const hearts = dataForCow.map(d => d.ritmo_cardiaco);
    const title = vacaId ? `Histórico Vaca #${vacaId}` : 'Gráfica (selecciona vaca)';

    // Temp Chart
    if (tempChartAdmin) tempChartAdmin.destroy();
    tempChartAdmin = new Chart(document.getElementById('adminTempChart').getContext('2d'), {
        type: 'line',
        data: { labels, datasets: [{ label: 'Temp objeto (°C)', data: temps, fill: false, borderColor: '#ff6384', tension: 0.3 }] },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { title: { display: true, text: title } } 
        }
    });

    // Heart Chart (corregido)
    if (heartChartAdmin) heartChartAdmin.destroy();
    heartChartAdmin = new Chart(document.getElementById('adminHeartChart').getContext('2d'), {
        type: 'line',
        data: { 
            labels, 
            datasets: [{
                label: 'Ritmo (BPM)',
                data: hearts,
                fill: false,
                borderColor: '#36a2eb',
                tension: 0.3
            }] 
        },
        options: { 
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                title: { display: true, text: title }
            },
            scales: {
                y: { beginAtZero: false }
            }
        }
    });
}


// Mapa Admin
function initAdminMap() {
    if (mapAdmin) return; // Evitar reinicializar
    
    mapAdmin = L.map('map-admin', { center: [20.9,-89.6], zoom: 8, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap'
    }).addTo(mapAdmin);
}

function setMapMarker(lat, lng, label) {
    if (!mapAdmin) initAdminMap();
    
    // Validar coordenadas
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lonNum)) return;
    
    if (mapMarker) mapAdmin.removeLayer(mapMarker);

    mapMarker = L.marker([latNum, lonNum]).addTo(mapAdmin).bindPopup(label).openPopup();
    mapAdmin.setView([latNum, lonNum], 13);
}

// Export CSV
function exportToCSV() {
    // ... (La función exportToCSV se mantiene igual) ...
    const data = FILTERED.length ? FILTERED : ALL_DATA;
    if (!data.length) { alert('No hay datos para exportar'); return; }

    const headers = [
        'id','id_vaca','temp_ambiente','temp_objeto','ritmo_cardiaco',
        'oxigeno','gyro_x','gyro_y','gyro_z','latitud','longitud','satelites','fecha'
    ];

    const rows = data.map(r => 
        headers.map(h => `"${String(r[h] ?? '').replace(/"/g,'""')}"`).join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `farmwatch_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    a.click();

    URL.revokeObjectURL(url);
}

// ======================================================
//  EVENTOS Y NAVEGACIÓN SPA
// ======================================================
function populateEventHandlers() {
    // Solo asignar manejadores una vez
    if (!document.getElementById('btn-refresh').hasListener) {
        document.getElementById('btn-refresh').addEventListener('click', async ()=>{
            await fetchData();
            renderMeta();
            applyFilters();
        });
        document.getElementById('btn-refresh').hasListener = true;

        document.getElementById('btn-export').addEventListener('click', exportToCSV);

        document.getElementById('btn-clear').addEventListener('click', ()=>{
            document.getElementById('filter-from').value = '';
            document.getElementById('filter-to').value = '';
            document.getElementById('filter-vaca').value = '';
            document.getElementById('filter-text').value = '';
            FILTERED = ALL_DATA.slice();
            currentPage = 1;
            renderTable(); 
            renderPagination();
            // Limpiar también los detalles al limpiar filtros
            selectedCow = null;
            drawAdminCharts([]);
            document.getElementById('detalle-vaca').innerHTML = 'Selecciona una fila para ver detalles.';
            if (mapMarker) { mapAdmin.removeLayer(mapMarker); mapMarker = null; }
        });
        
        // Asignar listeners de filtros
        document.getElementById('filter-vaca').addEventListener('change', applyFilters);
        document.getElementById('filter-from').addEventListener('change', applyFilters);
        document.getElementById('filter-to').addEventListener('change', applyFilters);
        document.getElementById('filter-text').addEventListener('input', debounce(applyFilters, 400));
    }
}



// SPA
function showSection(id) {
    document.querySelectorAll('.section').forEach(s=> s.classList.add('hidden'));
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
       if (id === 'admin-panel') {
        setTimeout(() => {
            if (mapAdmin) mapAdmin.invalidateSize();
        }, 300);
    }

    document.querySelectorAll('.sidebar nav a').forEach(a=> a.classList.remove('active'));
    document.querySelector(`.sidebar nav a[href="#${id}"]`)?.classList.add('active');
    
    // Ocultar sidebar en móvil al cambiar de sección
    if (window.innerWidth <= 900) {
        document.getElementById('sidebar').classList.remove('active');
    }
}

document.querySelectorAll('.sidebar nav a').forEach(a=>{
    a.addEventListener('click', (e)=>{
        const href = a.getAttribute('href');
        if (href && href.startsWith('#')) {
            e.preventDefault();
            const id = href.substring(1);
            showSection(id);

            // Carga/Inicialización específica para el panel admin
            if (id === 'admin-panel') initAdmin();
            
            window.scrollTo({ top:0, behavior:'smooth' });
        }
    });
});

// ======================================================
//  INIT GLOBAL
// ======================================================

// Inicialización del panel de monitoreo y carga inicial de datos.
cargarDatosMonitoreo();
setInterval(cargarDatosMonitoreo, 5000); // Refresco constante

// Inicialización del Administrador
async function initAdmin() {
    initAdminMap();
    
    // CORRECCIÓN C: Forzar redimensionamiento del mapa al entrar en la sección
    if (mapAdmin) {
        mapAdmin.invalidateSize();
    }
    
    populateEventHandlers();
    
    // Solo cargar datos si no se han cargado (o al refrescar)
    if (ALL_DATA.length === 0) {
        const ok = await fetchData();
        if (!ok) console.warn('No se cargaron datos');
    }
    
    renderMeta();
    FILTERED = ALL_DATA.slice();
    currentPage = 1;

    renderTable();
    renderPagination();
    
    // Inicializar gráficos admin con datos vacíos al entrar
    drawAdminCharts([]);
}

// Refresco de meta data en segundo plano
setInterval(async ()=>{
    await fetchData();
    if (document.getElementById('admin-panel').classList.contains('hidden')) {
        renderMeta(); // Renderizar solo si no está visible para no alterar la tabla
    }
}, 30000);

// Mostrar la sección por defecto al cargar
document.addEventListener('DOMContentLoaded', () => {
    showSection('inicio');
});



/// ======================================================
// === LÓGICA DE NAVEGACIÓN Y RESPONSIVIDAD MÓVIL ===
// ======================================================

// 1. Crear el Overlay y agregarlo al body (CRUCIAL)
const overlay = document.createElement('div');
overlay.className = 'overlay';
document.body.appendChild(overlay);

// 2. Función Única de Toggle (Abrir/Cerrar)
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    
    // Alterna la clase 'active' para mover el menú y mostrar el overlay
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
    
    // Opcional: Deshabilita el scroll del fondo cuando el menú está abierto
    document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : 'auto';
}

// 3. Función para cambiar de sección (SPA) - VERSIÓN CORREGIDA
function showSection(id) {
    // 3.1. Ocultar todas las secciones y mostrar la correcta
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
       if (id === 'admin-panel') {
        setTimeout(() => {
            if (mapAdmin) mapAdmin.invalidateSize();
        }, 300);
    }

    // 3.2. Actualizar el estado activo del menú
    document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
    document.querySelector(`.sidebar nav a[href="#${id}"]`)?.classList.add('active');
    
    // 3.3. **SOLUCIÓN AL PROBLEMA DE CIERRE:** Cerrar el menú después de seleccionar una opción en móvil
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 900 && sidebar.classList.contains('active')) {
        toggleSidebar(); 
    }
}

// 4. Asignar Event Listeners - VERSIÓN CORREGIDA
document.addEventListener('DOMContentLoaded', () => {
    // A. Clic en el botón hamburguesa
    const menuToggle = document.getElementById('menu-toggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', toggleSidebar);
    }
    
    // B. Clic en el overlay (el área oscura) para cerrar el menú
    overlay.addEventListener('click', toggleSidebar);

    // C. Asignar la función showSection a los enlaces de navegación
    document.querySelectorAll('.sidebar nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault(); 
            const targetId = e.currentTarget.getAttribute('href').substring(1);
            showSection(targetId);
            
            // Lógica para el panel admin (de tu código original)
            if (targetId === 'admin-panel') initAdmin();
            window.scrollTo({ top:0, behavior:'smooth' });
        });
    });
    
    // Iniciar con la sección 'inicio'
    showSection('inicio');
});


// ... (Resto del código init global) ...
