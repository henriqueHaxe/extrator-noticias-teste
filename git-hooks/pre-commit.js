const { execSync } = require('child_process');

console.log('🛡️  Executando protocolo de segurança contra vazamento de chaves...');

try {
  // Path to Git executable on Windows
  const gitPath = 'C:\\Program Files\\Git\\cmd\\git.exe';
  
  // Get staged diff
  const diff = execSync(`"${gitPath}" diff --cached`, { encoding: 'utf-8' });

  // API Key regex patterns
  const patterns = [
    /AIzaSy[A-Za-z0-9_\-]{35}/,  // Google AI Studio API key
    /AQ\.[A-Za-z0-9_\-]{30,}/   // New key format pattern
  ];

  const lines = diff.split('\n');
  let hasLeakedKey = false;

  for (let line of lines) {
    // Inspect only lines added (starting with '+' but not '+++')
    if (line.startsWith('+') && !line.startsWith('+++')) {
      for (const pattern of patterns) {
        if (pattern.test(line)) {
          console.error(`\n❌ ERRO DE SEGURANÇA: Chave de API detectada nas alterações preparadas (staged)!`);
          console.error(`Linha com problema: ${line.substring(0, 45)}...`);
          console.error(`O commit foi BLOQUEADO pelo protocolo para evitar vazamentos no GitHub.`);
          hasLeakedKey = true;
          break;
        }
      }
    }
    if (hasLeakedKey) break;
  }

  if (hasLeakedKey) {
    process.exit(1); // Block commit
  } else {
    console.log('✅ Nenhuma chave de API detectada. Código seguro para commit.');
    process.exit(0);
  }

} catch (error) {
  // Fail-safe: if diff fails (e.g., initial empty commit or Git commands issue), allow commit to proceed
  process.exit(0);
}
