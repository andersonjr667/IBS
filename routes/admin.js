/**
 * ==================== ROTAS DE ADMINISTRADOR ====================
 * Arquivo: routes/admin.js
 * Descrição: Endpoints protegidos para administração
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { Contato, Doacao } = require('../models/index');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { isAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Aplicar middleware de verificação de admin em todas as rotas
router.use(isAdmin);

// ==================== DASHBOARD ====================

router.get('/dashboard',
    asyncHandler(async (req, res) => {
        const hoje = new Date();
        const umMesAtras = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Estatísticas de usuários
        const totalUsuarios = await User.countDocuments();
        const usuariosAtivos = await User.countDocuments({ ativo: true });

        // Estatísticas de contatos
        const contatosNovos = await Contato.countDocuments({ status: 'novo' });
        const totalContatos = await Contato.countDocuments();

        // Estatísticas de doações
        const totalDoacoesMes = await Doacao.aggregate([
            {
                $match: {
                    dataCriacao: { $gte: umMesAtras },
                    status: 'confirmada'
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$valor' },
                    quantidade: { $sum: 1 }
                }
            }
        ]);

        res.json({
            success: true,
            dashboard: {
                usuarios: {
                    total: totalUsuarios,
                    ativos: usuariosAtivos
                },
                contatos: {
                    novos: contatosNovos,
                    total: totalContatos
                },
                doações: {
                    totalMes: totalDoacoesMes[0]?.total || 0,
                    quantidadeMes: totalDoacoesMes[0]?.quantidade || 0
                },
                timestamp: new Date()
            }
        });
    })
);

// ==================== GERENCIAR USUÁRIOS ====================

router.get('/usuarios',
    asyncHandler(async (req, res) => {
        const { role, ativo, pagina = 1, limite = 10 } = req.query;

        const filtro = {};
        if (role) filtro.role = role;
        if (ativo !== undefined) filtro.ativo = ativo === 'true';

        const skip = (pagina - 1) * limite;

        const usuarios = await User.find(filtro)
            .select('-senha')
            .skip(skip)
            .limit(parseInt(limite))
            .sort({ dataCriacao: -1 });

        const total = await User.countDocuments(filtro);

        res.json({
            success: true,
            total,
            pagina: parseInt(pagina),
            limite: parseInt(limite),
            dados: usuarios
        });
    })
);

// ==================== CRIAR USUÁRIO ADMIN ====================

router.post('/usuarios/criar',
    body('nome').notEmpty(),
    body('email').isEmail(),
    body('senha').isLength({ min: 6 }),
    body('role').isIn(['usuario', 'moderador', 'pastor', 'admin']),

    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        // Verificar se email já existe
        const usuarioExistente = await User.findOne({ email: req.body.email });
        if (usuarioExistente) {
            throw new AppError('Email já cadastrado', 400);
        }

        const novoUsuario = new User({
            nome: req.body.nome,
            email: req.body.email,
            senha: req.body.senha,
            senhaConfirmacao: req.body.senha,
            role: req.body.role,
            ativo: true
        });

        await novoUsuario.save();

        res.status(201).json({
            success: true,
            message: 'Usuário criado com sucesso',
            usuario: {
                id: novoUsuario._id,
                nome: novoUsuario.nome,
                email: novoUsuario.email,
                role: novoUsuario.role
            }
        });
    })
);

// ==================== ATUALIZAR USUÁRIO ====================

router.put('/usuarios/:id',
    asyncHandler(async (req, res) => {
        const { nome, role, ativo } = req.body;

        const atualizacoes = {};
        if (nome) atualizacoes.nome = nome;
        if (role) atualizacoes.role = role;
        if (ativo !== undefined) atualizacoes.ativo = ativo;

        const usuario = await User.findByIdAndUpdate(
            req.params.id,
            atualizacoes,
            { new: true }
        ).select('-senha');

        if (!usuario) {
            throw new AppError('Usuário não encontrado', 404);
        }

        res.json({
            success: true,
            message: 'Usuário atualizado',
            usuario
        });
    })
);

// ==================== DELETAR/DESATIVAR USUÁRIO ====================

router.delete('/usuarios/:id',
    asyncHandler(async (req, res) => {
        const usuario = await User.findByIdAndUpdate(
            req.params.id,
            { ativo: false },
            { new: true }
        );

        if (!usuario) {
            throw new AppError('Usuário não encontrado', 404);
        }

        res.json({
            success: true,
            message: 'Usuário desativado'
        });
    })
);

// ==================== RELATÓRIO DE DADOS ====================

router.get('/relatorio/exportar',
    asyncHandler(async (req, res) => {
        const { tipo, dataDe, dataAte } = req.query;

        let dados;
        const filtro = {};

        if (dataDe || dataAte) {
            filtro.dataCriacao = {};
            if (dataDe) filtro.dataCriacao.$gte = new Date(dataDe);
            if (dataAte) filtro.dataCriacao.$lte = new Date(dataAte);
        }

        if (tipo === 'contatos') {
            dados = await Contato.find(filtro).lean();
        } else if (tipo === 'doacoes') {
            dados = await Doacao.find(filtro).lean();
        } else if (tipo === 'usuarios') {
            dados = await User.find().select('-senha').lean();
        } else {
            throw new AppError('Tipo de relatório inválido', 400);
        }

        res.json({
            success: true,
            tipo,
            quantidade: dados.length,
            dados
        });
    })
);

// ==================== LOGS E AUDITORIA ====================

router.get('/logs',
    asyncHandler(async (req, res) => {
        // Aqui você pode implementar um sistema de logs
        res.json({
            success: true,
            message: 'Sistema de logs não implementado ainda',
            sugestao: 'Considere usar Winston ou Bunyan para logging'
        });
    })
);

// ==================== CONFIGURAÇÕES DO SISTEMA ====================

router.get('/configuracoes',
    asyncHandler(async (req, res) => {
        res.json({
            success: true,
            configuracoes: {
                nomeSite: process.env.CHURCH_NAME,
                email: process.env.ADMIN_EMAIL,
                ambiente: process.env.NODE_ENV,
                versao: '1.0.0',
                databsae: process.env.MONGODB_URI.split('//')[1] || 'local',
                apiUrl: process.env.BACKEND_URL
            }
        });
    })
);

// ==================== ESTATÍSTICAS GERAIS ====================

router.get('/estatisticas',
    asyncHandler(async (req, res) => {
        const hoje = new Date();
        const umMesAtras = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
        const umAnoAtras = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate());

        // Doações
        const doacoesMes = await Doacao.aggregate([
            { $match: { dataCriacao: { $gte: umMesAtras }, status: 'confirmada' } },
            { $group: { _id: null, total: { $sum: '$valor' } } }
        ]);

        const doacoesAno = await Doacao.aggregate([
            { $match: { dataCriacao: { $gte: umAnoAtras }, status: 'confirmada' } },
            { $group: { _id: null, total: { $sum: '$valor' } } }
        ]);

        // Contatos
        const contatosMes = await Contato.countDocuments({
            dataEnvio: { $gte: umMesAtras }
        });

        const contatosAno = await Contato.countDocuments({
            dataEnvio: { $gte: umAnoAtras }
        });

        // Usuários
        const usuariosMes = await User.countDocuments({
            dataCriacao: { $gte: umMesAtras }
        });

        res.json({
            success: true,
            periodo: {
                mes: {
                    doacoes: doacoesMes[0]?.total || 0,
                    contatos: contatosMes,
                    novoUsuarios: usuariosMes
                },
                ano: {
                    doacoes: doacoesAno[0]?.total || 0,
                    contatos: contatosAno
                }
            },
            timestamp: new Date()
        });
    })
);

module.exports = router;
