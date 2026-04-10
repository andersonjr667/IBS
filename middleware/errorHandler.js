/**
 * ==================== MIDDLEWARE DE TRATAMENTO DE ERROS ====================
 * Arquivo: middleware/errorHandler.js
 * Descrição: Funções para tratamento centralizado de erros
 */

// ==================== CLASSE CUSTOMIZADA DE ERRO ====================

class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;

        Error.captureStackTrace(this, this.constructor);
    }
}

// ==================== HANDLER 404 ====================

const notFoundHandler = (req, res, next) => {
    const error = new AppError(
        `Rota não encontrada: ${req.originalUrl}`,
        404
    );
    next(error);
};

// ==================== HANDLER DE ERROS GLOBAL ====================

const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.message = err.message || 'Erro interno do servidor';

    // Log do erro
    console.error('❌ ERRO:', {
        message: err.message,
        statusCode: err.statusCode,
        name: err.name,
        stack: err.stack,
        timestamp: new Date().toISOString()
    });

    // Erro de timeout do MongoDB
    if (err.message && err.message.includes('buffering timed out')) {
        err.message = 'Banco de dados indisponível. Tente novamente em alguns instantes.';
        err.statusCode = 503;
    }

    // Erro de conexão MongoDB
    if (err.name === 'MongoServerError' || err.name === 'MongoError') {
        err.message = 'Erro ao conectar com o banco de dados. Tente novamente mais tarde.';
        err.statusCode = 503;
    }

    // Erro de validação do Mongoose
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(e => e.message);
        err.message = messages.join(', ');
        err.statusCode = 400;
    }

    // Erro de duplicata (E11000)
    if (err.code === 11000) {
        const field = Object.keys(err.keyPattern)[0];
        err.message = `${field} já existe no sistema`;
        err.statusCode = 400;
    }

    // Erro JWT
    if (err.name === 'JsonWebTokenError') {
        err.message = 'Token inválido';
        err.statusCode = 401;
    }

    if (err.name === 'TokenExpiredError') {
        err.message = 'Token expirado';
        err.statusCode = 401;
    }

    // Enviar resposta de erro
    res.status(err.statusCode).json({
        success: false,
        statusCode: err.statusCode,
        message: err.message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

// ==================== WRAPPER PARA ASYNC/AWAIT ====================

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// ==================== VALIDAR REQUISIÇÃO ====================

const validateRequest = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Dados inválidos',
                errors: error.details.map(d => d.message)
            });
        }

        req.body = value;
        next();
    };
};

module.exports = {
    AppError,
    errorHandler,
    notFoundHandler,
    asyncHandler,
    validateRequest
};
