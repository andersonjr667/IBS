/**
 * ==================== ROTAS DE CONTATO ====================
 * Arquivo: routes/contato.js
 * Descrição: Endpoints para mensagens de contato
 */

const express = require('express');
const router = express.Router();
const { Contato } = require('../models/index');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const {
    runtimeStore,
    isDatabaseReady,
    createRuntimeId,
    sendEmailSafe
} = require('../utils/runtimeSupport');

// ==================== POST - ENVIAR MENSAGEM DE CONTATO ====================

router.post('/',
    // Validação
    body('nome')
        .trim()
        .notEmpty().withMessage('Nome é obrigatório')
        .isLength({ max: 100 }).withMessage('Nome muito longo'),
    body('email')
        .trim()
        .isEmail().withMessage('Email inválido'),
    body('assunto')
        .trim()
        .notEmpty().withMessage('Assunto é obrigatório')
        .isLength({ max: 200 }).withMessage('Assunto muito longo'),
    body('mensagem')
        .trim()
        .notEmpty().withMessage('Mensagem é obrigatória')
        .isLength({ max: 5000 }).withMessage('Mensagem muito longa'),
    body('tipo')
        .optional()
        .isIn(['duvida', 'sugestao', 'reclamacao', 'elogio', 'outro']),

    asyncHandler(async (req, res) => {
        // Verificar validação
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const payload = {
            nome: req.body.nome,
            email: req.body.email,
            assunto: req.body.assunto,
            mensagem: req.body.mensagem,
            telefone: req.body.telefone || null,
            tipo: req.body.tipo || 'outro',
            enderecoIP: req.ip,
            userAgent: req.get('user-agent')
        };

        let novoContato;
        let armazenamento = 'memoria';

        if (isDatabaseReady()) {
            novoContato = new Contato(payload);
            await novoContato.save();
            armazenamento = 'database';
        } else {
            novoContato = {
                _id: createRuntimeId('contato'),
                ...payload,
                status: 'novo',
                dataEnvio: new Date()
            };
            runtimeStore.contatos.unshift(novoContato);
        }

        // Enviar email para admin
        const mailAdmin = {
            from: process.env.ADMIN_EMAIL,
            to: process.env.ADMIN_EMAIL,
            subject: `Novo Contato: ${req.body.assunto}`,
            html: `
                <h2>Nova Mensagem de Contato</h2>
                <p><strong>Nome:</strong> ${req.body.nome}</p>
                <p><strong>Email:</strong> ${req.body.email}</p>
                <p><strong>Telefone:</strong> ${req.body.telefone || 'Não informado'}</p>
                <p><strong>Assunto:</strong> ${req.body.assunto}</p>
                <p><strong>Tipo:</strong> ${req.body.tipo}</p>
                <hr>
                <p><strong>Mensagem:</strong></p>
                <p>${req.body.mensagem.replace(/\n/g, '<br>')}</p>
            `
        };

        await sendEmailSafe(mailAdmin);

        // Enviar email de confirmação para o usuário
        const mailUser = {
            from: process.env.ADMIN_EMAIL,
            to: req.body.email,
            subject: 'Recebemos sua mensagem - Igreja Batista Solidária',
            html: `
                <h2>Obrigado por entrar em contato!</h2>
                <p>Olá ${req.body.nome},</p>
                <p>Recebemos sua mensagem e entraremos em contato em breve.</p>
                <hr>
                <p><strong>Sua Mensagem:</strong></p>
                <p>${req.body.mensagem.replace(/\n/g, '<br>')}</p>
                <hr>
                <p>Igreja Batista Solidária<br>
                Rua Aiuruoca, 125 - Belo Horizonte - MG<br>
                Telefone: (31) 3041-0000</p>
            `
        };

        await sendEmailSafe(mailUser);

        res.status(201).json({
            success: true,
            message: 'Mensagem enviada com sucesso!',
            contatoId: novoContato._id,
            armazenamento
        });
    })
);

// ==================== GET - LISTAR MENSAGENS (ADMIN) ====================

router.get('/',
    authenticateToken,
    isAdmin,
    asyncHandler(async (req, res) => {
        const { status, tipo, pagina = 1, limite = 10 } = req.query;

        // Construir filtro
        const filtro = {};
        if (status) filtro.status = status;
        if (tipo) filtro.tipo = tipo;

        // Calcular skip
        const skip = (pagina - 1) * limite;

        // Buscar mensagens
        let mensagens;
        let total;

        if (isDatabaseReady()) {
            mensagens = await Contato.find(filtro)
                .sort({ dataEnvio: -1 })
                .skip(skip)
                .limit(parseInt(limite));

            total = await Contato.countDocuments(filtro);
        } else {
            const filtradas = runtimeStore.contatos.filter((contato) => {
                if (filtro.status && contato.status !== filtro.status) return false;
                if (filtro.tipo && contato.tipo !== filtro.tipo) return false;
                return true;
            });

            total = filtradas.length;
            mensagens = filtradas.slice(skip, skip + parseInt(limite, 10));
        }

        res.json({
            success: true,
            total,
            pagina: parseInt(pagina),
            limite: parseInt(limite),
            dados: mensagens
        });
    })
);

// ==================== GET - OBTER MENSAGEM ESPECÍFICA ====================

router.get('/:id',
    authenticateToken,
    isAdmin,
    asyncHandler(async (req, res) => {
        const contato = isDatabaseReady()
            ? await Contato.findById(req.params.id)
            : runtimeStore.contatos.find((item) => String(item._id) === String(req.params.id));

        if (!contato) {
            throw new AppError('Mensagem não encontrada', 404);
        }

        // Marcar como lida
        if (contato.status === 'novo') {
            contato.status = 'lido';
            if (isDatabaseReady()) {
                await contato.save();
            }
        }

        res.json({
            success: true,
            dados: contato
        });
    })
);

// ==================== PUT - RESPONDER MENSAGEM ====================

router.put('/:id/responder',
    authenticateToken,
    isAdmin,
    body('resposta').notEmpty().withMessage('Resposta é obrigatória'),
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const contato = isDatabaseReady()
            ? await Contato.findById(req.params.id)
            : runtimeStore.contatos.find((item) => String(item._id) === String(req.params.id));
        if (!contato) {
            throw new AppError('Mensagem não encontrada', 404);
        }

        // Atualizar resposta
        contato.resposta = {
            mensagem: req.body.resposta,
            respondidoEm: Date.now(),
            respondidoPor: req.user.id
        };
        contato.status = 'respondido';
        if (isDatabaseReady()) {
            await contato.save();
        }

        // Enviar email com resposta
        const mailResposta = {
            from: process.env.ADMIN_EMAIL,
            to: contato.email,
            subject: `Resposta: ${contato.assunto}`,
            html: `
                <h2>Resposta da Igreja Batista Solidária</h2>
                <p>Olá ${contato.nome},</p>
                <hr>
                <p>${req.body.resposta.replace(/\n/g, '<br>')}</p>
                <hr>
                <p>Igreja Batista Solidária<br>
                Rua Aiuruoca, 125 - Belo Horizonte - MG<br>
                Telefone: (31) 3041-0000</p>
            `
        };

        await sendEmailSafe(mailResposta);

        res.json({
            success: true,
            message: 'Resposta enviada com sucesso!',
            dados: contato
        });
    })
);

// ==================== DELETE - ARQUIVAR MENSAGEM ====================

router.delete('/:id',
    authenticateToken,
    isAdmin,
    asyncHandler(async (req, res) => {
        let contato;

        if (isDatabaseReady()) {
            contato = await Contato.findByIdAndUpdate(
                req.params.id,
                { status: 'arquivado' },
                { new: true }
            );
        } else {
            contato = runtimeStore.contatos.find((item) => String(item._id) === String(req.params.id));
            if (contato) {
                contato.status = 'arquivado';
            }
        }

        if (!contato) {
            throw new AppError('Mensagem não encontrada', 404);
        }

        res.json({
            success: true,
            message: 'Mensagem arquivada com sucesso'
        });
    })
);

module.exports = router;
