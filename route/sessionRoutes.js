const express = require('express');
const router = express.Router();
const { addSession, getSessions } = require('../controller/sessionController');

router.post('/sessions', addSession);
router.get('/sessions', getSessions);

module.exports = router;
