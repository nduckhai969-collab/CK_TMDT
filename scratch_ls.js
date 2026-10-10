const fs = require('fs');
const path = require('path');
const htmlFiles = fs.readdirSync('d:/K1_N4/CK_TMDT-main/Frontend').filter(f => f.endsWith('.html'));
console.log(htmlFiles);
