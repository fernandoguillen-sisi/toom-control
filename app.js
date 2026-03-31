const API_URL = 'https://toom-control.onrender.com';
let graficaPrincipal;
let tipoGraficaActual = 'mes';
let filtroInventarioActual = 'todos';
let inventarioCompleto = []; // Guardar todos los productos
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

// ============ CARGAR PRODUCTOS PARA SELECTOR (SOLO CON STOCK) ============
async function cargarProductosSelector() {
    try {
        const response = await fetch(`${API_URL}/api/inventario/productos`);
        const productos = await response.json();
        const select = document.getElementById('productoVenta');
        
        if (productos.length === 0) {
            select.innerHTML = '<option value="">No hay productos con stock disponible</option>';
            select.disabled = true;
            document.getElementById('costoOriginal').value = '';
        } else {
            select.disabled = false;
            select.innerHTML = '<option value="">Seleccionar producto...</option>';
            productos.forEach(p => {
                const option = document.createElement('option');
                option.value = p.producto;
                option.setAttribute('data-costo', p.ultimo_costo);
                option.setAttribute('data-stock', p.stock);
                option.textContent = `${p.producto} (Stock: ${p.stock} - Costo: $${p.ultimo_costo})`;
                select.appendChild(option);
            });
        }
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

// ============ CARGAR INVENTARIO CON FILTRO ============
async function cargarInventario() {
    try {
        const response = await fetch(`${API_URL}/api/inventario`);
        inventarioCompleto = await response.json();
        aplicarFiltroInventario();
    } catch (error) {
        console.error('Error cargando inventario:', error);
        document.getElementById('listaInventario').innerHTML = '<div class="loading">Error al cargar inventario</div>';
    }
}

function aplicarFiltroInventario() {
    let productosFiltrados = [...inventarioCompleto];
    
    if (filtroInventarioActual === 'con-stock') {
        productosFiltrados = productosFiltrados.filter(p => p.stock > 0);
    } else if (filtroInventarioActual === 'sin-stock') {
        productosFiltrados = productosFiltrados.filter(p => p.stock === 0);
    }
    
    const container = document.getElementById('listaInventario');
    
    if (productosFiltrados.length === 0) {
        let mensaje = '';
        if (filtroInventarioActual === 'con-stock') mensaje = 'No hay productos con stock disponible';
        else if (filtroInventarioActual === 'sin-stock') mensaje = 'No hay productos sin stock';
        else mensaje = 'No hay productos en inventario';
        container.innerHTML = `<div class="item-card"><div class="item-title">${mensaje}</div></div>`;
        return;
    }
    
    container.innerHTML = productosFiltrados.map(p => {
        const sinStock = p.stock === 0;
        const stockClass = sinStock ? 'stock-cero' : 'stock-positivo';
        const stockTexto = sinStock ? 'Sin stock' : `${p.stock} unidades`;
        
        return `
            <div class="inventario-card ${sinStock ? 'sin-stock' : ''}">
                <div class="inventario-header">
                    <div class="inventario-nombre">
                        <i class="fas fa-box"></i> ${p.producto}
                    </div>
                    <div class="inventario-stock ${stockClass}">
                        ${stockTexto}
                    </div>
                </div>
                <div class="inventario-detalles">
                    <span><i class="fas fa-dollar-sign"></i> Último costo: $${parseFloat(p.ultimo_costo).toFixed(2)}</span>
                    <span><i class="fas fa-chart-line"></i> Valor total: $${(p.stock * p.ultimo_costo).toFixed(2)}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ============ FILTRAR INVENTARIO ============
function filtrarInventario(tipo) {
    filtroInventarioActual = tipo;
    
    // Actualizar estilo de los botones
    document.querySelectorAll('.filtro-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Aplicar filtro
    aplicarFiltroInventario();
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
            console.error('Error:', error);
            alert('❌ Error de conexión. Revisa la consola para más detalles.');
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
    
    // Verificar que el producto aún tiene stock (validación extra)
    const select = document.getElementById('productoVenta');
    const selectedOption = select.options[select.selectedIndex];
    const stockDisponible = parseInt(selectedOption.getAttribute('data-stock')) || 0;
    
    if (stockDisponible < 1) {
        alert('❌ Este producto ya no tiene stock disponible');
        cargarProductosSelector(); // Recargar la lista
        return;
    }
    
    const totalRecibido = data.precio_venta - data.envio_venta - data.comisiones;
    const ganancia = totalRecibido - data.costo_original;
    
    if (confirm(`💰 Confirmar venta:\n\nProducto: ${data.producto}\nStock disponible: ${stockDisponible}\nPrecio venta: $${data.precio_venta.toFixed(2)}\nGanancia estimada: $${ganancia.toFixed(2)}\n\n¿Guardar?`)) {
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
                // Recargar todo
                cargarGrafica();
                cargarInventario();
                cargarProductosSelector(); // Esto recargará la lista sin productos agotados
                cargarHistorial();
                actualizarStatsCards();
                cargarDashboard();
            } else {
                alert('❌ ' + (result.error || 'Error'));
                // Si el error es por stock, recargar productos
                if (result.error && result.error.includes('stock')) {
                    cargarProductosSelector();
                }
            }
        } catch (error) {
            console.error('Error:', error);
            alert('❌ Error de conexión');
        }
    }
});

// ============ CARGAR HISTORIAL CON EDITAR/ELIMINAR ============
async function cargarHistorial() {
    try {
        const comprasRes = await fetch(`${API_URL}/api/compras`);
        const compras = await comprasRes.json();
        const listaCompras = document.getElementById('listaCompras');
        
        if (compras.length === 0) {
            listaCompras.innerHTML = '<div class="item-card">No hay compras registradas</div>';
        } else {
            listaCompras.innerHTML = compras.slice(0, 20).map(c => `
                <div class="item-card" id="compra-${c.id}">
                    <div class="item-header">
                        <div class="item-title"><i class="fas fa-box"></i> ${c.producto}</div>
                        <div class="item-badge">${c.fecha}</div>
                    </div>
                    <div class="item-details">
                        <span><i class="fas fa-hashtag"></i> ${c.cantidad} unidades</span>
                        <span><i class="fas fa-dollar-sign"></i> $${parseFloat(c.costo_total).toFixed(2)}</span>
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: 12px;">
                        <button class="btn-editar" onclick="editarCompra(${c.id})"><i class="fas fa-edit"></i> Editar</button>
                        <button class="btn-eliminar" onclick="eliminarCompra(${c.id})"><i class="fas fa-trash"></i> Eliminar</button>
                    </div>
                    ${c.imagenes_lista && c.imagenes_lista.length > 0 ? `
                        <div class="imagenes-mini" style="margin-top: 12px;">
                            ${c.imagenes_lista.slice(0, 4).map(img => `<img src="${img}" class="card-imagen" onclick="window.open('${img}', '_blank')">`).join('')}
                        </div>
                    ` : ''}
                </div>
            `).join('');
        }
        
        const ventasRes = await fetch(`${API_URL}/api/ventas`);
        const ventas = await ventasRes.json();
        const listaVentas = document.getElementById('listaVentas');
        
        if (ventas.length === 0) {
            listaVentas.innerHTML = '<div class="item-card">No hay ventas registradas</div>';
        } else {
            listaVentas.innerHTML = ventas.slice(0, 20).map(v => `
                <div class="item-card" id="venta-${v.id}">
                    <div class="item-header">
                        <div class="item-title"><i class="fas fa-tag"></i> ${v.producto}</div>
                        <div class="item-badge">${v.fecha}</div>
                    </div>
                    <div class="item-details">
                        <span><i class="fas fa-dollar-sign"></i> Venta: $${parseFloat(v.precio_venta).toFixed(2)}</span>
                        <span><i class="fas fa-chart-line" style="color:#10b981;"></i> Ganancia: $${parseFloat(v.ganancia).toFixed(2)}</span>
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: 12px;">
                        <button class="btn-editar" onclick="editarVenta(${v.id})"><i class="fas fa-edit"></i> Editar</button>
                        <button class="btn-eliminar" onclick="eliminarVenta(${v.id})"><i class="fas fa-trash"></i> Eliminar</button>
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
            <div class="dashboard-stats-grid">
                <div class="stat-card-primary">
                    <div class="stat-icon"><i class="fas fa-chart-line"></i></div>
                    <div class="stat-value">${formatMoney(data.ganancias_totales)}</div>
                    <div class="stat-label">Ganancias totales</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-shopping-cart"></i></div>
                    <div class="stat-value">${data.total_ventas}</div>
                    <div class="stat-label">Ventas realizadas</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-boxes"></i></div>
                    <div class="stat-value">${formatMoney(data.stock_valor)}</div>
                    <div class="stat-label">Valor del inventario</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-dollar-sign"></i></div>
                    <div class="stat-value">${formatMoney(data.ingresos_totales)}</div>
                    <div class="stat-label">Ingresos totales</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-chart-pie"></i></div>
                    <div class="stat-value">${data.unidades_vendidas}</div>
                    <div class="stat-label">Unidades vendidas</div>
                </div>
            </div>
            
            <div class="dashboard-section">
                <h3><i class="fas fa-trophy"></i> Top 5 productos más rentables</h3>
                <div class="top-productos-list">
                    ${data.top_productos.length === 0 ? '<div class="loading">Sin datos</div>' : 
                        data.top_productos.map(p => `
                            <div class="top-producto-card">
                                <div class="top-producto-info">
                                    <span class="top-producto-nombre">${p.producto}</span>
                                    <span class="top-producto-ventas">${p.veces_vendido} ventas</span>
                                </div>
                                <div class="top-producto-ganancia">${formatMoney(p.ganancia_total)}</div>
                            </div>
                        `).join('')
                    }
                </div>
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
    // Ocultar todos los contenidos
    const contenidos = document.querySelectorAll('.tab-content');
    contenidos.forEach(content => {
        content.classList.remove('active');
    });
    if (tab === 'intercambios') {
    cargarProductosIntercambio();
    cargarIntercambios();
}
    // Mostrar el contenido seleccionado
    const contenidoActivo = document.getElementById(`tab-${tab}`);
    if (contenidoActivo) {
        contenidoActivo.classList.add('active');
    }
    
    // Actualizar estilo de los botones
    const botones = document.querySelectorAll('.tab-btn');
    botones.forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Activar el botón clickeado
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    // Cargar datos según la pestaña
    if (tab === 'inventario') {
        cargarInventario();
    } else if (tab === 'historial') {
        cargarHistorial();
    } else if (tab === 'ventas') {
        cargarProductosSelector();
    } else if (tab === 'dashboard') {
        cargarDashboard();
    }
}
// ============ EDITAR/ELIMINAR COMPRAS ============
async function editarCompra(id) {
    const nuevaFecha = prompt("Nueva fecha (YYYY-MM-DD):");
    const nuevoProducto = prompt("Nuevo producto:");
    const nuevaCantidad = prompt("Nueva cantidad:");
    const nuevoPrecio = prompt("Nuevo precio por unidad:");
    const nuevoEnvio = prompt("Nuevo envío:");
    
    if (nuevaFecha && nuevoProducto && nuevaCantidad && nuevoPrecio) {
        const data = {
            fecha: nuevaFecha,
            producto: nuevoProducto,
            cantidad: parseFloat(nuevaCantidad),
            precio_unidad: parseFloat(nuevoPrecio),
            envio: parseFloat(nuevoEnvio) || 0
        };
        
        const response = await fetch(`${API_URL}/api/compras/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            alert('✅ Compra editada');
            cargarHistorial();
            cargarInventario();
            cargarGrafica();
            cargarDashboard();
        } else {
            alert('❌ Error al editar');
        }
    }
}

async function eliminarCompra(id) {
    if (confirm('⚠️ ¿Eliminar esta compra? Se ajustará el inventario automáticamente.')) {
        const response = await fetch(`${API_URL}/api/compras/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            alert('✅ Compra eliminada');
            cargarHistorial();
            cargarInventario();
            cargarGrafica();
            cargarDashboard();
        } else {
            alert('❌ Error al eliminar');
        }
    }
}

// ============ EDITAR/ELIMINAR VENTAS ============
async function editarVenta(id) {
    const nuevaFecha = prompt("Nueva fecha (YYYY-MM-DD):");
    const nuevoProducto = prompt("Nuevo producto:");
    const nuevoPrecio = prompt("Nuevo precio de venta:");
    const nuevoEnvio = prompt("Nuevo envío:");
    const nuevasComisiones = prompt("Nuevas comisiones:");
    const nuevoCosto = prompt("Nuevo costo original:");
    
    if (nuevaFecha && nuevoProducto && nuevoPrecio) {
        const data = {
            fecha: nuevaFecha,
            producto: nuevoProducto,
            precio_venta: parseFloat(nuevoPrecio),
            envio_venta: parseFloat(nuevoEnvio) || 0,
            comisiones: parseFloat(nuevasComisiones) || 0,
            costo_original: parseFloat(nuevoCosto) || 0
        };
        
        const response = await fetch(`${API_URL}/api/ventas/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            alert('✅ Venta editada');
            cargarHistorial();
            cargarInventario();
            cargarGrafica();
            cargarDashboard();
        } else {
            alert('❌ Error al editar');
        }
    }
}

async function eliminarVenta(id) {
    if (confirm('⚠️ ¿Eliminar esta venta? Se devolverá el stock al inventario.')) {
        const response = await fetch(`${API_URL}/api/ventas/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            alert('✅ Venta eliminada');
            cargarHistorial();
            cargarInventario();
            cargarGrafica();
            cargarDashboard();
        } else {
            alert('❌ Error al eliminar');
        }
    }
}
// ============ CARGAR PRODUCTOS PARA INTERCAMBIOS ============
async function cargarProductosIntercambio() {
    try {
        const response = await fetch(`${API_URL}/api/inventario/productos`);
        const productos = await response.json();
        
        const selectEntregado = document.getElementById('productoEntregado');
        const selectRecibido = document.getElementById('productoRecibido');
        
        const options = '<option value="">Seleccionar producto...</option>' + 
            productos.map(p => `<option value="${p.producto}" data-costo="${p.ultimo_costo}" data-precio="${p.precio_estimado_venta || p.ultimo_costo}" data-stock="${p.stock}">${p.producto} (Stock: ${p.stock} - Valor: $${(p.precio_estimado_venta || p.ultimo_costo).toFixed(2)})</option>`).join('');
        
        selectEntregado.innerHTML = options;
        selectRecibido.innerHTML = options;
    } catch (error) {
        console.error('Error cargando productos:', error);
    }
}

function actualizarValoresIntercambio() {
    const selectEntregado = document.getElementById('productoEntregado');
    const selectRecibido = document.getElementById('productoRecibido');
    const cantidadEntregada = parseFloat(document.getElementById('cantidadEntregada').value) || 1;
    const cantidadRecibida = parseFloat(document.getElementById('cantidadRecibida').value) || 1;
    const diferenciaFavor = document.getElementById('diferenciaFavor').value;
    const montoDiferencia = parseFloat(document.getElementById('montoDiferencia').value) || 0;
    
    const valorEntregadoUnit = parseFloat(selectEntregado.selectedOptions[0]?.getAttribute('data-precio') || 0);
    const valorRecibidoUnit = parseFloat(selectRecibido.selectedOptions[0]?.getAttribute('data-precio') || 0);
    
    const valorEntregado = valorEntregadoUnit * cantidadEntregada;
    const valorRecibido = valorRecibidoUnit * cantidadRecibida;
    
    let ganancia = 0;
    if (diferenciaFavor === 'a_favor') {
        ganancia = (valorRecibido + montoDiferencia) - valorEntregado;
    } else {
        ganancia = valorRecibido - (valorEntregado + montoDiferencia);
    }
    
    document.getElementById('resValorEntregado').innerHTML = `$${valorEntregado.toFixed(2)}`;
    document.getElementById('resValorRecibido').innerHTML = `$${valorRecibido.toFixed(2)}`;
    document.getElementById('resDiferencia').innerHTML = `$${montoDiferencia.toFixed(2)} ${diferenciaFavor === 'a_favor' ? '(a mi favor)' : '(pago yo)'}`;
    
    const gananciaColor = ganancia >= 0 ? '#10b981' : '#ef4444';
    const gananciaSigno = ganancia >= 0 ? '+' : '';
    document.getElementById('resGanancia').innerHTML = `<span style="color: ${gananciaColor};">${gananciaSigno}$${ganancia.toFixed(2)}</span>`;
}

// ============ GUARDAR INTERCAMBIO ============
document.getElementById('formIntercambio')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {
        fecha: document.getElementById('fechaIntercambio').value,
        producto_entregado: document.getElementById('productoEntregado').value,
        producto_recibido: document.getElementById('productoRecibido').value,
        cantidad_entregada: parseInt(document.getElementById('cantidadEntregada').value),
        cantidad_recibida: parseInt(document.getElementById('cantidadRecibida').value),
        diferencia_favor: document.getElementById('diferenciaFavor').value,
        monto_diferencia: parseFloat(document.getElementById('montoDiferencia').value) || 0,
        notas: document.getElementById('notasIntercambio').value
    };
    
    if (!data.producto_entregado || !data.producto_recibido) {
        alert('❌ Selecciona ambos productos');
        return;
    }
    
    if (data.producto_entregado === data.producto_recibido) {
        alert('❌ No puedes intercambiar el mismo producto');
        return;
    }
    
    const confirmMsg = `🔄 Confirmar intercambio:\n\n📤 ENTREGAS: ${data.cantidad_entregada}x ${data.producto_entregado}\n📥 RECIBES: ${data.cantidad_recibida}x ${data.producto_recibido}\n💰 Diferencia: $${data.monto_diferencia} ${data.diferencia_favor === 'a_favor' ? '(a tu favor)' : '(pagas tú)'}\n\n¿Registrar?`;
    
    if (confirm(confirmMsg)) {
        try {
            const response = await fetch(`${API_URL}/api/intercambios`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (response.ok) {
                alert(`✅ Intercambio registrado!\nGanancia en el intercambio: $${result.ganancia?.toFixed(2) || '0'}`);
                e.target.reset();
                document.getElementById('fechaIntercambio').value = new Date().toISOString().slice(0,10);
                cargarInventario();
                cargarProductosSelector();
                cargarProductosIntercambio();
                cargarIntercambios();
                cargarGrafica();
                cargarDashboard();
            } else {
                alert('❌ Error: ' + (result.error || 'Error desconocido'));
            }
        } catch (error) {
            console.error('Error:', error);
            alert('❌ Error de conexión');
        }
    }
});

// ============ CARGAR HISTORIAL DE INTERCAMBIOS ============
async function cargarIntercambios() {
    try {
        const response = await fetch(`${API_URL}/api/intercambios`);
        const intercambios = await response.json();
        const container = document.getElementById('listaIntercambios');
        
        if (intercambios.length === 0) {
            container.innerHTML = '<div class="item-card">No hay intercambios registrados</div>';
        } else {
            container.innerHTML = intercambios.slice(0, 20).map(i => {
                const gananciaColor = i.ganancia_intercambio >= 0 ? '#10b981' : '#ef4444';
                return `
                    <div class="item-card">
                        <div class="item-header">
                            <div class="item-title"><i class="fas fa-exchange-alt"></i> Intercambio</div>
                            <div class="item-badge">${i.fecha}</div>
                        </div>
                        <div class="item-details">
                            <span><i class="fas fa-arrow-right"></i> Entregaste: ${i.cantidad_entregada}x ${i.producto_entregado}</span>
                            <span><i class="fas fa-arrow-left"></i> Recibiste: ${i.cantidad_recibida}x ${i.producto_recibido}</span>
                        </div>
                        <div class="item-details">
                            <span><i class="fas fa-dollar-sign"></i> Diferencia: $${i.monto_diferencia} ${i.diferencia_favor === 'a_favor' ? '(a tu favor)' : '(pagaste)'}</span>
                            <span><i class="fas fa-chart-line" style="color: ${gananciaColor};"></i> Ganancia: $${i.ganancia_intercambio?.toFixed(2)}</span>
                        </div>
                        ${i.notas ? `<div class="item-details"><span><i class="fas fa-sticky-note"></i> ${i.notas}</span></div>` : ''}
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error cargando intercambios:', error);
    }
}
// ============ INICIAR ============
cargarDarkMode();
cargarGrafica();
cargarInventario();
cargarProductosSelector();
cargarHistorial();
actualizarStatsCards();
cargarDashboard();