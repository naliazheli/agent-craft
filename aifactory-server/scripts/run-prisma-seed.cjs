const path = require('node:path');
const tsNode = require('ts-node');

tsNode.register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    target: 'es2021',
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
  },
});

require(path.join(__dirname, '..', 'prisma', 'seed.ts'));
