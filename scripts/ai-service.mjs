// Starts the Python AI service with its virtualenv if one exists (Windows or macOS/Linux layout).
// No --reload: on Windows it can leave an orphaned worker serving old code. Restart npm run dev after Python edits.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../ai-service/', import.meta.url));
const python = [`${dir}.venv/Scripts/python.exe`, `${dir}.venv/bin/python`].find(existsSync) ?? (process.platform === 'win32' ? 'python' : 'python3');
const args = process.argv[2] === 'test' ? ['-m', 'pytest', '-q'] : ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', process.env.AI_PORT ?? '8000'];
spawn(python, args, { cwd: dir, stdio: 'inherit' }).on('exit', code => process.exit(code ?? 1));
