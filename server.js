/**
 * ==================== SERVIDOR PRINCIPAL - IGREJA BATISTA SOLIDÁRIA ====================
 * Arquivo: server.js
 * Descrição: Configuração e inicialização do servidor Express
 * Porta: 3000 (ou PORT da variável de ambiente)
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

// Importar rotas
const contatoRoutes = require('./routes/contato');
const doacaoRoutes = require('./routes/doacao');
const cultoRoutes = require('./routes/culto');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');

// Importar middlewares
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { authenticateToken } = require('./middleware/auth');

// ==================== CONFIGURAÇÃO ====================
const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ibs';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ==================== MIDDLEWARE DE SEGURANÇA ====================
app.use(helmet());
app.use(compression());
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// ==================== MIDDLEWARE DE LOGGING ====================
if (NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// ==================== MIDDLEWARE DE BODY PARSING ====================
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// ==================== RATE LIMITING ====================
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // Limite de 100 requisições por IP
    message: 'Muitas requisições deste IP, tente novamente mais tarde.',
});

const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // Limite mais rigoroso
    message: 'Muitas tentativas, tente novamente mais tarde.',
});

app.use('/api/', limiter);
app.use('/api/auth/login', strictLimiter);
app.use('/api/doacao', limiter);

// ==================== ROTAS PÚBLICAS ====================

// ==================== ROTAS ESTÁTICAS ====================
// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, '.')));

// Compatibilidade para caminhos antigos do logo
app.get('/logo.jpg', (req, res) => {
    res.sendFile(path.join(__dirname, 'images/logo.jpg'));
});

// Fallback para imagens ausentes, evitando 404 em placeholders não enviados ainda
app.get('/images/*', (req, res, next) => {
    const imagePath = path.join(__dirname, req.path);
    if (fs.existsSync(imagePath)) {
        return res.sendFile(imagePath);
    }

    return res.sendFile(path.join(__dirname, 'images/logo.jpg'));
});

// Redirecionar rota raiz para homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages/home/index.html'));
});

// Servir páginas HTML (URLs limpas)
app.get('/:page', (req, res) => {
    const page = req.params.page;
    // Evitar conflito com rotas da API
    if (page.startsWith('api') || page === 'favicon.ico') {
        return res.status(404).json({ error: 'Not found' });
    }

    const filePath = path.join(__dirname, `pages/${page}/${page}.html`);
    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(404).sendFile(path.join(__dirname, 'pages/errors/404.html'));
        }
    });
});

// ==================== ROTAS DA API ====================

// Rota de status
app.get('/api/status', (req, res) => {
    res.json({
        status: 'ok',
        message: 'API da Igreja Batista Solidária está funcionando',
        timestamp: new Date(),
        environment: NODE_ENV
    });
});

// Rota de saúde (para monitoramento)
app.get('/api/health', (req, res) => {
    res.json({
        status: 200,
        message: 'Servidor operacional',
        uptime: process.uptime(),
        timestamp: new Date()
    });
});

// Contato
app.use('/api/contato', contatoRoutes);

// Doações
app.use('/api/doacao', doacaoRoutes);

// Cultos
app.use('/api/cultos', cultoRoutes);

// Usuários (Público)
app.use('/api/usuario', userRoutes);

// Admin (Protegido)
app.use('/api/admin', authenticateToken, adminRoutes);

// ==================== TRATAMENTO DE ERROS ====================

// 404 - Não encontrado
app.use(notFoundHandler);

// Erro global
app.use(errorHandler);

// ==================== CONEXÃO COM BANCO DE DADOS ====================

// Conexão MongoDB (Opcional - servidor funciona sem ela)
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 45000,
    retryWrites: true,
    retryReads: true,
    w: 'majority'
})
    .then(() => {
        console.log('✅ Banco de dados MongoDB conectado com sucesso');
    })
    .catch(err => {
        console.warn('⚠️ Aviso: Não foi possível conectar ao MongoDB:', err.message);
        console.warn('⚠️ O servidor continuará funcionando apenas com arquivos estáticos');
    });

// ==================== INICIAR SERVIDOR ====================

const server = app.listen(PORT, () => {
    console.log(`
    ╔════════════════════════════════════════════════════════╗
    ║  🙏 IGREJA BATISTA SOLIDÁRIA - BACKEND EM OPERAÇÃO    ║
    ╠════════════════════════════════════════════════════════╣
    ║  🌐 Servidor: http://localhost:${PORT}
    ║  📁 Base de Dados: ${MONGODB_URI.split('//')[1] || 'local'} (opcional)
    ║  🔧 Ambiente: ${NODE_ENV}
    ║  ⏰ Data/Hora: ${new Date().toLocaleString('pt-BR')}
    ╚════════════════════════════════════════════════════════╝
    `);

    console.log('📡 Endpoints disponíveis:');
    console.log('  GET  /api/status - Status da API');
    console.log('  GET  /api/health - Saúde do servidor');
    console.log('  POST /api/contato - Enviar mensagem de contato');
    console.log('  POST /api/doacao - Registrar doação');
    console.log('  GET  /api/cultos - Listar cultos');
    console.log('  POST /api/usuario/registrar - Registrar usuário');
});

// ==================== TRATAMENTO DE SHUTDOWN ====================

process.on('SIGTERM', () => {
    console.log('⚠️ SIGTERM recebido, encerrando graciosamente...');
    server.close(() => {
        console.log('✅ Servidor encerrado');
        mongoose.connection.close(false, () => {
            console.log('✅ Conexão com MongoDB fechada');
            process.exit(0);
        });
    });
});

// ==================== TRATAMENTO DE ERROS NÃO CAPTURADOS ====================

process.on('uncaughtException', (err) => {
    console.error('❌ Exceção não capturada:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Rejeição não tratada em:', promise, 'razão:', reason);
});

module.exports = app;
