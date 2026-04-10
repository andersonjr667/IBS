/**
 * ==================== ROTAS DE CULTOS ====================
 * Arquivo: routes/culto.js
 * Descrição: Endpoints para informações de cultos
 */

const express = require('express');
const router = express.Router();
const { Culto } = require('../models/index');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { runtimeStore, isDatabaseReady } = require('../utils/runtimeSupport');

const ordenarCultos = (cultos) => cultos.sort((a, b) => {
    if (a.diaSemana === b.diaSemana) {
        return a.horario.localeCompare(b.horario);
    }

    return a.diaSemana.localeCompare(b.diaSemana);
});

async function listarCultosAtivos() {
    if (!isDatabaseReady()) {
        return ordenarCultos(runtimeStore.cultos.filter((culto) => culto.ativo));
    }

    const cultos = await Culto.find({ ativo: true }).sort({ diaSemana: 1, horario: 1 }).lean();
    return cultos.length > 0 ? cultos : ordenarCultos(runtimeStore.cultos.filter((culto) => culto.ativo));
}

// ==================== GET - LISTAR TODOS OS CULTOS ====================

router.get('/',
    asyncHandler(async (req, res) => {
        const cultos = await listarCultosAtivos();

        res.json({
            success: true,
            total: cultos.length,
            dados: cultos
        });
    })
);

// ==================== GET - CULTOS POR DIA ====================

router.get('/dia/:dia',
    asyncHandler(async (req, res) => {
        const diasValidos = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sabado'];
        const dia = req.params.dia.toLowerCase();

        if (!diasValidos.includes(dia)) {
            throw new AppError('Dia inválido', 400);
        }

        const cultos = (await listarCultosAtivos())
            .filter((culto) => culto.diaSemana === dia)
            .sort((a, b) => a.horario.localeCompare(b.horario));

        if (cultos.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Nenhum culto encontrado para ${dia}`
            });
        }

        res.json({
            success: true,
            dia,
            total: cultos.length,
            dados: cultos
        });
    })
);

// ==================== GET - PRÓXIMO CULTO ====================

router.get('/proximo/agora',
    asyncHandler(async (req, res) => {
        const hoje = new Date();
        const diasSemana = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sabado'];
        const diaAtual = diasSemana[hoje.getDay()];
        const horaAtual = `${String(hoje.getHours()).padStart(2, '0')}:${String(hoje.getMinutes()).padStart(2, '0')}`;

        // Buscar cultos do dia atual a partir da hora atual
        const cultosHoje = (await listarCultosAtivos())
            .filter((culto) => culto.diaSemana === diaAtual && culto.horario >= horaAtual)
            .sort((a, b) => a.horario.localeCompare(b.horario));

        if (cultosHoje.length > 0) {
            return res.json({
                success: true,
                message: 'Próximo culto hoje',
                dados: cultosHoje[0]
            });
        }

        // Se não houver cultos hoje, buscar próximo dia
        for (let i = 1; i < 7; i++) {
            const proximoDia = new Date(hoje);
            proximoDia.setDate(proximoDia.getDate() + i);
            const diaProximo = diasSemana[proximoDia.getDay()];

            const cultos = (await listarCultosAtivos())
                .filter((culto) => culto.diaSemana === diaProximo)
                .sort((a, b) => a.horario.localeCompare(b.horario));

            if (cultos.length > 0) {
                return res.json({
                    success: true,
                    proximoEm: `${i} dia(s)`,
                    dados: cultos[0]
                });
            }
        }

        res.status(404).json({
            success: false,
            message: 'Nenhum culto encontrado'
        });
    })
);

// ==================== POST - CRIAR CULTO (ADMIN) ====================

router.post('/',
    authenticateToken,
    isAdmin,
    body('nome').notEmpty().withMessage('Nome é obrigatório'),
    body('diaSemana').isIn(['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sabado']),
    body('horario').matches(/^\d{2}:\d{2}$/).withMessage('Formato HH:MM'),
    body('tipo').optional().isIn(['celebracao', 'familia', 'oracao', 'doutrina', 'jovens', 'criancas', 'adoro', 'outro']),

    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        // Verificar se já existe culto nesse horário e dia
        const cultoExistente = await Culto.findOne({
            diaSemana: req.body.diaSemana,
            horario: req.body.horario,
            ativo: true
        });

        if (cultoExistente) {
            throw new AppError('Já existe um culto neste horário', 400);
        }

        const novoCulto = new Culto({
            nome: req.body.nome,
            descricao: req.body.descricao,
            diaSemana: req.body.diaSemana,
            horario: req.body.horario,
            tipo: req.body.tipo || 'celebracao',
            local: {
                endereco: req.body.local?.endereco,
                sala: req.body.local?.sala,
                latitude: req.body.local?.latitude,
                longitude: req.body.local?.longitude
            },
            ministro: {
                nome: req.body.ministro?.nome,
                funcao: req.body.ministro?.funcao
            },
            transmissaoAoVivo: req.body.transmissaoAoVivo || false,
            linkTransmissao: req.body.linkTransmissao
        });

        await novoCulto.save();

        res.status(201).json({
            success: true,
            message: 'Culto criado com sucesso',
            dados: novoCulto
        });
    })
);

// ==================== PUT - ATUALIZAR CULTO (ADMIN) ====================

router.put('/:id',
    authenticateToken,
    isAdmin,
    asyncHandler(async (req, res) => {
        const campos = [
            'nome', 'descricao', 'diaSemana', 'horario',
            'tipo', 'local', 'ministro', 'transmissaoAoVivo',
            'linkTransmissao', 'participantes', 'ativo'
        ];

        const atualizacoes = {};
        campos.forEach(campo => {
            if (req.body[campo] !== undefined) {
                atualizacoes[campo] = req.body[campo];
            }
        });

        const culto = await Culto.findByIdAndUpdate(
            req.params.id,
            atualizacoes,
            { new: true, runValidators: true }
        );

        if (!culto) {
            throw new AppError('Culto não encontrado', 404);
        }

        res.json({
            success: true,
            message: 'Culto atualizado com sucesso',
            dados: culto
        });
    })
);

// ==================== DELETE - DESATIVAR CULTO (ADMIN) ====================

router.delete('/:id',
    authenticateToken,
    isAdmin,
    asyncHandler(async (req, res) => {
        const culto = await Culto.findByIdAndUpdate(
            req.params.id,
            { ativo: false },
            { new: true }
        );

        if (!culto) {
            throw new AppError('Culto não encontrado', 404);
        }

        res.json({
            success: true,
            message: 'Culto desativado com sucesso'
        });
    })
);

// ==================== PUT - ATUALIZAR PARTICIPANTES ====================

router.put('/:id/participantes',
    asyncHandler(async (req, res) => {
        const { quantidade } = req.body;

        if (!Number.isInteger(quantidade) || quantidade < 0) {
            throw new AppError('Quantidade inválida', 400);
        }

        const culto = await Culto.findByIdAndUpdate(
            req.params.id,
            { participantes: quantidade },
            { new: true }
        );

        if (!culto) {
            throw new AppError('Culto não encontrado', 404);
        }

        res.json({
            success: true,
            message: 'Participantes atualizados',
            dados: culto
        });
    })
);

// ==================== GET - CULTOS PELO FILTRO (ADMIN) ====================

router.get('/admin/filtro',
    authenticateToken,
    isAdmin,
    asyncHandler(async (req, res) => {
        const { tipo, ativo, pagina = 1, limite = 10 } = req.query;

        const filtro = {};
        if (tipo) filtro.tipo = tipo;
        if (ativo !== undefined) filtro.ativo = ativo === 'true';

        const skip = (pagina - 1) * limite;

        const cultos = await Culto.find(filtro)
            .skip(skip)
            .limit(parseInt(limite));

        const total = await Culto.countDocuments(filtro);

        res.json({
            success: true,
            total,
            pagina: parseInt(pagina),
            limite: parseInt(limite),
            dados: cultos
        });
    })
);

module.exports = router;
