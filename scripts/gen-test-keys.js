#!/usr/bin/env node
/* 本地生成一对 RSA 测试密钥，用于模拟支付宝异步通知（验证支付回调链路） */
const crypto = require('crypto');
const fs = require('fs');
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
fs.writeFileSync('/tmp/pay-test-priv.pem', privateKey);
fs.writeFileSync('/tmp/pay-test-pub.pem', publicKey);
console.log('已生成 /tmp/pay-test-priv.pem 与 /tmp/pay-test-pub.pem');
