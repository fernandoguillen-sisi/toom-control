const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Configuración de Supabase (desde variables de entorno)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Configuración de multer para imágenes (en memoria)
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) return cb(null, true);
        cb(new Error('Solo imágenes'));
    }
});

// ============ FUNCIÓN ACTUALIZAR INVENTARIO ============
async function actualizarInventario(producto, cantidad, costoUnitario, esCompra) {
    const { data: existing } = await supabase
        .from('inventario')
        .select('*')
        .eq('producto', producto)
        .single();
    
    if (!existing) {
        const stock = esCompra ? cantidad : 0;
        await supabase.from('inventario').insert({
            producto,
            stock,
            ultimo_costo: costoUnitario
        });
    } else {
        const nuevoStock = esCompra ? existing.stock + cantidad : existing.stock - cantidad;
        await supabase.from('inventario')
            .update({ stock: nuevoStock, ultimo_costo: costoUnitario, updated_at: new Date() })
            .eq('producto', producto);
    }
}

// ============ ENDPOINTS ============

// 📦 Registrar compra
app.post('/api/compras', upload.array('imagenes', 10), async (req, res) => {
    try {
        const { fecha, producto, cantidad, precio_unidad, envio, precio_estimado_venta } = req.body;
        
        const total_compra = cantidad * precio_unidad;
        const costo_total = total_compra + (parseFloat(envio) || 0);
        const costo_unitario_total = costo_total / cantidad;
        
        // Guardar compra
        const { data: compra, error: compraError } = await supabase
            .from('compras')
            .insert({
                fecha, producto, cantidad, precio_unidad,
                total_compra, envio: envio || 0, costo_total,
                precio_estimado_venta: precio_estimado_venta || 0
            })
            .select()
            .single();
        
        if (compraError) throw compraError;
        
        // Subir imágenes a Supabase Storage
        const imagenes = req.files || [];
        for (const file of imagenes) {
            const extension = file.originalname.split('.').pop();
            const fileName = `prod_${Date.now()}_${Math.random()}.${extension}`;
            const { error: uploadError } = await supabase.storage
                .from('productos')
                .upload(fileName, file.buffer, { contentType: file.mimetype });
            
            if (!uploadError) {
                const { data: urlData } = supabase.storage.from('productos').getPublicUrl(fileName);
                await supabase.from('compras_imagenes').insert({
                    compra_id: compra.id,
                    imagen_url: urlData.publicUrl
                });
            }
        }
        
        await actualizarInventario(producto, parseInt(cantidad), costo_unitario_total, true);
        res.json({ success: true, id: compra.id });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al guardar compra' });
    }
});

// 💰 Registrar venta
app.post('/api/ventas', async (req, res) => {
    try {
        const { fecha, producto, precio_venta, envio_venta, comisiones, costo_original } = req.body;
        
        // Verificar stock
        const { data: inventario, error: stockError } = await supabase
            .from('inventario')
            .select('stock')
            .eq('producto', producto)
            .single();
        
        if (stockError || !inventario || inventario.stock < 1) {
            return res.status(400).json({ error: 'Producto sin stock disponible' });
        }
        
        const total_recibido = precio_venta - (envio_venta || 0) - (comisiones || 0);
        const ganancia = total_recibido - costo_original;
        
        const { error: ventaError } = await supabase.from('ventas').insert({
            fecha, producto, precio_venta,
            envio_venta: envio_venta || 0,
            comisiones: comisiones || 0,
            total_recibido, costo_original, ganancia
        });
        
        if (ventaError) throw ventaError;
        
        await actualizarInventario(producto, 1, costo_original, false);
        res.json({ success: true });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al guardar venta' });
    }
});

// 📋 Obtener compras con imágenes
app.get('/api/compras', async (req, res) => {
    try {
        const { data: compras, error } = await supabase
            .from('compras')
            .select('*')
            .order('fecha', { ascending: false });
        
        if (error) throw error;
        
        for (const compra of compras) {
            const { data: imagenes } = await supabase
                .from('compras_imagenes')
                .select('imagen_url')
                .eq('compra_id', compra.id);
            compra.imagenes_lista = imagenes ? imagenes.map(i => i.imagen_url) : [];
        }
        
        res.json(compras);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

// 📋 Obtener productos (SOLO con stock > 0)
app.get('/api/inventario/productos', async (req, res) => {
    const { data } = await supabase
        .from('inventario')
        .select('producto, ultimo_costo, stock')
        .gt('stock', 0)  // SOLO productos con stock mayor a 0
        .order('producto');
    res.json(data || []);
});

// 📊 Gráfica mensual (ordenada cronológicamente)
app.get('/api/grafica/ganancias-mensuales', async (req, res) => {
    const { data } = await supabase.from('ventas').select('fecha, ganancia');
    const meses = {};
    (data || []).forEach(v => {
        const mes = v.fecha.slice(0, 7);
        meses[mes] = (meses[mes] || 0) + v.ganancia;
    });
    const result = Object.entries(meses)
        .map(([mes, total]) => ({ mes, total_ganancia: total }))
        .sort((a, b) => a.mes.localeCompare(b.mes)); // Ordenar de menor a mayor
    res.json(result);
});

// 📊 Gráfica anual
app.get('/api/grafica/ganancias-anuales', async (req, res) => {
    const { data } = await supabase.from('ventas').select('fecha, ganancia');
    const anos = {};
    (data || []).forEach(v => {
        const ano = v.fecha.slice(0, 4);
        anos[ano] = (anos[ano] || 0) + v.ganancia;
    });
    const result = Object.entries(anos).map(([ano, total]) => ({ ano, total_ganancia: total }));
    res.json(result);
});

// 📋 Obtener ventas
app.get('/api/ventas', async (req, res) => {
    const { data } = await supabase.from('ventas').select('*').order('fecha', { ascending: false });
    res.json(data || []);
});

// 📊 Inventario
app.get('/api/inventario', async (req, res) => {
    const { data } = await supabase.from('inventario').select('*').order('producto');
    res.json(data || []);
});

// 📊 Dashboard
app.get('/api/dashboard/resumen', async (req, res) => {
    const { data: ventas } = await supabase.from('ventas').select('ganancia, precio_venta');
    const { data: compras } = await supabase.from('compras').select('costo_total');
    const { data: inventario } = await supabase.from('inventario').select('stock, ultimo_costo');
    
    const ganancias_totales = (ventas || []).reduce((sum, v) => sum + v.ganancia, 0);
    const total_ventas = (ventas || []).length;
    const ingresos_totales = (ventas || []).reduce((sum, v) => sum + v.precio_venta, 0);
    const total_compras = (compras || []).reduce((sum, c) => sum + c.costo_total, 0);
    const stock_valor = (inventario || []).reduce((sum, i) => sum + (i.stock * i.ultimo_costo), 0);
    const unidades_vendidas = total_ventas;
    const ganancia_promedio = total_ventas ? ganancias_totales / total_ventas : 0;
    
    // Top productos
    const { data: ventasDetalle } = await supabase.from('ventas').select('producto, ganancia');
    const productosMap = {};
    (ventasDetalle || []).forEach(v => {
        if (!productosMap[v.producto]) productosMap[v.producto] = { ganancia_total: 0, veces_vendido: 0 };
        productosMap[v.producto].ganancia_total += v.ganancia;
        productosMap[v.producto].veces_vendido++;
    });
    const top_productos = Object.entries(productosMap)
        .map(([producto, data]) => ({ producto, ...data }))
        .sort((a, b) => b.ganancia_total - a.ganancia_total)
        .slice(0, 5);
    
    res.json({
        ganancias_totales,
        total_ventas,
        ingresos_totales,
        total_compras,
        stock_valor,
        unidades_vendidas,
        ganancia_promedio,
        ventas_por_mes: [],
        top_productos
    });
});
// ✏️ EDITAR compra
app.put('/api/compras/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { fecha, producto, cantidad, precio_unidad, envio } = req.body;
        
        const total_compra = cantidad * precio_unidad;
        const costo_total = total_compra + (parseFloat(envio) || 0);
        const costo_unitario_total = costo_total / cantidad;
        
        // Obtener compra anterior para ajustar inventario
        const { data: compraAnterior } = await supabase
            .from('compras')
            .select('*')
            .eq('id', id)
            .single();
        
        if (!compraAnterior) throw new Error('Compra no encontrada');
        
        // Actualizar compra
        const { error } = await supabase
            .from('compras')
            .update({ fecha, producto, cantidad, precio_unidad, total_compra, envio: envio || 0, costo_total })
            .eq('id', id);
        
        if (error) throw error;
        
        // Recalcular inventario (restar lo anterior, sumar lo nuevo)
        const diferenciaCantidad = cantidad - compraAnterior.cantidad;
        if (diferenciaCantidad !== 0) {
            await actualizarInventario(producto, diferenciaCantidad, costo_unitario_total, true);
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al editar compra' });
    }
});

// 🗑️ ELIMINAR compra
app.delete('/api/compras/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Obtener compra para ajustar inventario
        const { data: compra } = await supabase
            .from('compras')
            .select('*')
            .eq('id', id)
            .single();
        
        if (!compra) throw new Error('Compra no encontrada');
        
        // Eliminar imágenes asociadas
        const { data: imagenes } = await supabase
            .from('compras_imagenes')
            .select('imagen_url')
            .eq('compra_id', id);
        
        for (const img of imagenes || []) {
            const fileName = img.imagen_url.split('/').pop();
            await supabase.storage.from('productos').remove([fileName]);
        }
        
        await supabase.from('compras_imagenes').delete().eq('compra_id', id);
        
        // Eliminar compra
        const { error } = await supabase.from('compras').delete().eq('id', id);
        if (error) throw error;
        
        // Ajustar inventario (restar stock)
        await actualizarInventario(compra.producto, -compra.cantidad, compra.costo_total / compra.cantidad, true);
        
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar compra' });
    }
});

// ✏️ EDITAR venta
app.put('/api/ventas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { fecha, producto, precio_venta, envio_venta, comisiones, costo_original } = req.body;
        
        const total_recibido = precio_venta - (envio_venta || 0) - (comisiones || 0);
        const ganancia = total_recibido - costo_original;
        
        // Obtener venta anterior
        const { data: ventaAnterior } = await supabase
            .from('ventas')
            .select('*')
            .eq('id', id)
            .single();
        
        if (!ventaAnterior) throw new Error('Venta no encontrada');
        
        // Actualizar venta
        const { error } = await supabase
            .from('ventas')
            .update({ fecha, producto, precio_venta, envio_venta, comisiones, total_recibido, costo_original, ganancia })
            .eq('id', id);
        
        if (error) throw error;
        
        // Ajustar inventario si cambió el producto
        if (ventaAnterior.producto !== producto) {
            await actualizarInventario(ventaAnterior.producto, 1, ventaAnterior.costo_original, false); // devolver stock
            await actualizarInventario(producto, -1, costo_original, false); // quitar stock del nuevo
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al editar venta' });
    }
});

// 🗑️ ELIMINAR venta
app.delete('/api/ventas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Obtener venta
        const { data: venta } = await supabase
            .from('ventas')
            .select('*')
            .eq('id', id)
            .single();
        
        if (!venta) throw new Error('Venta no encontrada');
        
        // Eliminar venta
        const { error } = await supabase.from('ventas').delete().eq('id', id);
        if (error) throw error;
        
        // Devolver stock al inventario
        await actualizarInventario(venta.producto, 1, venta.costo_original, false);
        
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar venta' });
    }
});
// ============ INTERCAMBIOS ============

// 📦 Registrar intercambio
app.post('/api/intercambios', async (req, res) => {
    try {
        const { 
            fecha, 
            producto_entregado, 
            producto_recibido, 
            cantidad_entregada, 
            cantidad_recibida,
            diferencia_favor,
            monto_diferencia,
            notas 
        } = req.body;
        
        // Obtener valores de los productos del inventario
        const { data: entregado } = await supabase
            .from('inventario')
            .select('precio_estimado_venta, ultimo_costo')
            .eq('producto', producto_entregado)
            .single();
        
        const { data: recibido } = await supabase
            .from('inventario')
            .select('precio_estimado_venta, ultimo_costo')
            .eq('producto', producto_recibido)
            .single();
        
        if (!entregado || !recibido) {
            return res.status(400).json({ error: 'Producto no encontrado en inventario' });
        }
        
        // Calcular valores
        const valorEntregado = (entregado.precio_estimado_venta || entregado.ultimo_costo) * cantidad_entregada;
        const valorRecibido = (recibido.precio_estimado_venta || recibido.ultimo_costo) * cantidad_recibida;
        
        let gananciaIntercambio = 0;
        if (diferencia_favor === 'a_favor') {
            // Recibes dinero extra a tu favor
            gananciaIntercambio = (valorRecibido + monto_diferencia) - valorEntregado;
        } else {
            // Pagas dinero extra
            gananciaIntercambio = valorRecibido - (valorEntregado + monto_diferencia);
        }
        
        // Guardar intercambio
        const { data: intercambio, error } = await supabase
            .from('intercambios')
            .insert({
                fecha,
                producto_entregado,
                producto_recibido,
                cantidad_entregada,
                cantidad_recibida,
                diferencia_favor,
                monto_diferencia: monto_diferencia || 0,
                valor_entregado: valorEntregado,
                valor_recibido: valorRecibido,
                ganancia_intercambio: gananciaIntercambio,
                notas: notas || ''
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // Actualizar inventario: restar producto entregado, sumar producto recibido
        // Restar entregado
        const { data: stockEntregado } = await supabase
            .from('inventario')
            .select('stock')
            .eq('producto', producto_entregado)
            .single();
        
        await supabase
            .from('inventario')
            .update({ stock: stockEntregado.stock - cantidad_entregada })
            .eq('producto', producto_entregado);
        
        // Sumar recibido
        const { data: stockRecibido } = await supabase
            .from('inventario')
            .select('stock')
            .eq('producto', producto_recibido)
            .single();
        
        await supabase
            .from('inventario')
            .update({ stock: stockRecibido.stock + cantidad_recibida })
            .eq('producto', producto_recibido);
        
        res.json({ success: true, id: intercambio.id, ganancia: gananciaIntercambio });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al registrar intercambio' });
    }
});

// 📋 Obtener todos los intercambios
app.get('/api/intercambios', async (req, res) => {
    const { data } = await supabase
        .from('intercambios')
        .select('*')
        .order('fecha', { ascending: false });
    res.json(data || []);
});
app.listen(port, () => {
    console.log(`🚀 Servidor Toom en http://localhost:${port}`);
    console.log(`📸 Usando Supabase Storage para imágenes`);
});