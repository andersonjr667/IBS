/**
 * ==================== ROTAS DE DOAÇÃO ====================
 * Arquivo: routes/doacao.js
 * Descrição: Endpoints para gerenciar doações
 */

const express = require('express');
const router = express.Router();
const { Doacao } = require('../models/index');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const {
    runtimeStore,
    isDatabaseReady,
    createRuntimeId,
    sendEmailSafe
} = require('../utils/runtimeSupport');

// ==================== POST - REGISTRAR DOAÇÃO ====================

router.post('/registrar',
    body('doador.nome').notEmpty().withMessage('Nome é obrigatório'),
    body('doador.email').isEmail().withMessage('Email inválido'),
    body('valor')
        .isFloat({ min: 0.01 }).withMessage('Valor deve ser maior que zero'),
    body('tipo').isIn(['pix', 'cartao', 'transferencia', 'boleto', 'presencial']),
    body('categoria').optional().isIn(['dizimo', 'oferta', 'projeto_social', 'manutencao', 'outro']),

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
            doador: {
                nome: req.body.doador.nome,
                email: req.body.doador.email,
                telefone: req.body.doador.telefone || null,
                userId: req.user ? req.user.id : null
            },
            valor: req.body.valor,
            tipo: req.body.tipo,
            categoria: req.body.categoria || 'oferta',
            mensagem: req.body.mensagem || null,
            recorrente: req.body.recorrente || false,
            frequenciaRecorrencia: req.body.frequenciaRecorrencia || 'mensal',
            permitePublicar: req.body.permitePublicar || false
        };

        let novaDoacao;
        let armazenamento = 'memoria';

        if (isDatabaseReady()) {
            novaDoacao = new Doacao(payload);
            await novaDoacao.save();
            armazenamento = 'database';
        } else {
            novaDoacao = {
                _id: createRuntimeId('doacao'),
                ...payload,
                status: 'pendente',
                dataCriacao: new Date()
            };
            runtimeStore.doacoes.unshift(novaDoacao);
        }

        // Enviar email de confirmação
        const mailDoador = {
            from: process.env.ADMIN_EMAIL,
            to: req.body.doador.email,
            subject: 'Doação Registrada - Igreja Batista Solidária',
            html: `
                <h2>Obrigado por sua Generosidade!</h2>
                <p>Olá ${req.body.doador.nome},</p>
                <p>Sua doação foi registrada com sucesso em nossa plataforma.</p>
                <hr>
                <h3>Detalhes da Doação:</h3>
                <p><strong>Valor:</strong> R$ ${req.body.valor.toFixed(2)}</p>
                <p><strong>Tipo:</strong> ${req.body.tipo}</p>
                <p><strong>Categoria:</strong> ${req.body.categoria || 'Oferta'}</p>
                <p><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
                <p><strong>Comprovante:</strong> ${novaDoacao._id}</p>
                <hr>
                <p>Sua generosidade é fundamental para que possamos continuar nossa missão de renovação espiritual e ação social.</p>
                <p><strong>"Quem dá, não tira a perda, e quem guarda não colhe." Provérbios 11:24</strong></p>
                <hr>
                <p>Igreja Batista Solidária<br>
                Rua Aiuruoca, 125 - Belo Horizonte - MG<br>
                Telefone: (31) 3041-0000</p>
                <p><small>Data do comprovante: ${new Date().toLocaleString('pt-BR')}</small></p>
            `
        };

        await sendEmailSafe(mailDoador);

        // Notificar admin
        const mailAdmin = {
            from: process.env.ADMIN_EMAIL,
            to: process.env.ADMIN_EMAIL,
            subject: `Nova Doação: R$ ${req.body.valor.toFixed(2)}`,
            html: `
                <h2>Nova Doação Recebida</h2>
                <p><strong>Doador:</strong> ${req.body.doador.nome}</p>
                <p><strong>Email:</strong> ${req.body.doador.email}</p>
                <p><strong>Valor:</strong> R$ ${req.body.valor.toFixed(2)}</p>
                <p><strong>Tipo:</strong> ${req.body.tipo}</p>
                <p><strong>Categoria:</strong> ${req.body.categoria || 'Oferta'}</p>
                <p><strong>Recorrente:</strong> ${req.body.recorrente ? 'Sim - ' + req.body.frequenciaRecorrencia : 'Não'}</p>
                <p><strong>Mensagem:</strong> ${req.body.mensagem || 'Nenhuma'}</p>
            `
        };

        await sendEmailSafe(mailAdmin);

        res.status(201).json({
            success: true,
            message: 'Doação registrada com sucesso! Obrigado pela generosidade.',
            dadosDoacao: {
                id: novaDoacao._id,
                valor: novaDoacao.valor,
                comprovante: novaDoacao._id
            },
            armazenamento
        });
    })
);

// ==================== GET - LISTAR DOAÇÕES (ADMIN) ====================

router.get('/',
    authenticateToken,
    isAdmin,
    asyncHandler(async (req, res) => {
        const { status, tipo, categoria, dataDe, dataAte, pagina = 1, limite = 10 } = req.query;

        const filtro = {};
        if (status) filtro.status = status;
        if (tipo) filtro.tipo = tipo;
        if (categoria) filtro.categoria = categoria;

        if (dataDe || dataAte) {
            filtro.dataCriacao = {};
            if (dataDe) filtro.dataCriacao.$gte = new Date(dataDe);
            if (dataAte) filtro.dataCriacao.$lte = new Date(dataAte);
        }

        const skip = (pagina - 1) * limite;

        let doacoes;
        let total;
        let totalArrecadado = [{ total: 0 }];

        if (isDatabaseReady()) {
            doacoes = await Doacao.find(filtro)
                .sort({ dataCriacao: -1 })
                .skip(skip)
                .limit(parseInt(limite))
                .lean();

            total = await Doacao.countDocuments(filtro);

            totalArrecadado = await Doacao.aggregate([
                { $match: { ...filtro, status: 'confirmada' } },
                { $group: { _id: null, total: { $sum: '$valor' } } }
            ]);
        } else {
            const filtradas = runtimeStore.doacoes.filter((doacao) => {
                if (filtro.status && doacao.status !== filtro.status) return false;
                if (filtro.tipo && doacao.tipo !== filtro.tipo) return false;
                if (filtro.categoria && doacao.categoria !== filtro.categoria) return false;
                return true;
            });

            total = filtradas.length;
            doacoes = filtradas.slice(skip, skip + parseInt(limite, 10));
            totalArrecadado = [{
                total: runtimeStore.doacoes
                    .filter((doacao) => doacao.status === 'confirmada')
                    .reduce((acc, doacao) => acc + Number(doacao.valor || 0), 0)
            }];
        }

        res.json({
            success: true,
            total,
            totalArrecadado: totalArrecadado[0]?.total || 0,
            pagina: parseInt(pagina),
            limite: parseInt(limite),
            dados: doacoes
        });
    })
);

// ==================== GET - ESTATÍSTICAS DE DOAÇÕES ====================

router.get('/estatisticas/dashboard',
    authenticateToken,
    isAdmin,
    asyncHandler(async (req, res) => {
        const hoje = new Date();
        const umMesAtras = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Doações do mês
        let doacoesMes;
        let doacoesPorTipo;
        let doacoesPorCategoria;
        let doacoesRecorrentes;

        if (isDatabaseReady()) {
            doacoesMes = await Doacao.aggregate([
                {
                    $match: {
                        dataCriacao: { $gte: umMesAtras }
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

            doacoesPorTipo = await Doacao.aggregate([
                {
                    $group: {
                        _id: '$tipo',
                        quantidade: { $sum: 1 },
                        total: { $sum: '$valor' }
                    }
                }
            ]);

            doacoesPorCategoria = await Doacao.aggregate([
                {
                    $group: {
                        _id: '$categoria',
                        quantidade: { $sum: 1 },
                        total: { $sum: '$valor' }
                    }
                }
            ]);

            doacoesRecorrentes = await Doacao.countDocuments({ recorrente: true });
        } else {
            const recentes = runtimeStore.doacoes.filter((doacao) => new Date(doacao.dataCriacao) >= umMesAtras);
            doacoesMes = [{
                total: recentes.reduce((acc, doacao) => acc + Number(doacao.valor || 0), 0),
                quantidade: recentes.length
            }];

            const agrupar = (campo) => Object.values(runtimeStore.doacoes.reduce((acc, item) => {
                const chave = item[campo] || 'outro';
                acc[chave] = acc[chave] || { _id: chave, quantidade: 0, total: 0 };
                acc[chave].quantidade += 1;
                acc[chave].total += Number(item.valor || 0);
                return acc;
            }, {}));

            doacoesPorTipo = agrupar('tipo');
            doacoesPorCategoria = agrupar('categoria');
            doacoesRecorrentes = runtimeStore.doacoes.filter((doacao) => doacao.recorrente).length;
        }

        res.json({
            success: true,
            doacoesMes: doacoesMes[0] || { total: 0, quantidade: 0 },
            doacoesPorTipo,
            doacoesPorCategoria,
            doacoesRecorrentes,
            timestamp: new Date()
        });
    })
);

// ==================== PUT - CONFIRMAR PAGAMENTO ====================

router.put('/:id/confirmar',
    authenticateToken,
    isAdmin,
    asyncHandler(async (req, res) => {
        let doacao;

        if (isDatabaseReady()) {
            doacao = await Doacao.findByIdAndUpdate(
                req.params.id,
                { status: 'confirmada' },
                { new: true }
            );
        } else {
            doacao = runtimeStore.doacoes.find((item) => String(item._id) === String(req.params.id));
            if (doacao) {
                doacao.status = 'confirmada';
            }
        }

        if (!doacao) {
            throw new AppError('Doação não encontrada', 404);
        }

        res.json({
            success: true,
            message: 'Doação confirmada com sucesso',
            dados: doacao
        });
    })
);

// ==================== DELETE - CANCELAR DOAÇÃO ====================

router.delete('/:id',
    authenticateToken,
    isAdmin,
    asyncHandler(async (req, res) => {
        let doacao;

        if (isDatabaseReady()) {
            doacao = await Doacao.findByIdAndUpdate(
                req.params.id,
                { status: 'cancelada' },
                { new: true }
            );
        } else {
            doacao = runtimeStore.doacoes.find((item) => String(item._id) === String(req.params.id));
            if (doacao) {
                doacao.status = 'cancelada';
            }
        }

        if (!doacao) {
            throw new AppError('Doação não encontrada', 404);
        }

        res.json({
            success: true,
            message: 'Doação cancelada'
        });
    })
);

module.exports = router;
