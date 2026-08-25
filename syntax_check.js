const ts = require('typescript');
const fs = require('fs');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node syntax_check.js App.js');
  process.exit(1);
}

const src = fs.readFileSync(filePath, 'utf8');

const result = ts.transpileModule(src, {
  compilerOptions: {
    jsx: ts.JsxEmit.React,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    allowJs: true,
  },
  reportDiagnostics: true,
});

if (result.diagnostics && result.diagnostics.length > 0) {
  console.log(`Found ${result.diagnostics.length} syntax issue(s):\n`);
  for (const d of result.diagnostics) {
    if (d.file) {
      const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
      const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
      console.log(`Line ${line + 1}, Col ${character + 1}: ${msg}`);
    } else {
      console.log(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    }
  }
  process.exit(1);
} else {
  console.log('No syntax errors found — file parses cleanly as JSX/JS.');
  process.exit(0);
}