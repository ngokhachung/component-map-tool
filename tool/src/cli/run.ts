import { runCli } from './index.js';

const result = runCli(process.argv.slice(2));
for (const line of result.lines) console.log(line);
process.exit(result.code);
