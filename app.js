const API_URL = 'http://localhost:3000';
let graficaPrincipal;
let tipoGraficaActual = 'mes';

// ============ ACTUALIZAR STATS CARDS ============
async function actualizarStatsCards() {
    try {
        const response = await fetch(`${API_URL}/api/dashboard/resumen`);
        const data = await response.json();
        
        document.getElementById('statGanancias').innerHTML = `$${parseFloat(data.ganancias_totales).toFixed(2)}`;
        document.getElementById('statVentas').innerHTML = data.total_ventas;
        document.getElementById('statStock').innerHTML = `$${parseFloat(data.stock_valor).toFixed(2)}`;
        document.getElementById('statPromedio').innerHTML = `$${parseFloat(data.ganancia_promedio).toFixed(2)}`;
    } catch (error) {
        console.error('Error actualizando stats:', error);
    }
}

// ============ CARGAR GRÁFICA (MES/AÑO) ============
async function cargarGrafica() {
    try {
        let url;
        if (tipoGraficaActual === 'mes') {
            url = `${API_URL}/api/grafica/ganancias-mensuales`;
        } else {
            url = `${API_URL}/api/grafica/ganancias-anuales`;
        }
        
        const response = await fetch(url);
        const datos = await response.json();
        const ctx = document.getElementById('graficaPrincipal').getContext('2d');
        
        if (graficaPrincipal) graficaPrincipal.destroy();
        
        const gradiente = ctx.createLinearGradient(0, 0, 0, 400);
        gradiente.addColorStop(0, 'rgba(99, 102, 241, 0.8)');
        gradiente.addColorStop(1, 'rgba(16, 185, 129, 0.3)');
        
        graficaPrincipal = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: datos.map(d => tipoGraficaActual === 'mes' ? d.mes : d.ano),
                datasets: [{
                    label: tipoGraficaActual === 'mes' ? '💰 Ganancias por mes' : '💰 Ganancias por año',
                    data: datos.map(d => d.total_ganancia),
                    backgroundColor: gradiente,
                    borderColor: '#6366f1',
                    borderWidth: 2,
                    borderRadius: 12,
                    barPercentage: 0.65,
                    categoryPercentage: 0.8,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { font: { size: 12, weight: '500' }, usePointStyle: true, boxWidth: 8 }
                    },
                    tooltip: {
                        callbacks: { label: (ctx) => `$${ctx.raw.toFixed(2)}` },
                        backgroundColor: '#1e293b',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        padding: 12,
                        cornerRadius: 8
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: (v) => '$' + v.toFixed(0), stepSize: 1 },
                        grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
                        title: { display: true, text: 'Ganancias ($)', font: { weight: '500' } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 11 } }
                    }
                },
                animation: { duration: 1000, easing: 'easeOutQuart' }
            }
        });
    } catch (error) {
        console.error('Error cargando gráfica:', error);
    }
}

function cambiarTipoGrafica(tipo) {
    tipoGraficaActual = tipo;
    document.querySelectorAll('.chart-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    cargarGrafica();
}

// ============ PREVISUALIZAR MÚLTIPLES IMÁGENES ============
function previewMultiplesImagenes() {
    const input = document.getElementById('imagenesCompra');
    const previewContainer = document.getElementById('previewContainer');
    previewContainer.innerHTML = '';
    
    if (input.files) {
        for (let i = 0; i < input.files.length; i++) {
            const file = input.files[i];
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.className = 'preview-img';
                previewContainer.appendChild(img);
            };
            reader.readAsDataURL(file);
        }
    }
}

// ============ CARGAR PRODUCTOS PARA SELECTOR ============
async function cargarProductosSelector() {
    try {
        const response = await fetch(`${API_URL}/api/inventario/productos`);
        const productos = await response.json();
        const select = document.getElementById('productoVenta');
        select.innerHTML = '<option value="">Seleccionar producto...</option>';
        productos.forEach(p => {
            const option = document.createElement('option');
            option.value = p.producto;
            option.setAttribute('data-costo', p.ultimo_costo);
            option.setAttribute('data-stock', p.stock);
            option.textContent = `${p.producto} (Stock: ${p.stock} - Costo: $${p.ultimo_costo})`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error cargando productos:', error);
    }
}

function actualizarCostoVenta() {
    const select = document.getElementById('productoVenta');
    const selectedOption = select.options[select.selectedIndex];
    const costo = selectedOption.getAttribute('data-costo');
    if (costo) {
        document.getElementById('costoOriginal').value = costo;
    } else {
        document.getElementById('costoOriginal').value = '';
    }
}

// ============ CARGAR INVENTARIO ============
async function cargarInventario() {
    try {
        const response = await fetch(`${API_URL}/api/inventario`);
        const inventario = await response.json();
        const container = document.getElementById('listaInventario');
        
        if (inventario.length === 0) {
            container.innerHTML = '<div class="item-card"><div class="item-title">No hay productos en inventario</div></div>';
        } else {
            container.innerHTML = inventario.map(p => `
                <div class="item-card">
                    <div class="item-header">
                        <div class="item-title"><i class="fas fa-box"></i> ${p.producto}</div>
                        <div class="item-badge">Stock: ${p.stock} unidades</div>
                    </div>
                    <div class="item-details">
                        <span><i class="fas fa-dollar-sign"></i> Último costo: $${parseFloat(p.ultimo_costo).toFixed(2)}</span>
                        <span><i class="fas fa-chart-line"></i> Valor total: $${(p.stock * p.ultimo_costo).toFixed(2)}</span>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error cargando inventario:', error);
    }
}

// ============ GUARDAR COMPRA ============
document.getElementById('formCompra')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('fecha', document.getElementById('fechaCompra').value);
    formData.append('producto', document.getElementById('productoCompra').value);
    formData.append('cantidad', document.getElementById('cantidadCompra').value);
    formData.append('precio_unidad', document.getElementById('precioUnidad').value);
    formData.append('envio', document.getElementById('envioCompra').value || '0');
    formData.append('precio_estimado_venta', document.getElementById('precioEstimado').value || '0');
    
    const imagenesInput = document.getElementById('imagenesCompra');
    for (let i = 0; i < imagenesInput.files.length; i++) {
        formData.append('imagenes', imagenesInput.files[i]);
    }
    
    const cantidad = parseFloat(document.getElementById('cantidadCompra').value);
    const precioUnidad = parseFloat(document.getElementById('precioUnidad').value);
    const envio = parseFloat(document.getElementById('envioCompra').value) || 0;
    const totalCompra = cantidad * precioUnidad;
    const costoTotal = totalCompra + envio;
    
    if (confirm(`📦 Confirmar compra:\n\nProducto: ${document.getElementById('productoCompra').value}\nCantidad: ${cantidad}\nTotal: $${totalCompra.toFixed(2)}\nEnvío: $${envio.toFixed(2)}\nCosto total: $${costoTotal.toFixed(2)}\nImágenes: ${imagenesInput.files.length}\n\n¿Guardar?`)) {
        try {
            const response = await fetch(`${API_URL}/api/compras`, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            if (response.ok) {
                alert(`✅ Compra registrada con ${imagenesInput.files.length} imágenes`);
                e.target.reset();
                document.getElementById('previewContainer').innerHTML = '';
                cargarInventario();
                cargarProductosSelector();
                cargarHistorial();
                actualizarStatsCards();
                cargarGrafica();
                cargarDashboard();
            } else {
                alert('❌ Error: ' + (result.error || 'Error desconocido'));
            }
        } catch (error) {
            alert('❌ Error de conexión');
        }
    }
});

// ============ GUARDAR VENTA ============
document.getElementById('formVenta')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {
        fecha: document.getElementById('fechaVenta').value,
        producto: document.getElementById('productoVenta').value,
        precio_venta: parseFloat(document.getElementById('precioVenta').value),
        envio_venta: parseFloat(document.getElementById('envioVenta').value) || 0,
        comisiones: parseFloat(document.getElementById('comisiones').value) || 0,
        costo_original: parseFloat(document.getElementById('costoOriginal').value)
    };
    
    if (!data.producto) {
        alert('❌ Selecciona un producto');
        return;
    }
    
    const totalRecibido = data.precio_venta - data.envio_venta - data.comisiones;
    const ganancia = totalRecibido - data.costo_original;
    
    if (confirm(`💰 Confirmar venta:\n\nProducto: ${data.producto}\nPrecio venta: $${data.precio_venta.toFixed(2)}\nEnvío: $${data.envio_venta.toFixed(2)}\nComisiones: $${data.comisiones.toFixed(2)}\nTotal recibido: $${totalRecibido.toFixed(2)}\nCosto original: $${data.costo_original.toFixed(2)}\nGanancia: $${ganancia.toFixed(2)}\n\n¿Guardar?`)) {
        try {
            const response = await fetch(`${API_URL}/api/ventas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (response.ok) {
                alert('💰 Venta registrada');
                e.target.reset();
                cargarGrafica();
                cargarInventario();
                cargarProductosSelector();
                cargarHistorial();
                actualizarStatsCards();
                cargarDashboard();
            } else {
                alert('❌ ' + (result.error || 'Error'));
            }
        } catch (error) {
            alert('❌ Error de conexión');
        }
    }
});

// ============ CARGAR HISTORIAL ============
async function cargarHistorial() {
    try {
        const comprasRes = await fetch(`${API_URL}/api/compras`);
        const compras = await comprasRes.json();
        const listaCompras = document.getElementById('listaCompras');
        
        if (compras.length === 0) {
            listaCompras.innerHTML = '<div class="item-card">No hay compras registradas</div>';
        } else {
            listaCompras.innerHTML = compras.slice(0, 15).map(c => `
                <div class="item-card">
                    <div class="item-header">
                        <div class="item-title"><i class="fas fa-box"></i> ${c.producto}</div>
                        <div class="item-badge">${c.fecha}</div>
                    </div>
                    <div class="item-details">
                        <span><i class="fas fa-hashtag"></i> ${c.cantidad} unidades</span>
                        <span><i class="fas fa-dollar-sign"></i> $${parseFloat(c.costo_total).toFixed(2)}</span>
                    </div>
                    ${c.imagenes_lista && c.imagenes_lista.length > 0 ? `
                        <div class="imagenes-mini">
                            ${c.imagenes_lista.slice(0, 4).map(img => `<img src="${API_URL}${img}" class="card-imagen" onclick="window.open('${API_URL}${img}', '_blank')">`).join('')}
                            ${c.imagenes_lista.length > 4 ? `<div class="card-imagen" style="display:flex;align-items:center;justify-content:center;">+${c.imagenes_lista.length-4}</div>` : ''}
                        </div>
                    ` : '<div class="item-badge" style="margin-top:8px;">Sin imágenes</div>'}
                </div>
            `).join('');
        }
        
        const ventasRes = await fetch(`${API_URL}/api/ventas`);
        const ventas = await ventasRes.json();
        const listaVentas = document.getElementById('listaVentas');
        
        if (ventas.length === 0) {
            listaVentas.innerHTML = '<div class="item-card">No hay ventas registradas</div>';
        } else {
            listaVentas.innerHTML = ventas.slice(0, 15).map(v => `
                <div class="item-card">
                    <div class="item-header">
                        <div class="item-title"><i class="fas fa-tag"></i> ${v.producto}</div>
                        <div class="item-badge">${v.fecha}</div>
                    </div>
                    <div class="item-details">
                        <span><i class="fas fa-dollar-sign"></i> Venta: $${parseFloat(v.precio_venta).toFixed(2)}</span>
                        <span><i class="fas fa-chart-line" style="color:#10b981;"></i> Ganancia: $${parseFloat(v.ganancia).toFixed(2)}</span>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// ============ CARGAR DASHBOARD ============
async function cargarDashboard() {
    try {
        const response = await fetch(`${API_URL}/api/dashboard/resumen`);
        const data = await response.json();
        
        const formatMoney = (value) => `$${parseFloat(value).toFixed(2)}`;
        
        const container = document.getElementById('dashboardResumen');
        container.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px;">
                <div class="stat-card" style="background: linear-gradient(135deg, #6366f1, #4f46e5); color: white;">
                    <div class="stat-icon"><i class="fas fa-chart-line"></i></div>
                    <div class="stat-value" style="color: white;">${formatMoney(data.ganancias_totales)}</div>
                    <div class="stat-label" style="color: rgba(255,255,255,0.8);">Ganancias totales</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-shopping-cart"></i></div>
                    <div class="stat-value">${data.total_ventas}</div>
                    <div class="stat-label">Ventas realizadas</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-boxes"></i></div>
                    <div class="stat-value">${formatMoney(data.stock_valor)}</div>
                    <div class="stat-label">Valor en stock</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-chart-simple"></i></div>
                    <div class="stat-value">${formatMoney(data.ganancia_promedio)}</div>
                    <div class="stat-label">Ganancia x venta</div>
                </div>
            </div>
            
            <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border);">
                <h3 style="margin-bottom: 16px;"><i class="fas fa-trophy"></i> Top 5 productos más rentables</h3>
                ${data.top_productos.length === 0 ? '<div class="loading">Sin datos</div>' : 
                    data.top_productos.map(p => `
                        <div class="item-card" style="margin-bottom: 8px;">
                            <div class="item-header">
                                <div class="item-title">${p.producto}</div>
                                <div class="item-badge">${p.veces_vendido} ventas</div>
                            </div>
                            <div class="item-details">
                                <span><i class="fas fa-chart-line" style="color:#10b981;"></i> Ganancia total: ${formatMoney(p.ganancia_total)}</span>
                            </div>
                        </div>
                    `).join('')
                }
            </div>
        `;
    } catch (error) {
        console.error('Error cargando dashboard:', error);
        document.getElementById('dashboardResumen').innerHTML = '<div class="loading">Error al cargar dashboard</div>';
    }
}

// ============ MODO OSCURO ============
function toggleDarkMode() {
    const body = document.body;
    const btn = document.getElementById('darkModeBtn');
    
    if (body.classList.contains('dark')) {
        body.classList.remove('dark');
        localStorage.setItem('darkMode', 'false');
        btn.innerHTML = '<i class="fas fa-moon"></i>';
    } else {
        body.classList.add('dark');
        localStorage.setItem('darkMode', 'true');
        btn.innerHTML = '<i class="fas fa-sun"></i>';
    }
    cargarGrafica();
}

function cargarDarkMode() {
    const darkMode = localStorage.getItem('darkMode');
    const btn = document.getElementById('darkModeBtn');
    if (darkMode === 'true') {
        document.body.classList.add('dark');
        btn.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        btn.innerHTML = '<i class="fas fa-moon"></i>';
    }
}

// ============ TABS ============
function mostrarTab(tab) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    if (tab === 'inventario') cargarInventario();
    if (tab === 'historial') cargarHistorial();
    if (tab === 'ventas') cargarProductosSelector();
    if (tab === 'dashboard') cargarDashboard();
}

// ============ INICIAR ============
cargarDarkMode();
cargarGrafica();
cargarInventario();
cargarProductosSelector();
cargarHistorial();
actualizarStatsCards();
cargarDashboard();