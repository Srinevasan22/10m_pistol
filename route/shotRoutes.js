const express = require('express');
const router = express.Router();
const { addShot, getShotsBySession } = require('../controller/shotController');

router.post('/shots', addShot);
router.get('/sessions/:id/shots', getShotsBySession);

module.exports = router;
