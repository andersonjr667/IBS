/**
 * ==================== MIDDLEWARE DE AUTENTICAÇÃO ====================
 * Arquivo: middleware/auth.js
 * Descrição: Funções para autenticação JWT e verificação de permissões
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ==================== VERIFICAR TOKEN JWT ====================

const authenticateToken = (req, res, next) => {
    try {
        // Obter token do header
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token não fornecido'
            });
        }

        // Verificar token
        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
            if (err) {
                return res.status(403).json({
                    success: false,
                    message: 'Token inválido ou expirado'
                });
            }

            req.user = user;
            next();
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erro ao verificar autenticação',
            error: error.message
        });
    }
};

// ==================== VERIFICAR PERMISSÃO DE ADMIN ====================

const isAdmin = (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Usuário não autenticado'
            });
        }

        if (req.user.role !== 'admin' && req.user.role !== 'moderador') {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado: permissão de administrador necessária'
            });
        }

        next();
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erro ao verificar permissão',
            error: error.message
        });
    }
};

// ==================== VERIFICAR PERMISSÃO DE PASTOR ====================

const isPastor = (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Usuário não autenticado'
            });
        }

        if (req.user.role !== 'pastor' && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado: permissão de pastor necessária'
            });
        }

        next();
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erro ao verificar permissão',
            error: error.message
        });
    }
};

// ==================== GERAR TOKEN JWT ====================

const generateToken = (user) => {
    return jwt.sign(
        {
            id: user._id,
            email: user.email,
            nome: user.nome,
            role: user.role
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
};

// ==================== VERIFICAR OWNERSHIP (ID DO USUÁRIO) ====================

const checkOwnership = (req, res, next) => {
    try {
        const paramId = req.params.id || req.params.userId;
        const userId = req.user ? req.user.id : null;

        if (!userId || (userId !== paramId && req.user.role !== 'admin')) {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado: você não tem permissão para acessar este recurso'
            });
        }

        next();
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erro ao verificar propriedade',
            error: error.message
        });
    }
};

module.exports = {
    authenticateToken,
    isAdmin,
    isPastor,
    generateToken,
    checkOwnership
};
