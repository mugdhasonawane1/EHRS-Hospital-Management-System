'use strict';

const express = require('express');
const controller = require('../controllers/auth.controller');
const { validate } = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const schemas = require('../validators/auth.validator');

const router = express.Router();

router.post('/register', validate({ body: schemas.registerSchema }), controller.register);
router.post('/login', validate({ body: schemas.loginSchema }), controller.login);
router.post('/refresh', validate({ body: schemas.refreshSchema }), controller.refresh);

router.get('/me', authenticate, controller.me);
router.post('/logout', authenticate, controller.logout);
router.patch(
  '/password',
  authenticate,
  validate({ body: schemas.changePasswordSchema }),
  controller.changePassword
);

module.exports = router;
