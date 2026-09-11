// write-demo.js — Genera demo.json con el flag indicado
// Uso: node write-demo.js true|false
const fs = require('fs');
const demo = process.argv[2] === 'true';
fs.writeFileSync('pos-system/demo.json', JSON.stringify({ demo }));
console.log('demo.json escrito:', { demo });
