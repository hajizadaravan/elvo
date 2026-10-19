// Load the browser UMD build as CommonJS, even though package.json uses "type": "module".
const fs = require('node:fs');
const path = require('node:path');

module.exports = function loadTf() {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../vendor/tf.min.js'), 'utf8');
  new Function('module', 'exports', 'require', source)(module, module.exports, require);
  return module.exports;
};
