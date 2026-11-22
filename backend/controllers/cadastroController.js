const { query, all, get } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { enviarEmailCadastro, enviarEmailConfirmacao } = require('../services/emailService');

// Salvar backup em JSON
function salvarBackupJSON(dados) {
    // Em produção, os dados já estão persistidos no PostgreSQL; não criar cópias locais de dados pessoais.
    if (process.env.NODE_ENV === 'production' && process.env.BACKUP_JSON_ENABLED !== 'true') return;
    try {
        const backupDir = process.env.DATA_BACKUP_DIR || './data-backup';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `cadastro_${timestamp}_${dados.id}.json`;
        const filepath = path.join(backupDir, filename);

        fs.writeFileSync(filepath, JSON.stringify(dados, null, 2), 'utf-8');
        console.log(`📝 Backup salvo: ${filename}`);
    } catch (error) {
        console.error('Erro ao salvar backup JSON:', error);
    }
}

// Criar novo cadastro
exports.criarCadastro = async (req, res) => {
    const startTime = Date.now();
    console.log('\n' + '='.repeat(60));
    console.log('📥 [CADASTRO] Nova requisição recebida');
    console.log('   IP:', req.ip);
    console.log('   Hora:', new Date().toLocaleString('pt-BR'));
    
    try {
        const {
            nomeCompleto,
            nomePai,
            nomeMae,
            dataNascimento,
            sexo,
            estadoCivil,
            nacionalidade,
            naturalidade,
            formacao,
            profissao,
            documentos,
            numeroIdentificacao,
            validadeAte,
            ruaAvenida,
            quarteirao,
            bairro,
            celular,
            email,
            localServico,
            grauParentesco,
            motivacao,
            aceiteDeclaracao
        } = req.body;

        // 🔴 VALIDAÇÃO 1: Validar campos obrigatórios e tipo
        const erros = [];
        
        if (!nomeCompleto || typeof nomeCompleto !== 'string' || nomeCompleto.trim() === '') {
            erros.push('nomeCompleto é obrigatório e deve ser texto');
        }
        if (!nomeMae || typeof nomeMae !== 'string' || nomeMae.trim() === '') {
            erros.push('nomeMae é obrigatório e deve ser texto');
        }
        if (!numeroIdentificacao || typeof numeroIdentificacao !== 'string' || numeroIdentificacao.trim() === '') {
            erros.push('numeroIdentificacao é obrigatório e deve ser texto');
        }
        if (!celular || typeof celular !== 'string' || celular.trim() === '') {
            erros.push('celular é obrigatório e deve ser texto');
        }
        if (!dataNascimento || typeof dataNascimento !== 'string' || dataNascimento.trim() === '') {
            erros.push('dataNascimento é obrigatório e deve ser data (YYYY-MM-DD)');
        } else {
            // Validar formato de data
            const dataRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dataRegex.test(dataNascimento.trim())) {
                erros.push('dataNascimento deve estar no formato YYYY-MM-DD');
            }
        }
        if (!sexo || !['masculino', 'feminino'].includes(sexo)) {
            erros.push('sexo é obrigatório e deve ser "masculino" ou "feminino"');
        }
        if (!estadoCivil || typeof estadoCivil !== 'string' || estadoCivil.trim() === '') {
            erros.push('estadoCivil é obrigatório');
        }
        if (!nacionalidade || typeof nacionalidade !== 'string' || nacionalidade.trim() === '') {
            erros.push('nacionalidade é obrigatório');
        }
        if (!naturalidade || typeof naturalidade !== 'string' || naturalidade.trim() === '') {
            erros.push('naturalidade é obrigatório');
        }
        if (!aceiteDeclaracao) {
            erros.push('Você deve aceitar a declaração');
        }
        
        // Validar email se fornecido
        if (email && typeof email === 'string' && email.trim() !== '') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email.trim())) {
                erros.push('email deve estar em um formato válido (exemplo@dominio.com)');
            }
        }

        if (erros.length > 0) {
            console.log('❌ [VALIDAÇÃO] Erros encontrados:');
            erros.forEach(e => console.log('   -', e));
            return res.status(400).json({
                error: 'Validação falhou',
                detalhes: erros
            });
        }
        
        console.log('✅ [VALIDAÇÃO] Todos os campos estão corretos');

        // 🔴 VALIDAÇÃO 2: Verificar se numero_identificacao já existe
        console.log('🔍 [BD] Verificando se número de ID já existe:', numeroIdentificacao);
        const existente = await get(
            'SELECT id FROM cadastros WHERE numero_identificacao = ?',
            [numeroIdentificacao.trim()]
        );

        if (existente) {
            console.log('❌ [BD] Número de ID duplicado!');
            return res.status(409).json({
                error: 'Este número de identificação já está cadastrado'
            });
        }
        
        console.log('✅ [BD] Número de ID é único');

        const id = uuidv4();
        const ipOrigem = req.ip || req.connection?.remoteAddress || 'unknown';
        const userAgent = req.get('user-agent') || 'unknown';

        // 🔴 VALIDAÇÃO 3: Inserir no banco de dados com tratamento de erro
        try {
            console.log('💾 [BD] Iniciando inserção no banco de dados...');
            await query(
                `INSERT INTO cadastros (
                    id, nome_completo, nome_pai, nome_mae, data_nascimento, sexo,
                    estado_civil, nacionalidade, naturalidade, formacao, profissao,
                    documentos, numero_identificacao, validade_ate, rua_avenida,
                    quarteirao, bairro, celular, email, local_servico, grau_parentesco,
                    motivacao, aceite_declaracao, ip_origem, user_agent
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )`,
                [
                    id,
                    nomeCompleto.trim(),
                    nomePai ? nomePai.trim() : null,
                    nomeMae.trim(),
                    dataNascimento.trim(),
                    sexo.trim(),
                    estadoCivil.trim(),
                    nacionalidade.trim(),
                    naturalidade.trim(),
                    formacao ? formacao.trim() : null,
                    profissao ? profissao.trim() : null,
                    documentos && Array.isArray(documentos) ? JSON.stringify(documentos) : null,
                    numeroIdentificacao.trim(),
                    validadeAte ? validadeAte.trim() : null,
                    ruaAvenida ? ruaAvenida.trim() : null,
                    quarteirao ? quarteirao.trim() : null,
                    bairro ? bairro.trim() : null,
                    celular.trim(),
                    email ? email.trim() : null,
                    localServico ? localServico.trim() : null,
                    grauParentesco ? grauParentesco.trim() : null,
                    motivacao ? motivacao.trim() : null,
                    Boolean(aceiteDeclaracao),
                    ipOrigem,
                    userAgent
                ]
            );
        } catch (dbError) {
            console.error('❌ [BD] Erro ao inserir no banco:', dbError.message);
            console.error('   Stack:', dbError.stack);
            return res.status(500).json({
                error: 'Erro ao salvar cadastro no banco de dados',
                details: dbError.message
            });
        }

        // Buscar o registro inserido
        console.log('🔍 [BD] Buscando registro inserido...');
        const dados = await get(
            'SELECT * FROM cadastros WHERE id = ?',
            [id]
        );
        
        if (!dados) {
            console.error('❌ [BD] Não foi possível recuperar o registro inserido!');
            return res.status(500).json({
                error: 'Registro inserido mas não foi recuperado',
                id: id
            });
        }
        
        console.log('✅ [BD] Registro inserido com sucesso');

        // Salvar backup em JSON
        console.log('📝 [BACKUP] Salvando backup JSON...');
        salvarBackupJSON(dados);

        // O cadastro já está persistido. Aguarda a tentativa de notificação para
        // informar correctamente ao frontend se o email foi ou não enviado.
        console.log('📧 [EMAIL] A enviar notificação para a AJOV...');
        const emailAdminEnviado = await enviarEmailCadastro(dados);
        let emailConfirmacaoEnviado = null;
        if (email && emailAdminEnviado) {
            emailConfirmacaoEnviado = await enviarEmailConfirmacao(email, nomeCompleto);
        }
        if (!emailAdminEnviado) {
            console.error('❌ [EMAIL] Cadastro guardado, mas a notificação para AJOV não foi enviada.');
        }

        const elapsed = Date.now() - startTime;
        console.log('✅ [CADASTRO] Cadastro finalizado com sucesso em', elapsed, 'ms');
        console.log('='.repeat(60) + '\n');

        res.status(201).json({
            success: true,
            message: emailAdminEnviado ? 'Cadastro recebido e notificação enviada à AJOV.' : 'Cadastro guardado, mas não foi possível enviar a notificação por email.',
            emailAdminEnviado,
            emailConfirmacaoEnviado,
            data: {
                id: dados.id,
                nome: dados.nome_completo,
                email: dados.email,
                data_criacao: dados.data_criacao
            }
        });

    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.error('❌ [ERRO] Erro geral ao criar cadastro:', error.message);
        console.error('   Stack:', error.stack);
        console.error('   Tempo decorrido:', elapsed, 'ms');
        console.log('='.repeat(60) + '\n');
        
        res.status(500).json({
            error: 'Erro ao processar cadastro',
            details: error.message
        });
    }
};

// Listar todos os cadastros
exports.listarCadastros = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // Total de registros
        const countResult = await get('SELECT COUNT(*) as count FROM cadastros');
        const total = Number(countResult.count || 0);

        // Registros da página
        const resultado = await all(
            `SELECT id, nome_completo, celular, email, data_criacao 
             FROM cadastros 
             ORDER BY data_criacao DESC 
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        res.json({
            success: true,
            data: resultado,
            paginacao: {
                total,
                pagina: page,
                limite: limit,
                total_paginas: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Erro ao listar cadastros:', error);
        res.status(500).json({
            error: 'Erro ao listar cadastros',
            details: error.message
        });
    }
};

// Obter cadastro por ID
exports.obterCadastro = async (req, res) => {
    try {
        const { id } = req.params;

        const resultado = await get(
            'SELECT * FROM cadastros WHERE id = ?',
            [id]
        );

        if (!resultado) {
            return res.status(404).json({
                error: 'Cadastro não encontrado'
            });
        }

        res.json({
            success: true,
            data: resultado
        });

    } catch (error) {
        console.error('Erro ao obter cadastro:', error);
        res.status(500).json({
            error: 'Erro ao obter cadastro',
            details: error.message
        });
    }
};

// Atualizar cadastro
exports.atualizarCadastro = async (req, res) => {
    try {
        const { id } = req.params;
        const { celular, email, localServico } = req.body;

        // Verificar se existe
        const existe = await get('SELECT id FROM cadastros WHERE id = ?', [id]);
        if (!existe) {
            return res.status(404).json({ error: 'Cadastro não encontrado' });
        }

        await query(
            `UPDATE cadastros 
             SET celular = COALESCE(?, celular),
                 email = COALESCE(?, email),
                 local_servico = COALESCE(?, local_servico),
                 data_atualizacao = datetime('now')
             WHERE id = ?`,
            [celular || null, email || null, localServico || null, id]
        );

        const resultado = await get('SELECT * FROM cadastros WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Cadastro atualizado com sucesso',
            data: resultado
        });

    } catch (error) {
        console.error('Erro ao atualizar cadastro:', error);
        res.status(500).json({
            error: 'Erro ao atualizar cadastro',
            details: error.message
        });
    }
};

// Deletar cadastro
exports.deletarCadastro = async (req, res) => {
    try {
        const { id } = req.params;

        const existe = await get('SELECT id FROM cadastros WHERE id = ?', [id]);
        if (!existe) {
            return res.status(404).json({
                error: 'Cadastro não encontrado'
            });
        }

        await query('DELETE FROM cadastros WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Cadastro deletado com sucesso',
            id: id
        });

    } catch (error) {
        console.error('Erro ao deletar cadastro:', error);
        res.status(500).json({
            error: 'Erro ao deletar cadastro',
            details: error.message
        });
    }
};

// Estatísticas
exports.obterEstatisticas = async (req, res) => {
    try {
        const stats = await get(`
            SELECT 
                COUNT(*) as total_cadastros,
                COUNT(DISTINCT DATE(data_criacao)) as dias_com_cadastros,
                MIN(data_criacao) as primeiro_cadastro,
                MAX(data_criacao) as ultimo_cadastro
            FROM cadastros
        `);

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error('Erro ao obter estatísticas:', error);
        res.status(500).json({
            error: 'Erro ao obter estatísticas',
            details: error.message
        });
    }
};
