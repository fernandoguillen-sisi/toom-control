const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configuración de multer para múltiples imágenes
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, 'uploads/productos');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, 'prod_' + uniqueSuffix + extension);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes'));
        }
    }
});

// Base de datos
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'toom_db'
});

db.connect((err) => {
    if (err) {
        console.error('❌ Error conectando a MySQL:', err);
        return;
    }
    console.log('✅ Conectado a MySQL');
});

// ============ FUNCIÓN PARA ACTUALIZAR INVENTARIO ============
function actualizarInventario(producto, cantidad, costoUnitario, esCompra) {
    return new Promise((resolve, reject) => {
        db.query('SELECT * FROM inventario WHERE producto = ?', [producto], (err, results) => {
            if (err) return reject(err);
            
            if (results.length === 0) {
                const stock = esCompra ? cantidad : 0;
                db.query('INSERT INTO inventario (producto, stock, ultimo_costo) VALUES (?, ?, ?)',
                    [producto, stock, costoUnitario], (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
            } else {
                const nuevoStock = esCompra ? results[0].stock + cantidad : results[0].stock - cantidad;
                const nuevoCosto = esCompra ? costoUnitario : results[0].ultimo_costo;
                db.query('UPDATE inventario SET stock = ?, ultimo_costo = ?, updated_at = NOW() WHERE producto = ?',
                    [nuevoStock, nuevoCosto, producto], (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
            }
        });
    });
}

// ============ ENDPOINTS ============

// 📦 Registrar compra CON MÚLTIPLES IMÁGENES
app.post('/api/compras', upload.array('imagenes', 10), async (req, res) => {
    const { fecha, producto, cantidad, precio_unidad, envio, precio_estimado_venta } = req.body;
    
    const total_compra = cantidad * precio_unidad;
    const costo_total = total_compra + (parseFloat(envio) || 0);
    const costo_unitario_total = costo_total / cantidad;
    
    const sql = `INSERT INTO compras 
                 (fecha, producto, cantidad, precio_unidad, total_compra, envio, costo_total, precio_estimado_venta) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.query(sql, [fecha, producto, cantidad, precio_unidad, total_compra, envio || 0, costo_total, precio_estimado_venta || 0], 
        async (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Error al guardar compra' });
            }
            
            const compraId = result.insertId;
            
            const imagenes = req.files || [];
            for (const file of imagenes) {
                const imagen_ruta = '/uploads/productos/' + file.filename;
                db.query('INSERT INTO compras_imagenes (compra_id, imagen_ruta) VALUES (?, ?)', 
                    [compraId, imagen_ruta]);
            }
            
            try {
                await actualizarInventario(producto, parseInt(cantidad), costo_unitario_total, true);
                res.json({ success: true, id: compraId, imagenes: imagenes.length });
            } catch (invErr) {
                console.error('Error actualizando inventario:', invErr);
                res.json({ success: true, id: compraId, warning: 'Compra guardada pero error en inventario' });
            }
        });
});

// 💰 Registrar venta
app.post('/api/ventas', async (req, res) => {
    const { fecha, producto, precio_venta, envio_venta, comisiones, costo_original } = req.body;
    
    db.query('SELECT stock FROM inventario WHERE producto = ?', [producto], (err, stockResult) => {
        if (err) return res.status(500).json({ error: 'Error al verificar stock' });
        
        if (stockResult.length === 0 || stockResult[0].stock < 1) {
            return res.status(400).json({ error: 'Producto sin stock disponible' });
        }
        
        const total_recibido = precio_venta - (envio_venta || 0) - (comisiones || 0);
        const ganancia = total_recibido - costo_original;
        
        const sql = `INSERT INTO ventas 
                     (fecha, producto, precio_venta, envio_venta, comisiones, total_recibido, costo_original, ganancia) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        
        db.query(sql, [fecha, producto, precio_venta, envio_venta || 0, comisiones || 0, total_recibido, costo_original, ganancia], 
            async (err, result) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ error: 'Error al guardar venta' });
                }
                
                try {
                    await actualizarInventario(producto, 1, costo_original, false);
                    res.json({ success: true, id: result.insertId });
                } catch (invErr) {
                    console.error('Error actualizando inventario:', invErr);
                    res.json({ success: true, warning: 'Venta guardada pero error en inventario' });
                }
            });
    });
});

// 📋 Obtener productos para el selector
app.get('/api/inventario/productos', (req, res) => {
    db.query('SELECT producto, ultimo_costo, stock FROM inventario ORDER BY producto', (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al obtener productos' });
        res.json(results);
    });
});

// 📋 Obtener compras con sus imágenes
app.get('/api/compras', (req, res) => {
    const sql = `SELECT c.*, 
                    (SELECT GROUP_CONCAT(imagen_ruta) FROM compras_imagenes WHERE compra_id = c.id) as imagenes
                 FROM compras c 
                 ORDER BY c.fecha DESC`;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al obtener compras' });
        
        const compras = results.map(c => ({
            ...c,
            imagenes_lista: c.imagenes ? c.imagenes.split(',') : []
        }));
        res.json(compras);
    });
});

// 📊 Gráfica de ganancias
app.get('/api/grafica/ganancias-mensuales', (req, res) => {
    db.query(`SELECT DATE_FORMAT(fecha, '%Y-%m') as mes, SUM(ganancia) as total_ganancia 
              FROM ventas GROUP BY DATE_FORMAT(fecha, '%Y-%m') ORDER BY mes DESC LIMIT 12`, 
        (err, results) => {
            if (err) return res.status(500).json({ error: 'Error al obtener datos' });
            res.json(results);
        });
});

// 📋 Obtener ventas
app.get('/api/ventas', (req, res) => {
    db.query('SELECT * FROM ventas ORDER BY fecha DESC', (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al obtener ventas' });
        res.json(results);
    });
});

// 📊 Obtener inventario completo
app.get('/api/inventario', (req, res) => {
    db.query('SELECT * FROM inventario ORDER BY producto', (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al obtener inventario' });
        res.json(results);
    });
});
// 📊 Gráfica de ganancias por año
app.get('/api/grafica/ganancias-anuales', (req, res) => {
    db.query(`SELECT DATE_FORMAT(fecha, '%Y') as ano, SUM(ganancia) as total_ganancia 
              FROM ventas GROUP BY DATE_FORMAT(fecha, '%Y') ORDER BY ano DESC`, 
        (err, results) => {
            if (err) return res.status(500).json({ error: 'Error al obtener datos' });
            res.json(results);
        });
});
// 📊 DASHBOARD - Resumen de estadísticas
app.get('/api/dashboard/resumen', (req, res) => {
    const sqlGananciasTotales = 'SELECT SUM(ganancia) as total FROM ventas';
    const sqlTotalVentas = 'SELECT COUNT(*) as cantidad, SUM(precio_venta) as ingresos FROM ventas';
    const sqlTotalCompras = 'SELECT SUM(costo_total) as total FROM compras';
    const sqlStockValor = 'SELECT SUM(stock * ultimo_costo) as valor FROM inventario';
    const sqlUnidadesVendidas = 'SELECT COUNT(*) as unidades FROM ventas';
    const sqlGananciaPromedio = 'SELECT AVG(ganancia) as promedio FROM ventas';
    const sqlVentasPorMes = `SELECT DATE_FORMAT(fecha, '%Y-%m') as mes, COUNT(*) as cantidad, SUM(ganancia) as ganancia 
                             FROM ventas GROUP BY DATE_FORMAT(fecha, '%Y-%m') ORDER BY mes DESC LIMIT 6`;
    const sqlTopProductos = `SELECT producto, SUM(ganancia) as ganancia_total, COUNT(*) as veces_vendido 
                            FROM ventas GROUP BY producto ORDER BY ganancia_total DESC LIMIT 5`;
    
    db.query(sqlGananciasTotales, (err, ganancias) => {
        if (err) return res.status(500).json({ error: 'Error en ganancias' });
        
        db.query(sqlTotalVentas, (err, ventas) => {
            if (err) return res.status(500).json({ error: 'Error en ventas' });
            
            db.query(sqlTotalCompras, (err, compras) => {
                if (err) return res.status(500).json({ error: 'Error en compras' });
                
                db.query(sqlStockValor, (err, stock) => {
                    if (err) return res.status(500).json({ error: 'Error en stock' });
                    
                    db.query(sqlUnidadesVendidas, (err, unidades) => {
                        if (err) return res.status(500).json({ error: 'Error en unidades' });
                        
                        db.query(sqlGananciaPromedio, (err, promedio) => {
                            if (err) return res.status(500).json({ error: 'Error en promedio' });
                            
                            db.query(sqlVentasPorMes, (err, meses) => {
                                if (err) return res.status(500).json({ error: 'Error en meses' });
                                
                                db.query(sqlTopProductos, (err, top) => {
                                    if (err) return res.status(500).json({ error: 'Error en top' });
                                    
                                    res.json({
                                        ganancias_totales: ganancias[0]?.total || 0,
                                        total_ventas: ventas[0]?.cantidad || 0,
                                        ingresos_totales: ventas[0]?.ingresos || 0,
                                        total_compras: compras[0]?.total || 0,
                                        stock_valor: stock[0]?.valor || 0,
                                        unidades_vendidas: unidades[0]?.unidades || 0,
                                        ganancia_promedio: promedio[0]?.promedio || 0,
                                        ventas_por_mes: meses || [],
                                        top_productos: top || []
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// Iniciar servidor
app.listen(port, () => {
    console.log(`🚀 Servidor Toom corriendo en http://localhost:${port}`);
    console.log(`📸 Múltiples imágenes se guardan en: uploads/productos/`);
});