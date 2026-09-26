// Compatibility launcher; npm run dev is the normal entry point.
require('./prepare-content.cjs');
const child=require('node:child_process').spawn(process.execPath,[require.resolve('next/dist/bin/next'),'dev','--webpack','-H','127.0.0.1','-p','8765'],{stdio:'inherit'});
child.on('exit',code=>process.exit(code||0));
