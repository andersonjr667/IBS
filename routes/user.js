/**
 * ==================== ROTAS DE USUÁRIO ====================
 * Arquivo: routes/user.js
 * Descrição: Endpoints públicos de usuário (registrar, login)
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { isDatabaseReady } = require('../utils/runtimeSupport');

function ensureDatabaseReady() {
    if (!isDatabaseReady()) {
        throw new AppError('Autenticação temporariamente indisponível. Tente novamente em instantes.', 503);
    }
}

// ==================== POST - REGISTRARSE ====================

router.post('/registrar',
    body('nome')
        .trim()
        .notEmpty().withMessage('Nome é obrigatório')
        .isLength({ min: 3, max: 50 }).withMessage('Nome deve ter entre 3 e 50 caracteres'),
    body('email')
        .trim()
        .isEmail().withMessage('Email inválido')
        .normalizeEmail(),
    body('senha')
        .isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres')
        .matches(/^(?=.*[A-Za-z])(?=.*\d)/).withMessage('Senha deve conter letras e números'),
    body('senhaConfirmacao'),

    asyncHandler(async (req, res) => {
        ensureDatabaseReady();
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        // Verificar se usuário já existe
        const usuarioExistente = await User.findOne({ email: req.body.email }).maxTimeMS(5000);
        if (usuarioExistente) {
            throw new AppError('Email já cadastrado', 400);
        }

        // Verificar se senhas coincidem
        if (req.body.senha !== req.body.senhaConfirmacao) {
            throw new AppError('Senhas não coincidem', 400);
        }

        // Criar novo usuário
        const novoUsuario = new User({
            nome: req.body.nome,
            email: req.body.email,
            senha: req.body.senha,
            senhaConfirmacao: req.body.senhaConfirmacao,
            telefone: req.body.telefone
        });

        await novoUsuario.save();

        // Gerar token
        const token = generateToken(novoUsuario);

        res.status(201).json({
            success: true,
            message: 'Usuário registrado com sucesso',
            token,
            usuario: {
                id: novoUsuario._id,
                nome: novoUsuario.nome,
                email: novoUsuario.email,
                role: novoUsuario.role
            }
        });
    })
);

// ==================== POST - LOGIN ====================

router.post('/login',
    body('email')
        .trim()
        .isEmail().withMessage('Email inválido'),
    body('senha')
        .notEmpty().withMessage('Senha é obrigatória'),

    asyncHandler(async (req, res) => {
        ensureDatabaseReady();
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        // Buscar usuário com timeout
        const usuario = await User.findOne({ email: req.body.email }).select('+senha').maxTimeMS(5000);
        if (!usuario) {
            throw new AppError('Email ou senha incorretos', 401);
        }

        // Verificar senha
        const senhaValida = await usuario.compararSenha(req.body.senha);
        if (!senhaValida) {
            throw new AppError('Email ou senha incorretos', 401);
        }

        // Verificar se usuário está ativo
        if (!usuario.ativo) {
            throw new AppError('Usuário inativo', 403);
        }

        // Gerar token
        const token = generateToken(usuario);

        // Registrar último login
        await usuario.registrarLogin();

        res.json({
            success: true,
            message: 'Login realizado com sucesso',
            token,
            usuario: {
                id: usuario._id,
                nome: usuario.nome,
                email: usuario.email,
                role: usuario.role
            }
        });
    })
);

// ==================== GET - PERFIL DO USUÁRIO ====================

router.get('/perfil/me',
    authenticateToken,
    asyncHandler(async (req, res) => {
        ensureDatabaseReady();
        const usuario = await User.findById(req.user.id);

        if (!usuario) {
            throw new AppError('Usuário não encontrado', 404);
        }

        res.json({
            success: true,
            usuario
        });
    })
);

// ==================== PUT - ATUALIZAR PERFIL ====================

router.put('/perfil/atualizar',
    authenticateToken,
    body('nome').optional().trim().isLength({ min: 3, max: 50 }),
    body('telefone').optional().trim(),
    body('bio').optional().trim().isLength({ max: 500 }),

    asyncHandler(async (req, res) => {
        ensureDatabaseReady();
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const atualizacoes = ['nome', 'telefone', 'bio', 'foto'];
        const dadosAtualizacao = {};

        atualizacoes.forEach(campo => {
            if (req.body[campo] !== undefined) {
                dadosAtualizacao[campo] = req.body[campo];
            }
        });

        const usuario = await User.findByIdAndUpdate(
            req.user.id,
            dadosAtualizacao,
            { new: true, runValidators: true }
        );

        res.json({
            success: true,
            message: 'Perfil atualizado com sucesso',
            usuario
        });
    })
);

// ==================== POST - ALTERAR SENHA ====================

router.post('/senha/alterar',
    authenticateToken,
    body('senhaAtual').notEmpty().withMessage('Senha atual é obrigatória'),
    body('novaSenha')
        .isLength({ min: 6 }).withMessage('Nova senha deve ter no mínimo 6 caracteres')
        .matches(/^(?=.*[A-Za-z])(?=.*\d)/).withMessage('Nova senha deve conter letras e números'),

    asyncHandler(async (req, res) => {
        ensureDatabaseReady();
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const usuario = await User.findById(req.user.id).select('+senha');

        // Verificar senha atual
        const senhaValida = await usuario.compararSenha(req.body.senhaAtual);
        if (!senhaValida) {
            throw new AppError('Senha atual incorreta', 401);
        }

        // Atualizar senha
        usuario.senha = req.body.novaSenha;
        usuario.senhaAlteradoEm = Date.now();
        await usuario.save();

        res.json({
            success: true,
            message: 'Senha alterada com sucesso'
        });
    })
);

// ==================== POST - LOGOUT ====================

router.post('/logout',
    authenticateToken,
    asyncHandler(async (req, res) => {
        // JWT é stateless, então o logout é apenas por parte do cliente
        res.json({
            success: true,
            message: 'Logout realizado com sucesso'
        });
    })
);

module.exports = router;
