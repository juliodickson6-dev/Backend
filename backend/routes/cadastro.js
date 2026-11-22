const express = require('express');
const router = express.Router();
const cadastroController = require('../controllers/cadastroController');

// Rotas de leitura/alteração de dados pessoais exigem token administrativo.
function exigirTokenAdmin(req, res, next) {
    const tokenConfigurado = process.env.ADMIN_API_TOKEN;
    if (!tokenConfigurado) {
        return res.status(503).json({ error: 'Acesso administrativo não configurado no servidor.' });
    }
    const recebido = (req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!recebido || recebido !== tokenConfigurado) {
        return res.status(401).json({ error: 'Autorização administrativa inválida.' });
    }
    next();
}

router.post('/criar', cadastroController.criarCadastro);
router.get('/listar', exigirTokenAdmin, cadastroController.listarCadastros);
router.get('/estatisticas', exigirTokenAdmin, cadastroController.obterEstatisticas);
router.get('/:id', exigirTokenAdmin, cadastroController.obterCadastro);
router.put('/:id', exigirTokenAdmin, cadastroController.atualizarCadastro);
router.delete('/:id', exigirTokenAdmin, cadastroController.deletarCadastro);

module.exports = router;
