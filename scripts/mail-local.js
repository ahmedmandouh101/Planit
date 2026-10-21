const path = require('node:path');
const { spawn } = require('node:child_process');

const executable = process.env.MAILPIT_BIN || (process.platform === 'win32'
  ? path.join(__dirname, '..', '.local', 'mailpit', 'mailpit.exe')
  : 'mailpit');
const child = spawn(executable, ['--listen', '127.0.0.1:8025', '--smtp', '127.0.0.1:1025'], {
  stdio: 'inherit',
  windowsHide: true,
});
child.on('error', () => {
  console.error('Mailpit could not start. Install Mailpit or set MAILPIT_BIN to its executable path.');
  process.exitCode = 1;
});
child.on('exit', (code) => { process.exitCode = code || 0; });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
