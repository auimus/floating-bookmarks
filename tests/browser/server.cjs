const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),name=url.pathname;
  if(name==='/_favicon/'){
    const page=url.searchParams.get('pageUrl');
    if(page==='https://broken.example/'){res.setHeader('Content-Type','image/png');res.end('invalid-image-fixture');return;}
    const demoHost=URL.canParse(page)?new URL(page).hostname:'';
    const demoIcons={
      'inspiration.example':['#4263c7','<path d="m8 22 8-14 8 14Z"/>'],
      'palette.example':['#9464b4','<circle cx="12" cy="13" r="4"/><circle cx="21" cy="13" r="4"/><circle cx="16" cy="21" r="4"/>'],
      'icons.example':['#348c82','<rect x="8" y="8" width="6" height="6"/><rect x="18" y="8" width="6" height="6"/><rect x="8" y="18" width="6" height="6"/><rect x="18" y="18" width="6" height="6"/>'],
      'type.example':['#b27543','<path d="M8 9h16v3h-6v12h-4V12H8Z"/>'],
      'motion.example':['#b8536d','<path d="m9 8 15 8-15 8Z"/>']
    };
    if(demoIcons[demoHost]){
      const [color,shape]=demoIcons[demoHost];
      res.setHeader('Content-Type','image/svg+xml');
      res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${color}"/><g fill="#fff">${shape}</g></svg>`);return;
    }
    res.setHeader('Content-Type','image/png');fs.createReadStream(path.join(root,'icons/icon32.png')).pipe(res);return;
  }
  if(name==='/test-result'&&req.method==='POST'){
    let body='';req.on('data',chunk=>{body+=chunk;});req.on('end',()=>{
      try{const result=JSON.parse(body);if(!['bar','popup'].includes(result.suite))throw Error('invalid suite');const dir=path.join(__dirname,'results');fs.mkdirSync(dir,{recursive:true});const target=path.join(dir,`result-${result.suite}-${String(result.run).replace(/[^a-z0-9-]/gi,'')}.json`);fs.writeFileSync(target,JSON.stringify(result,null,2));res.end('ok');}catch{res.writeHead(400).end();}
    });return;
  }
  const extras={'/fixture.js':'fixture.js','/readme-data.js':'readme-data.js','/preview-state.js':'preview-state.js','/ui-check.js':'ui-check.js','/motion-check.js':'motion-check.js','/layout-check.js':'layout-check.js','/preview-motion-check.js':'preview-motion-check.js'};
  let file=name==='/'?path.join(__dirname,'harness.html'):extras[name]?path.join(__dirname,extras[name]):path.join(root,name);
  if(!file.startsWith(root)&&file!==path.join(__dirname,'harness.html')&&!Object.values(extras).some(f=>file===path.join(__dirname,f))){res.writeHead(403).end();return;}
  fs.readFile(file,(err,bytes)=>{
    if(err){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');
    if(name==='/fixture.js')bytes=Buffer.from(`${bytes.toString()}\nfixture.manifest=${fs.readFileSync(path.join(root,'manifest.json'),'utf8')};\n`);
    const readmeDemo=url.searchParams.get('demo')==='readme';
    if(name==='/popup.html')bytes=Buffer.from(bytes.toString().replace('<script src="popup.js" defer>', `<script src="fixture.js" defer></script>${readmeDemo?'<script src="readme-data.js" defer></script>':''}<script src="popup.js" defer>`));
    if(name==='/'&&readmeDemo)bytes=Buffer.from(bytes.toString().replace('<script src="/fixture.js"></script>','<script src="/fixture.js"></script><script src="/readme-data.js"></script>'));
    if((name==='/'||name==='/popup.html')&&!readmeDemo)bytes=Buffer.from(bytes.toString().replace('</body>','<script src="/preview-state.js"></script></body>').replace('</html>','<script src="/preview-state.js"></script></html>'));
    if(url.searchParams.get('state')==='verify')bytes=Buffer.from(bytes.toString().replace('</html>','<script src="/ui-check.js"></script></html>'));
    if(url.searchParams.get('state')==='motion-verify')bytes=Buffer.from(bytes.toString().replace('</html>','<script src="/motion-check.js"></script></html>'));
    if(url.searchParams.get('state')==='layout-verify')bytes=Buffer.from(bytes.toString().replace('</html>','<script src="/layout-check.js"></script></html>'));
    if(url.searchParams.get('state')==='preview-motion-verify')bytes=Buffer.from(bytes.toString().replace('</html>','<script src="/preview-motion-check.js"></script></html>'));
    res.end(bytes);
  });
}).listen(0,'127.0.0.1',()=>console.log('Verification harness http://127.0.0.1:'+server.address().port));
