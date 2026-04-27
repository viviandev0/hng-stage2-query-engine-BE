const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.get('/github/callback', authController.githubCallback);
router.post('/refresh', authController.refreshToken); // New
router.post('/logout', authController.logout);       // New

module.exports = router;